"""Unit tests for the marisa index build/load mechanics (card_index.py).

These use small fabricated Scryfall-shaped rows because they test the *index
machinery* (offsets, first-wins, skip, atomic artifacts, staleness rebuild), not
the real-data lookup contract — that lives in test_lookup_contract.py against the
committed real fixture.
"""
import json
from pathlib import Path

import card_index

# id / name / set / collector_number / layout (+ optional flavor/printed name).
CARDS = [
    {"id": "a", "name": "Lightning Bolt", "set": "lea", "collector_number": "161", "layout": "normal"},
    {"id": "b", "name": "Lightning Bolt", "set": "m10", "collector_number": "146", "layout": "normal"},  # dup name
    {"id": "c", "name": "Fireball", "set": "lea", "collector_number": "140", "layout": "normal", "flavor_name": "Big Fire"},
    {"id": "d", "name": "Foxglove", "set": "abc", "collector_number": "1", "layout": "art_series"},        # skipped
    {"id": "e", "name": "Start // Finish", "set": "xyz", "collector_number": "5", "layout": "split"},       # // name
]


def write_ndjson(path: Path, cards) -> None:
    with path.open("w", encoding="utf-8") as f:
        for c in cards:
            f.write(json.dumps(c) + "\n")


def read_card_at(ndjson: Path, offset: int) -> dict:
    with ndjson.open("rb") as f:
        f.seek(offset)
        return json.loads(f.readline())


def build_and_load(tmp_path: Path, cards, name="mini"):
    write_ndjson(tmp_path / f"{name}.ndjson", cards)
    card_index.build_artifacts(tmp_path, name)
    return card_index.load_dataset(tmp_path, name)


def test_all_key_kinds_resolve_to_their_card(tmp_path):
    ds = build_and_load(tmp_path, CARDS)

    def card_for(key):
        offset = ds.get_offset(key)
        assert offset is not None, f"{key!r} did not resolve"
        return read_card_at(ds.ndjson_path, offset)

    assert card_for("fireball")["id"] == "c"          # name
    assert card_for("bigfire")["id"] == "c"           # flavor_name
    assert card_for("lea140")["id"] == "c"            # set + collector
    assert card_for("start")["id"] == "e"             # // -> first face only


def test_duplicate_name_is_first_wins(tmp_path):
    ds = build_and_load(tmp_path, CARDS)
    offset = ds.get_offset("lightningbolt")
    assert read_card_at(ds.ndjson_path, offset)["id"] == "a"  # first printing wins


def test_art_series_is_skipped(tmp_path):
    ds = build_and_load(tmp_path, CARDS)
    assert ds.get_offset("foxglove") is None
    assert ds.get_offset("abc1") is None              # its unique set key misses too
    # offsets holds one entry per *indexed* card (4 of 5; the art card is skipped).
    assert len(ds.offsets) == 4


def test_unknown_key_returns_none(tmp_path):
    ds = build_and_load(tmp_path, CARDS)
    assert ds.get_offset("nonexistentcard") is None


def test_build_writes_all_artifacts(tmp_path):
    write_ndjson(tmp_path / "mini.ndjson", CARDS)
    meta = card_index.build_artifacts(tmp_path, "mini")
    for suffix in (".marisa", ".offsets", ".index.json"):
        assert (tmp_path / f"mini{suffix}").exists()
    assert meta["cards"] == 4
    persisted = json.loads((tmp_path / "mini.index.json").read_text())
    assert persisted["entries"] == meta["entries"]      # meta on disk matches return
    assert meta["entries"] > 4                          # multiple keys per card


def test_load_rebuilds_when_ndjson_is_stale(tmp_path):
    # Build against one card, then change the NDJSON out from under the artifacts.
    ds = build_and_load(tmp_path, [CARDS[0]])
    assert ds.get_offset("fireball") is None

    write_ndjson(tmp_path / "mini.ndjson", CARDS)       # different size + mtime
    ds2 = card_index.load_dataset(tmp_path, "mini")     # must notice staleness and rebuild
    assert ds2.get_offset("fireball") is not None
    assert len(ds2.offsets) == 4
