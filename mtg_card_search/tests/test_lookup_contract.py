"""Real-data lookup contract for the card-search API.

Drives the FastAPI app via TestClient against the committed stratified fixture
(`sample_cards.ndjson` — real Scryfall objects, every layout, edge-case keying
fields, a duplicate-name pair). This is the fast, hermetic PR gate; the full
115k-card walk is the nightly Tier-2 job (`test_all_cards.py`).

The assertions encode the contract the marisa refactor must preserve, so they
must be green on today's in-RAM implementation *and* after it.
"""
import json
from collections import defaultdict
from pathlib import Path
from urllib.parse import quote

import pytest
from fastapi.testclient import TestClient

# conftest.py has already put the service root on sys.path and pointed
# CARD_JSON_DIR / BULK_DATA_TYPES at this fixture before this import runs.
from api import app, limiter, normalize_key

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "sample_cards.ndjson"


def _load_cards():
    cards = []
    for line in FIXTURE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            cards.append(json.loads(line))
    return cards


CARDS = _load_cards()
INDEXED = [c for c in CARDS if c.get("layout") != "art_series"]
ART = [c for c in CARDS if c.get("layout") == "art_series"]


def name_key(card: dict) -> str:
    """First-face name key, mirroring api._default_key_extractor."""
    return normalize_key(card["name"].split(" // ")[0])


def set_key(card: dict) -> str:
    return normalize_key(f'{card["set"]}{card["collector_number"]}')


def get_card(client, key: str):
    return client.get(f"/v1/cards/{quote(key, safe='')}")


@pytest.fixture(scope="module")
def client():
    # Rate limiting (200/s single, 2/s bulk) would 429 the parametrized sweep;
    # it's transport policy, not lookup behavior, so switch it off for the suite.
    limiter.enabled = False
    with TestClient(app) as c:  # context-manager form runs the lifespan (index load)
        yield c


def test_fixture_covers_the_layout_spread():
    # Guardrail: keep the fixture representative of the real file's 24 layouts,
    # including the one the indexer must skip.
    layouts = {c.get("layout") for c in CARDS}
    assert "art_series" in layouts
    assert len(layouts) >= 20


@pytest.mark.parametrize("card", INDEXED, ids=lambda c: c["id"])
def test_indexed_card_resolves(client, card):
    # By set+collector (unique per printing) -> exactly this card.
    r = get_card(client, set_key(card))
    assert r.status_code == 200, f"{card['name']} [{card.get('layout')}] {set_key(card)} -> {r.status_code}"
    assert r.json()["id"] == card["id"]

    # By name -> found; a shared name may return a different printing (first-wins),
    # so assert on the name, not the id.
    r = get_card(client, name_key(card))
    assert r.status_code == 200
    assert name_key(r.json()) == name_key(card)


@pytest.mark.parametrize("card", ART, ids=lambda c: c["id"])
def test_art_series_is_skipped(client, card):
    # art_series is not indexed at all; its unique set+collector key must miss.
    assert get_card(client, set_key(card)).status_code == 404


def test_two_faced_cards_resolve_by_front_face(client):
    # Deck exporters disagree about how they spell a two-faced card: Moxfield emits
    # the full "Front // Back", others only the front face. The client normalizes to
    # the front face, and this is the route it uses — so the front face must resolve.
    two_faced = [c for c in INDEXED if " // " in c["name"]]
    assert two_faced, "fixture must include two-faced cards"

    for card in two_faced:
        r = get_card(client, name_key(card))
        assert r.status_code == 200, f'front face missed: {card["name"]!r}'
        assert name_key(r.json()) == name_key(card)


def test_two_faced_cards_are_also_indexed_under_their_full_name(client):
    # The full "Front // Back" spelling is indexed too, so a caller that sends it
    # verbatim still resolves. It has to be asserted through the *bulk* endpoint:
    # a normalized full name contains "//", and an encoded %2F is normalized back
    # into a path separator before routing, so GET /v1/cards/{card_id} can never
    # match it. (Same reason "SP//dr, Piloted by Peni" — a real card whose name
    # contains a literal "//" — is indexed but unreachable over the path route.)
    two_faced = [c for c in INDEXED if " // " in c["name"]]
    assert two_faced, "fixture must include two-faced cards"

    keys = [normalize_key(c["name"]) for c in two_faced]
    r = client.post("/v1/cards/bulk/lookup", json={"card_ids": keys})

    assert r.status_code == 200
    assert r.json()["not_found"] == [], "full two-faced names must be indexed"
    assert len(r.json()["results"]) == len(keys)


def test_flavor_and_printed_names_resolve(client):
    checked_flavor = checked_printed = 0
    for card in INDEXED:
        if card.get("flavor_name"):
            assert get_card(client, normalize_key(card["flavor_name"])).status_code == 200
            checked_flavor += 1
        if card.get("printed_name"):
            assert get_card(client, normalize_key(card["printed_name"])).status_code == 200
            checked_printed += 1
    # The fixture is built to include both; fail loudly if it stops doing so.
    assert checked_flavor > 0 and checked_printed > 0


def test_duplicate_name_is_first_wins(client):
    by_name = defaultdict(list)
    for c in INDEXED:  # fixture order == index build order
        by_name[name_key(c)].append(c)
    dupes = {k: v for k, v in by_name.items() if len(v) > 1}
    assert dupes, "fixture should contain a duplicate-name pair"

    key, printings = next(iter(dupes.items()))
    r = get_card(client, key)
    assert r.status_code == 200
    assert r.json()["id"] == printings[0]["id"]  # first-wins


def test_unknown_card_is_404(client):
    assert client.get("/v1/cards/this-card-does-not-exist-xyz").status_code == 404


def test_bulk_lookup_mixed_hit_and_miss(client):
    known = name_key(INDEXED[0])
    r = client.post(
        "/v1/cards/bulk/lookup",
        json={"card_ids": [known, "this-card-does-not-exist-xyz"]},
    )
    assert r.status_code == 200
    body = r.json()
    assert any(name_key(c) == known for c in body["results"])
    assert "this-card-does-not-exist-xyz" in body["not_found"]


def test_random_returns_distinct_cards(client):
    r = client.get("/v1/cards/random?n=5")
    assert r.status_code == 200
    results = r.json()["results"]
    assert len(results) == 5
    assert len({c["id"] for c in results}) == 5


def test_health_reports_loaded_entries(client):
    r = client.get("/v1/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] in ("ok", "degraded")
    assert any(d["entries"] > 0 for d in body["datasets"].values())
