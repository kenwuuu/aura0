"""Prebuilt, memory-mapped card index — the single source of truth for how the
service turns an NDJSON dataset into fast lookups.

Both `data_updater.py` (the offline build) and `api.py` (mmap load + a one-time
fallback build) import from here, so the way keys are extracted and the way the
index is built/read can never drift.

On-disk layout, per dataset ``<name>`` in the data dir:

    <name>.ndjson       source rows (owned by data_updater)
    <name>.marisa       marisa RecordTrie: normalized key -> (byte offset,)
    <name>.offsets      packed uint64 byte offsets, one per indexed card (random)
    <name>.index.json   meta: entry/card counts + source identity (generation)

The trie is *mmap-loaded* (near-zero RSS; the OS page cache owns it), so the API
never holds the index on the Python heap and starts in ~seconds instead of
rebuilding it from the multi-GB NDJSON. Because build and load live in one module,
`data_updater` builds the artifacts offline and the API only maps them.

Build and load are always co-located on one host (data_updater and the API run on
the same droplet; the API's fallback build writes what it then reads), so the
native-endian `offsets` array is always consistent.
"""
from __future__ import annotations

import json
import logging
import os
from array import array
from dataclasses import dataclass
from pathlib import Path
from time import perf_counter
from typing import Callable, Iterable, Optional

import marisa_trie

logger = logging.getLogger(__name__)

# One unsigned 64-bit byte offset per key (future-proof past a 2 GB NDJSON).
TRIE_FMT = "<Q"
OFFSETS_TYPECODE = "Q"


def normalize_key(raw: str) -> str:
    return raw.strip().lower().replace(" ", "")


def default_should_skip(data: dict) -> bool:
    # Art cards (e.g. art_series printings) are not legal cards — don't index them.
    return data.get("layout") == "art_series"


def default_key_extractor(data: dict) -> Iterable[str]:
    """Scryfall-schema keys: name, flavor_name, printed_name, set+collector."""
    yield normalize_key(data["name"].split(" // ")[0])
    flavor = normalize_key(data.get("flavor_name", ""))
    if flavor:
        yield flavor
    printed = normalize_key(data.get("printed_name", ""))
    if printed:
        yield printed
    yield normalize_key(f'{data["set"]}{data["collector_number"]}')


SkipFn = Callable[[dict], bool]
KeyFn = Callable[[dict], Iterable[str]]


def artifact_paths(data_dir: Path, name: str):
    """(ndjson, marisa, offsets, meta) paths for a dataset."""
    return (
        data_dir / f"{name}.ndjson",
        data_dir / f"{name}.marisa",
        data_dir / f"{name}.offsets",
        data_dir / f"{name}.index.json",
    )


def build_artifacts(
    data_dir: Path,
    name: str,
    *,
    should_skip: SkipFn = default_should_skip,
    extract_keys: KeyFn = default_key_extractor,
) -> dict:
    """(Re)build the mmap artifacts for one dataset from its NDJSON.

    Each artifact is written to a ``*_new`` temp and then ``os.replace``d — the
    same atomic swap `data_updater` uses for the NDJSON — so a crashed or partial
    build never replaces good artifacts and a concurrent reader never sees half a
    file. The meta file is written LAST: its presence with a matching source
    identity is the signal that every artifact is ready.
    """
    ndjson_path, marisa_path, offsets_path, meta_path = artifact_paths(data_dir, name)
    start = perf_counter()

    key_to_offset: dict[str, int] = {}
    offsets = array(OFFSETS_TYPECODE)

    with ndjson_path.open("rb") as f:
        while True:
            offset = f.tell()
            line = f.readline()
            if not line:
                break
            data = json.loads(line)
            if should_skip(data):
                continue
            offsets.append(offset)
            for key in extract_keys(data):
                if key not in key_to_offset:  # first-wins, like the old in-RAM build
                    key_to_offset[key] = offset

    trie = marisa_trie.RecordTrie(
        TRIE_FMT, ((k, (v,)) for k, v in key_to_offset.items())
    )

    marisa_new = f"{marisa_path}_new"
    offsets_new = f"{offsets_path}_new"
    meta_new = f"{meta_path}_new"

    trie.save(marisa_new)
    with open(offsets_new, "wb") as f:
        offsets.tofile(f)

    st = ndjson_path.stat()
    meta = {
        "name": name,
        "entries": len(key_to_offset),
        "cards": len(offsets),
        "source_mtime_ns": st.st_mtime_ns,
        "source_size": st.st_size,
        # `generation` ties a loaded index to the exact NDJSON it was built from;
        # readers key their file handle on it (see api.get_handle).
        "generation": st.st_mtime_ns,
    }
    with open(meta_new, "w") as f:
        json.dump(meta, f)

    os.replace(marisa_new, marisa_path)
    os.replace(offsets_new, offsets_path)
    os.replace(meta_new, meta_path)  # last — the readiness signal

    logger.info(
        "[%s] built index: %d keys / %d cards in %.2fs",
        name, meta["entries"], meta["cards"], perf_counter() - start,
    )
    return meta


@dataclass
class Dataset:
    """A loaded, mmap-backed dataset.

    ``generation`` ties the NDJSON file handle to this exact index version, so a
    reader that snapshots one `Dataset` always reads offsets and file bytes from
    the same NDJSON generation — fixing the stale-handle bug where, after a data
    refresh, a cached handle seeked new offsets into the old (replaced) file.
    """
    name: str
    ndjson_path: Path
    trie: "marisa_trie.RecordTrie"
    offsets: array
    generation: int

    def get_offset(self, key: str) -> Optional[int]:
        values = self.trie.get(key)
        return values[0][0] if values else None


def _is_fresh(meta_path: Path, ndjson_path: Path) -> bool:
    try:
        meta = json.loads(meta_path.read_text())
        st = ndjson_path.stat()
        return (
            meta.get("source_mtime_ns") == st.st_mtime_ns
            and meta.get("source_size") == st.st_size
        )
    except (OSError, json.JSONDecodeError):
        return False


def load_dataset(
    data_dir: Path,
    name: str,
    *,
    should_skip: SkipFn = default_should_skip,
    extract_keys: KeyFn = default_key_extractor,
) -> Dataset:
    """Load a dataset's mmap index.

    If the prebuilt artifacts are missing or stale versus the NDJSON, build them
    once in-process (slow, and logged loudly) rather than hard-failing — so a
    fresh deploy or a rollback that predates a `data_updater --build-index` still
    comes up; it's just slow that one time.
    """
    ndjson_path, marisa_path, offsets_path, meta_path = artifact_paths(data_dir, name)
    if not ndjson_path.exists():
        raise FileNotFoundError(f"NDJSON not found for dataset {name!r}: {ndjson_path}")

    present = marisa_path.exists() and offsets_path.exists() and meta_path.exists()
    if not present or not _is_fresh(meta_path, ndjson_path):
        logger.warning(
            "[%s] prebuilt index missing or stale — building in-process "
            "(one-time and slow; run `data_updater.py --build-index` to avoid this).",
            name,
        )
        build_artifacts(data_dir, name, should_skip=should_skip, extract_keys=extract_keys)

    trie = marisa_trie.RecordTrie(TRIE_FMT)
    trie.mmap(str(marisa_path))

    offsets = array(OFFSETS_TYPECODE)
    with offsets_path.open("rb") as f:
        offsets.frombytes(f.read())

    meta = json.loads(meta_path.read_text())
    return Dataset(
        name=name,
        ndjson_path=ndjson_path,
        trie=trie,
        offsets=offsets,
        generation=meta["generation"],
    )
