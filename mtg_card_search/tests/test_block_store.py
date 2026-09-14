"""Unit tests for the block-compressed row store (block_store.py).

Most of these force a tiny block size so the data actually spans many blocks.
That is the case the format exists for and the one everything else is blind to:
with a default 256 KB block, every small fixture in the suite fits in block zero,
where a virtual offset degenerates into a plain intra-block offset and a broken
frame_start would still pass.
"""
import json
from pathlib import Path

import pytest

import block_store
import card_index

TINY = 64  # bytes: forces a new block every row or two


def write(path: Path, rows, block_bytes=TINY) -> list[int]:
    voffsets = []
    with path.open("wb") as raw:
        with block_store.BlockWriter(raw, block_bytes=block_bytes) as out:
            for r in rows:
                voffsets.append(out.add_line(json.dumps(r).encode("utf-8")))
    return voffsets


def rows(n):
    return [{"id": i, "name": f"Card {i}", "filler": "x" * (i % 40)} for i in range(n)]


# --- virtual offsets --------------------------------------------------------

def test_voffset_packs_and_unpacks():
    for frame_start, intra in [(0, 0), (1, 1), (4096, 255), (2**30, block_store.INTRA_MASK)]:
        assert block_store.unpack_voffset(
            block_store.pack_voffset(frame_start, intra)
        ) == (frame_start, intra)


def test_voffset_rejects_an_oversized_intra_offset():
    # The 24-bit field is what bounds a block to 16 MB; silently wrapping here
    # would corrupt every lookup in that block.
    with pytest.raises(ValueError, match="intra-block"):
        block_store.pack_voffset(0, block_store.INTRA_MASK + 1)


# --- round trip -------------------------------------------------------------

def test_every_row_reads_back_byte_identical_across_many_blocks(tmp_path):
    path = tmp_path / f"many{block_store.DATA_EXT}"
    data = rows(500)
    voffsets = write(path, data)

    # Sanity: this really did span a lot of blocks, or the test proves nothing.
    frame_starts = {block_store.unpack_voffset(v)[0] for v in voffsets}
    assert len(frame_starts) > 50, f"expected many blocks, got {len(frame_starts)}"

    reader = block_store.BlockReader(path)
    try:
        for expected, voffset in zip(data, voffsets):
            assert json.loads(reader.read_line(voffset)) == expected
    finally:
        reader.close()


def test_reads_are_order_independent(tmp_path):
    # Random access is the whole point: reading backwards must work as well as
    # forwards, and must not depend on what was read before.
    path = tmp_path / f"rand{block_store.DATA_EXT}"
    data = rows(200)
    voffsets = write(path, data)

    reader = block_store.BlockReader(path)
    try:
        for i in reversed(range(len(data))):
            assert json.loads(reader.read_line(voffsets[i])) == data[i]
        for i in (7, 7, 199, 0, 150, 7):
            assert json.loads(reader.read_line(voffsets[i])) == data[i]
    finally:
        reader.close()


def test_trailing_partial_block_is_flushed(tmp_path):
    # 3 rows will not fill a block; without the context manager's flush they'd
    # be silently dropped and the dataset would be short.
    path = tmp_path / f"tail{block_store.DATA_EXT}"
    data = rows(3)
    voffsets = write(path, data, block_bytes=1 << 20)
    assert len(list(block_store.iter_lines(path))) == 3
    reader = block_store.BlockReader(path)
    try:
        assert json.loads(reader.read_line(voffsets[-1])) == data[-1]
    finally:
        reader.close()


def test_iter_lines_matches_write_order_and_offsets(tmp_path):
    path = tmp_path / f"iter{block_store.DATA_EXT}"
    data = rows(300)
    voffsets = write(path, data)

    seen = list(block_store.iter_lines(path))
    assert [v for v, _ in seen] == voffsets
    assert [json.loads(line) for _, line in seen] == data


def test_add_line_is_newline_agnostic(tmp_path):
    path = tmp_path / f"nl{block_store.DATA_EXT}"
    with path.open("wb") as raw:
        with block_store.BlockWriter(raw, block_bytes=TINY) as out:
            out.add_line(b'{"id": 1}')       # no trailing newline
            out.add_line(b'{"id": 2}\n')     # with one
    assert [json.loads(line) for _, line in block_store.iter_lines(path)] == [
        {"id": 1}, {"id": 2},
    ]


# --- cache ------------------------------------------------------------------

def test_cache_returns_the_same_row_on_hit_and_miss(tmp_path):
    path = tmp_path / f"cache{block_store.DATA_EXT}"
    data = rows(300)
    voffsets = write(path, data)

    reader = block_store.BlockReader(path, cached_blocks=2)
    try:
        first = json.loads(reader.read_line(voffsets[5]))
        again = json.loads(reader.read_line(voffsets[5]))   # served from cache
        assert first == again == data[5]
        assert reader.hits >= 1

        # Evict it, then read it again — an evicted block must reload correctly,
        # not return a stale or truncated slice.
        for v in voffsets[100:160]:
            reader.read_line(v)
        assert json.loads(reader.read_line(voffsets[5])) == data[5]
    finally:
        reader.close()


def test_cache_is_bounded(tmp_path):
    path = tmp_path / f"bound{block_store.DATA_EXT}"
    voffsets = write(path, rows(300))
    reader = block_store.BlockReader(path, cached_blocks=3)
    try:
        for v in voffsets:
            reader.read_line(v)
        assert len(reader._cache) <= 3
    finally:
        reader.close()


# --- corruption -------------------------------------------------------------

def test_truncated_file_raises_rather_than_returning_junk(tmp_path):
    path = tmp_path / f"trunc{block_store.DATA_EXT}"
    write(path, rows(200))
    path.write_bytes(path.read_bytes()[:-30])
    with pytest.raises(Exception):
        list(block_store.iter_lines(path))


# --- integration with the index --------------------------------------------

def test_index_resolves_keys_across_block_boundaries(tmp_path):
    """The end-to-end guarantee: a key indexed from block N reads back from block N.

    Builds a real index over data spanning many blocks and checks every card,
    which is what catches a frame_start/intra mix-up that single-block fixtures
    cannot see.
    """
    cards = [
        {"id": str(i), "name": f"Testcard {i}", "set": "tst",
         "collector_number": str(i), "layout": "normal", "lang": "en"}
        for i in range(400)
    ]
    path = tmp_path / f"idx{block_store.DATA_EXT}"
    with path.open("wb") as raw:
        with block_store.BlockWriter(raw, block_bytes=TINY) as out:
            for c in cards:
                out.add_line(json.dumps(c).encode("utf-8"))

    card_index.build_artifacts(tmp_path, "idx")
    ds = card_index.load_dataset(tmp_path, "idx")
    reader = block_store.BlockReader(ds.data_path)
    try:
        for c in cards:
            by_name = ds.get_offset(card_index.normalize_key(c["name"]))
            assert by_name is not None, f"{c['name']} did not resolve"
            assert json.loads(reader.read_line(by_name))["id"] == c["id"]

            by_set = ds.get_offset(card_index.normalize_key(f"tst{c['collector_number']}"))
            assert json.loads(reader.read_line(by_set))["id"] == c["id"]
    finally:
        reader.close()
