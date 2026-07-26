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

The API loads the prebuilt trie (`RecordTrie.load`) instead of rebuilding it from
the multi-GB NDJSON, so it starts in ~seconds. marisa is a *succinct* structure —
even a few hundred thousand keys is only single-digit MB, an order of magnitude
smaller than the equivalent Python dict — so the loaded trie is effectively off
the heap for our purposes. (We deliberately do NOT `mmap` it: marisa's mmap
teardown segfaults at interpreter shutdown on Linux, and at this scale the RSS
saving over `load` isn't worth that fragility.)

Build and load are always co-located on one host (data_updater and the API run on
the same droplet; the API's fallback build writes what it then reads), so the
native-endian `offsets` array is always consistent.
"""
from __future__ import annotations

import json
import logging
import os
import unicodedata
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


# Bump this whenever the key schema changes — which keys `default_key_extractor`
# yields, how `normalize_key` folds them, or which card wins a contested key.
#
# A prebuilt index is otherwise only invalidated by the NDJSON's mtime/size, so a
# key-schema change would ship against a stale trie and the new keys would simply
# never exist — the change appearing to do nothing. Versioning the schema makes
# the artifacts self-invalidating.
#
# v2: also index the full "Front // Back" name of two-faced cards.
# v3: fold diacritics in normalize_key; English printings win contested keys.
KEY_SCHEMA_VERSION = 3


def normalize_key(raw: str) -> str:
    """Fold a card name to its lookup key: diacritic-, case- and space-insensitive.

    Dropping accents is what makes localized names actually reachable. Scryfall
    stores `printed_name` exactly as printed — `Planície`, `Pântano`, `Itzquinth,
    Primogênito de Gishath` — but players type what their keyboard gives them, and
    the Portuguese decklists in #173 are full of bare `Planicie` / `Pantano`. This
    runs on both the build and the query side (`api.lookup` normalizes the
    incoming id through here), so the two spellings collapse to one key. It buys
    the same thing for English names players can't easily type: `Juzam Djinn`,
    `Jotun Grunt`, `Lim-Dul the Necromancer`.

    Measured on the real all_cards dataset, folding merges no two distinct
    English card names that weren't already merged by the space-stripping above
    it (the one pre-existing collision is `Waste Land` / `Wasteland`).
    """
    decomposed = unicodedata.normalize("NFKD", raw)
    unaccented = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return unaccented.strip().lower().replace(" ", "")


def default_should_skip(data: dict) -> bool:
    # Art cards (e.g. art_series printings) are not legal cards — don't index them.
    return data.get("layout") == "art_series"


def default_is_preferred_printing(data: dict) -> bool:
    """Whether this card should win a key another card also claims.

    Matters because of the `all_cards` dataset (every card in every language,
    which is how #173's localized names get indexed at all): a non-English
    printing carries the *English* `name` alongside its localized `printed_name`,
    so every printing of Sol Ring in all 19 languages claims the key `solring`.
    First-wins alone hands that key to whichever language the file happens to
    list first — measured on the real dataset, English lost most of them, so a
    plain English lookup came back as a French or Japanese card (foreign image,
    foreign `printed_name`). That is ~all of our traffic, so English wins ties;
    localized names, which no English printing claims, are unaffected.
    """
    return data.get("lang") == "en"


def default_key_extractor(data: dict) -> Iterable[str]:
    """Scryfall-schema keys: name (both faces), flavor_name, printed_name, set+collector."""
    name = data["name"]
    yield normalize_key(name.split(" // ")[0])

    # Two-faced cards (transform, modal, split, Adventure) carry a "Front // Back"
    # name, and deck exporters disagree about which form they write — Moxfield
    # emits the full name, others only the front face. Indexing the front face
    # alone means a list that spells out "Brazen Borrower // Petty Theft" 404s
    # here and silently falls through to Scryfall, which reads as an index-coverage
    # gap in our telemetry. Accept both spellings.
    if " // " in name:
        yield normalize_key(name)

    flavor = normalize_key(data.get("flavor_name", ""))
    if flavor:
        yield flavor
    printed = normalize_key(data.get("printed_name", ""))
    if printed:
        yield printed
    yield normalize_key(f'{data["set"]}{data["collector_number"]}')


SkipFn = Callable[[dict], bool]
KeyFn = Callable[[dict], Iterable[str]]
PreferFn = Callable[[dict], bool]


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
    is_preferred: PreferFn = default_is_preferred_printing,
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
    # Keys already claimed by a preferred (English) printing. Holds the same
    # string objects as `key_to_offset`, so it costs a hash table and no new
    # strings — worth it to keep this a single pass over a multi-GB file.
    preferred_keys: set[str] = set()
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
            preferred = is_preferred(data)
            for key in extract_keys(data):
                # First-wins within a tier, but a preferred printing outranks a
                # non-preferred incumbent (see default_is_preferred_printing).
                if preferred:
                    if key not in preferred_keys:
                        key_to_offset[key] = offset
                        preferred_keys.add(key)
                elif key not in key_to_offset:
                    key_to_offset[key] = offset

    del preferred_keys  # release before marisa's build allocates

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
        "key_schema_version": KEY_SCHEMA_VERSION,
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
    """A loaded dataset (trie + per-card offsets + source generation).

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
    """Fresh means: built from *this* NDJSON, and by *this* key schema.

    Checking the source alone would let a `default_key_extractor` change load a
    trie that predates it — the new keys would silently 404.
    """
    try:
        meta = json.loads(meta_path.read_text())
        st = ndjson_path.stat()
        return (
            meta.get("source_mtime_ns") == st.st_mtime_ns
            and meta.get("source_size") == st.st_size
            and meta.get("key_schema_version") == KEY_SCHEMA_VERSION
        )
    except (OSError, json.JSONDecodeError):
        return False


def load_dataset(
    data_dir: Path,
    name: str,
    *,
    should_skip: SkipFn = default_should_skip,
    extract_keys: KeyFn = default_key_extractor,
    is_preferred: PreferFn = default_is_preferred_printing,
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
        build_artifacts(
            data_dir,
            name,
            should_skip=should_skip,
            extract_keys=extract_keys,
            is_preferred=is_preferred,
        )

    trie = marisa_trie.RecordTrie(TRIE_FMT)
    # load (not mmap): mmap'd marisa tries segfault at interpreter shutdown on
    # Linux, and the trie is only single-digit MB, so loading it is fine.
    trie.load(str(marisa_path))

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
