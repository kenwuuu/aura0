# MTG Card Search

A small FastAPI service for fast Magic: The Gathering card lookups. It indexes
Scryfall bulk-data NDJSON files by byte offset in memory, then serves single and
bulk card lookups by name, flavor/printed name, or set + collector number.
`data_updater.py` refreshes the underlying data from Scryfall on a cron.

Requires Python 3.12+.

For provisioning a new server, deploying updates, and the alerting wired
around `data_updater.py`, see [SETUP.md](SETUP.md).

## Healh Check Endpoint
`https://digitalocean-ws-ipv4.aura0.app/v1/health`

## Running tests

`pytest tests/` is the fast, hermetic, no-network suite — run it routinely (and
CI runs it on every `mtg_card_search/**` PR, see
[`.github/workflows/card-search.yml`](../.github/workflows/card-search.yml)):
```
.venv/bin/python3 -m pytest tests/
```
It covers `test_data_updater.py` (lock, sanity-check, alerting no-op paths) and
`test_lookup_contract.py`, which drives the API against a committed **stratified
real fixture** (`tests/fixtures/sample_cards.ndjson` — real Scryfall objects, one
of every layout, edge-case keying fields, a duplicate-name pair). Regenerate the
fixture only when Scryfall adds a layout:
```
python3 scripts/make_fixture.py   # reads cards/default_cards.ndjson
```

`tests/test_all_cards.py` is the **full-dataset fidelity walk** — every card in
`CARD_JSON_DIR` hit against a running server. Slow, network-dependent, and
excluded from the fast suite; CI runs it nightly (advisory). Locally, start the
server first, then:
```
python3 tests/test_all_cards.py
```
It reads `CARD_API_BASE_URL` / `CARD_NDJSON_PATH` from the environment (defaults:
`http://localhost:8000`, `cards/default_cards.ndjson`) and exits non-zero on any
lookup failure.
