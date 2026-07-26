"""Block-compressed NDJSON with random access — the on-disk format the service
serves cards from.

WHY THIS EXISTS

`all_cards` (every printing in every language, which is what makes localized
decklists resolvable — see #173) is 2.86 GB as plain NDJSON, and a data refresh
needs the old file, the download, and the new file on disk at once: ~6.1 GB peak.
The production droplet does not have that, and growing it means downtime.

Card JSON compresses ~8x. Plain gzip can't be randomly seeked, but that is the
only thing we need from the file: the index resolves a name to a byte offset and
we read exactly one line. So the file is stored as a run of *independently*
compressed blocks — seek to a block, decompress just that block, slice out the
line. Measured on the real dataset: 2.86 GB -> 353 MB (8.1x), and blocking costs
essentially nothing versus a solid stream (Scryfall's own solid gzip is 7.4x).

FORMAT

    <name>.zndjson
        repeated, to EOF:
            uint32  little-endian length of the frame that follows
            bytes   zstd frame, decompressing to a whole number of NDJSON lines

A *virtual offset* addresses one line, packed into the same uint64 the marisa
index already stores — so `.marisa` and `.offsets` keep their exact shape and no
separate block-index file is needed. This is the trick BGZF uses:

    voffset = (frame_start << INTRA_BITS) | offset_of_line_within_block

`frame_start` is the byte offset of the uint32 header. With INTRA_BITS = 24 a
block may hold up to 16 MB uncompressed (we target 256 KB) and the file may
reach 1 TB — both far beyond anything Scryfall will ship.

WHY 256 KB / LEVEL 10

Measured across block sizes and levels on the real data: 256 KB at level 10 hits
8.1x, and going to level 19 buys 5% more for 45x the compression time. Bigger
blocks compress better (1 MB -> 9.4x) but cost proportionally more to decompress
for a single-line read, and 256 KB already reaches the point of diminishing
returns.
"""
from __future__ import annotations

import struct
from collections import OrderedDict
from pathlib import Path
from typing import BinaryIO, Iterator, Tuple

import zstandard as zstd

# Filename extension for a file in this format.
DATA_EXT = ".zndjson"

# Uncompressed bytes to accumulate before sealing a block. See module docstring.
BLOCK_TARGET_BYTES = 256 * 1024

# zstd compression level for stored blocks.
COMPRESSION_LEVEL = 10

# Bits of a virtual offset reserved for the position within a decompressed block.
INTRA_BITS = 24
INTRA_MASK = (1 << INTRA_BITS) - 1

# Ceiling on a decompressed block, used as zstd's `max_output_size`. A block is
# built to BLOCK_TARGET_BYTES plus at most one final line, so this is generous;
# it exists to bound allocation on a corrupt frame, not to size normal ones.
MAX_BLOCK_BYTES = 1 << INTRA_BITS

FRAME_HEADER = struct.Struct("<I")

# Decompressed blocks kept per reader. Readers are thread-local (see
# api.get_handle), so this multiplies by the server's thread count — keep it
# small. Consecutive cards in a bulk request often land in the same block, which
# is the case this pays for.
CACHED_BLOCKS = 4


def pack_voffset(frame_start: int, intra_offset: int) -> int:
    if intra_offset > INTRA_MASK:
        raise ValueError(
            f"line offset {intra_offset} exceeds the {INTRA_BITS}-bit intra-block "
            f"field; a block must stay under {MAX_BLOCK_BYTES} bytes uncompressed"
        )
    return (frame_start << INTRA_BITS) | intra_offset


def unpack_voffset(voffset: int) -> Tuple[int, int]:
    return voffset >> INTRA_BITS, voffset & INTRA_MASK


class BlockWriter:
    """Accumulates whole lines and seals them into compressed blocks.

    Use as a context manager so the trailing partial block is always flushed —
    dropping it would silently truncate the dataset.
    """

    def __init__(self, fileobj: BinaryIO, *, level: int = COMPRESSION_LEVEL,
                 block_bytes: int = BLOCK_TARGET_BYTES):
        self._out = fileobj
        self._compressor = zstd.ZstdCompressor(level=level)
        self._block_bytes = block_bytes
        self._buf = bytearray()
        self._frame_start = fileobj.tell()

    def add_line(self, line: bytes) -> int:
        """Append one NDJSON line (with or without its newline). Returns its
        virtual offset, which is final even though the block isn't sealed yet —
        `frame_start` is known and the line's position within the block is fixed."""
        if not line.endswith(b"\n"):
            line = line + b"\n"
        voffset = pack_voffset(self._frame_start, len(self._buf))
        self._buf += line
        if len(self._buf) >= self._block_bytes:
            self.flush()
        return voffset

    def flush(self) -> None:
        if not self._buf:
            return
        frame = self._compressor.compress(bytes(self._buf))
        self._out.write(FRAME_HEADER.pack(len(frame)))
        self._out.write(frame)
        self._buf = bytearray()
        self._frame_start = self._out.tell()

    def __enter__(self) -> "BlockWriter":
        return self

    def __exit__(self, *exc) -> None:
        self.flush()


def iter_lines(path: Path) -> Iterator[Tuple[int, bytes]]:
    """Yield (virtual offset, line without newline) for every line, in file order.

    This is the sequential read the index build uses; it decompresses each block
    exactly once, so building an index costs one pass and no seeking.
    """
    decompressor = zstd.ZstdDecompressor()
    with path.open("rb") as f:
        while True:
            frame_start = f.tell()
            header = f.read(FRAME_HEADER.size)
            if not header:
                return
            if len(header) < FRAME_HEADER.size:
                raise ValueError(f"{path}: truncated frame header at {frame_start}")
            (length,) = FRAME_HEADER.unpack(header)
            payload = f.read(length)
            if len(payload) < length:
                raise ValueError(f"{path}: truncated frame at {frame_start}")
            block = decompressor.decompress(payload, max_output_size=MAX_BLOCK_BYTES)
            intra = 0
            for line in block.splitlines(keepends=True):
                yield pack_voffset(frame_start, intra), line.rstrip(b"\n")
                intra += len(line)


class BlockReader:
    """Random access into a block-compressed file. NOT thread-safe — it owns a
    file position and a cache; give each thread its own (see api.get_handle)."""

    def __init__(self, path: Path, *, cached_blocks: int = CACHED_BLOCKS):
        self._path = path
        self._file = path.open("rb")
        self._decompressor = zstd.ZstdDecompressor()
        self._cache: "OrderedDict[int, bytes]" = OrderedDict()
        self._cached_blocks = cached_blocks
        self.hits = 0
        self.misses = 0

    @property
    def closed(self) -> bool:
        return self._file.closed

    def close(self) -> None:
        self._file.close()
        self._cache.clear()

    def _block(self, frame_start: int) -> bytes:
        cached = self._cache.get(frame_start)
        if cached is not None:
            self._cache.move_to_end(frame_start)
            self.hits += 1
            return cached
        self.misses += 1
        self._file.seek(frame_start)
        header = self._file.read(FRAME_HEADER.size)
        if len(header) < FRAME_HEADER.size:
            raise ValueError(f"{self._path}: no frame at {frame_start}")
        (length,) = FRAME_HEADER.unpack(header)
        block = self._decompressor.decompress(
            self._file.read(length), max_output_size=MAX_BLOCK_BYTES
        )
        self._cache[frame_start] = block
        if len(self._cache) > self._cached_blocks:
            self._cache.popitem(last=False)
        return block

    def read_line(self, voffset: int) -> bytes:
        """Return the single line addressed by *voffset*, without its newline."""
        frame_start, intra = unpack_voffset(voffset)
        block = self._block(frame_start)
        end = block.find(b"\n", intra)
        return block[intra:] if end == -1 else block[intra:end]
