"""Unit tests for the marisa index build/load mechanics (card_index.py).

These use small fabricated Scryfall-shaped rows because they test the *index
machinery* (offsets, first-wins, skip, atomic artifacts, staleness rebuild), not
the real-data lookup contract — that lives in test_lookup_contract.py against the
committed real fixture.
"""
import json
from pathlib import Path

import block_store
import card_index

# id / name / set / collector_number / layout (+ optional flavor/printed name).
CARDS = [
    {"id": "a", "name": "Lightning Bolt", "set": "lea", "collector_number": "161", "layout": "normal"},
    {"id": "b", "name": "Lightning Bolt", "set": "m10", "collector_number": "146", "layout": "normal"},  # dup name
    {"id": "c", "name": "Fireball", "set": "lea", "collector_number": "140", "layout": "normal", "flavor_name": "Big Fire"},
    {"id": "d", "name": "Foxglove", "set": "abc", "collector_number": "1", "layout": "art_series"},        # skipped
    {"id": "e", "name": "Start // Finish", "set": "xyz", "collector_number": "5", "layout": "split"},       # // name
]


def write_rows(path: Path, cards, *, block_bytes: int = block_store.BLOCK_TARGET_BYTES) -> None:
    """Write cards in the block-compressed format the service reads."""
    with path.open("wb") as raw:
        with block_store.BlockWriter(raw, block_bytes=block_bytes) as out:
            for c in cards:
                out.add_line(json.dumps(c).encode("utf-8"))


def data_path(tmp_path: Path, name: str = "mini") -> Path:
    return tmp_path / f"{name}{block_store.DATA_EXT}"


def read_card_at(path: Path, voffset: int) -> dict:
    reader = block_store.BlockReader(path)
    try:
        return json.loads(reader.read_line(voffset))
    finally:
        reader.close()


def build_and_load(tmp_path: Path, cards, name="mini"):
    write_rows(data_path(tmp_path, name), cards)
    card_index.build_artifacts(tmp_path, name)
    return card_index.load_dataset(tmp_path, name)


def test_all_key_kinds_resolve_to_their_card(tmp_path):
    ds = build_and_load(tmp_path, CARDS)

    def card_for(key):
        offset = ds.get_offset(key)
        assert offset is not None, f"{key!r} did not resolve"
        return read_card_at(ds.data_path, offset)

    assert card_for("fireball")["id"] == "c"          # name
    assert card_for("bigfire")["id"] == "c"           # flavor_name
    assert card_for("lea140")["id"] == "c"            # set + collector
    assert card_for("start")["id"] == "e"             # // -> first face only


def test_duplicate_name_is_first_wins(tmp_path):
    ds = build_and_load(tmp_path, CARDS)
    offset = ds.get_offset("lightningbolt")
    assert read_card_at(ds.data_path, offset)["id"] == "a"  # first printing wins


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
    write_rows(data_path(tmp_path), CARDS)
    meta = card_index.build_artifacts(tmp_path, "mini")
    for suffix in (".marisa", ".offsets", ".index.json"):
        assert (tmp_path / f"mini{suffix}").exists()
    assert meta["cards"] == 4
    persisted = json.loads((tmp_path / "mini.index.json").read_text())
    assert persisted["entries"] == meta["entries"]      # meta on disk matches return
    assert meta["entries"] > 4                          # multiple keys per card


def test_load_rebuilds_when_key_schema_version_is_older(tmp_path):
    """An index from an older schema must be rebuilt, not trusted.

    This is what makes bumping KEY_SCHEMA_VERSION actually do something. The
    artifacts carry no other marker of *how* they were built, so a stale-schema
    index looks perfectly fresh by mtime and size — and v3's values are plain
    byte offsets, which v4 would read as virtual offsets and resolve to garbage.
    """
    ds = build_and_load(tmp_path, CARDS)
    good = read_card_at(ds.data_path, ds.get_offset("fireball"))["id"]

    meta_path = tmp_path / "mini.index.json"
    meta = json.loads(meta_path.read_text())
    meta["key_schema_version"] = card_index.KEY_SCHEMA_VERSION - 1
    meta_path.write_text(json.dumps(meta))

    reloaded = card_index.load_dataset(tmp_path, "mini")
    assert json.loads(meta_path.read_text())["key_schema_version"] == (
        card_index.KEY_SCHEMA_VERSION
    ), "load must rebuild artifacts left by an older key schema"
    assert read_card_at(reloaded.data_path, reloaded.get_offset("fireball"))["id"] == good


def test_load_rebuilds_when_source_is_stale(tmp_path):
    # Build against one card, then change the data out from under the artifacts.
    ds = build_and_load(tmp_path, [CARDS[0]])
    assert ds.get_offset("fireball") is None

    write_rows(data_path(tmp_path), CARDS)       # different size + mtime
    ds2 = card_index.load_dataset(tmp_path, "mini")     # must notice staleness and rebuild
    assert ds2.get_offset("fireball") is not None
    assert len(ds2.offsets) == 4


# ---------------------------------------------------------------------------
# Multilingual keys — what the `all_cards` dataset (#173) needs to be correct.
# A non-English printing carries the English `name` AND a localized
# `printed_name`, so both spellings must resolve, and the English printing has to
# win the name they share.
# ---------------------------------------------------------------------------

MULTILINGUAL = [
    # The Portuguese printing is listed FIRST, so plain first-wins would hand
    # "swamp" to it and an English lookup would come back as a Portuguese card.
    {"id": "pt", "name": "Swamp", "printed_name": "Pântano", "lang": "pt",
     "set": "roe", "collector_number": "241", "layout": "normal"},
    {"id": "en", "name": "Swamp", "lang": "en",
     "set": "jmp", "collector_number": "68", "layout": "normal"},
    {"id": "es", "name": "Avacyn's Pilgrim", "printed_name": "Peregrino de Avacyn",
     "lang": "es", "set": "mic", "collector_number": "70", "layout": "normal"},
]


def test_english_printing_wins_a_contested_name(tmp_path):
    ds = build_and_load(tmp_path, MULTILINGUAL, name="multi")
    card = read_card_at(ds.data_path, ds.get_offset("swamp"))
    assert card["id"] == "en", "an English lookup must return the English printing"


def test_localized_printed_name_resolves(tmp_path):
    ds = build_and_load(tmp_path, MULTILINGUAL, name="multi")
    # No English printing claims these keys, so the localized rows keep them.
    assert read_card_at(ds.data_path, ds.get_offset("pantano"))["id"] == "pt"
    assert read_card_at(ds.data_path, ds.get_offset("peregrinodeavacyn"))["id"] == "es"


def test_normalize_key_folds_diacritics_case_and_spaces():
    # The decklists in #173 are typed without accents; Scryfall stores them with.
    assert card_index.normalize_key("Pântano") == card_index.normalize_key("Pantano")
    assert card_index.normalize_key("Planície") == "planicie"
    assert card_index.normalize_key("Itzquinth, Primogênito de Gishath") == (
        "itzquinth,primogenitodegishath"
    )
    # Same for English names players can't easily type.
    assert card_index.normalize_key("Juzám Djinn") == "juzamdjinn"
    # Pre-existing behavior is preserved.
    assert card_index.normalize_key("  Lightning Bolt ") == "lightningbolt"


def test_unaccented_spelling_resolves_an_accented_name(tmp_path):
    ds = build_and_load(tmp_path, MULTILINGUAL, name="multi")
    # "Pantano" (as typed) and "Pântano" (as printed) are the same lookup.
    assert ds.get_offset(card_index.normalize_key("Pantano")) is not None
    assert ds.get_offset(card_index.normalize_key("Pântano")) == ds.get_offset(
        card_index.normalize_key("Pantano")
    )


def test_is_preferred_printing_is_injectable(tmp_path):
    # The tie-break is a policy, not a hardcoded language check. English is listed
    # FIRST here, so a "prefer pt" policy can only win by actually overriding the
    # incumbent — first-wins alone would give this key to the English row.
    en_first = [MULTILINGUAL[1], MULTILINGUAL[0]]
    prefer_pt = lambda data: data.get("lang") == "pt"  # noqa: E731

    write_rows(data_path(tmp_path, "pref"), en_first)
    card_index.build_artifacts(tmp_path, "pref", is_preferred=prefer_pt)
    ds = card_index.load_dataset(tmp_path, "pref", is_preferred=prefer_pt)

    assert read_card_at(ds.data_path, ds.get_offset("swamp"))["id"] == "pt"
