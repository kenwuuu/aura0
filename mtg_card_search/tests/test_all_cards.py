import asyncio
import json
import os
import sys
from pathlib import Path
from urllib.parse import quote

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import block_store  # noqa: E402

# The full-dataset fidelity walk (Tier 2). Configurable via env so CI can point
# it at cached data + a server it starts; defaults keep the manual
# `python3 tests/test_all_cards.py` workflow from README working unchanged.
BASE_URL = os.environ.get("CARD_API_BASE_URL", "http://localhost:8000")
# `CARD_NDJSON_PATH` is still honored so an existing invocation doesn't break.
DATA_PATH = os.environ.get(
    "CARD_DATA_PATH",
    os.environ.get(
        "CARD_NDJSON_PATH",
        str(Path(__file__).resolve().parent.parent / "cards"
            / f"all_cards{block_store.DATA_EXT}"),
    ),
)
API_ENDPOINT = "/v1/cards/"


async def test_all_cards():
    failures = []

    # Streamed, not read into a list: all_cards is 2.86 GB uncompressed and
    # slurping it would cost more memory than the server under test.
    async with httpx.AsyncClient(base_url=BASE_URL) as client:
        for i, (_voffset, raw) in enumerate(block_store.iter_lines(Path(DATA_PATH))):
            if not raw.strip():
                continue

            card = json.loads(raw)
            if card["layout"] == "art_series":
                continue

            name = await removeDoubleSlashes(card)
            set_name = card["set"]
            set_code = card["collector_number"]

            # --- call 1: look up by name ---
            try:
                r = await client.get(f"/v1/cards/{quote(name, safe='')}")
                if r.status_code != 200:
                    failures.append({
                        "card": name,
                        "call": "name",
                        "encoded_name": quote(name, safe=""),
                        "status": r.status_code,
                        "body": r.text,
                    })
            except Exception as e:
                print(card)
                failures.append({"card": name, "call": "name", "error": str(e)})

            # --- call 2: look up by set name + code ---
            try:
                r = await client.get(f"/v1/cards/{quote(set_name + set_code, safe='')}")
                if r.status_code != 200:
                    failures.append({
                        "card": name,
                        "call": "set/code",
                        "set": set_name,
                        "code": set_code,
                        "status": r.status_code,
                        "body": r.text,
                    })
            except Exception as e:
                print(card)
                failures.append({"card": name, "call": "set/code", "error": str(e)})

            if (i + 1) % 1000 == 0:
                print(f"  {i + 1} cards tested, {len(failures)} failures so far...")

    return failures


async def removeDoubleSlashes(card):
    name_parts: [str] = card["name"].split(' ')
    slash_index = name_parts.index('//') if '//' in name_parts else len(name_parts)
    name = ' '.join(name_parts[:slash_index])
    return name


def main():
    print("Starting card API tests...")
    failures = asyncio.run(test_all_cards())

    print(f"\n{'='*50}")
    if not failures:
        print("All cards passed.")
    else:
        print(f"{len(failures)} failure(s):\n")
        for f in failures:
            print(f)

    print(f"{'='*50}")
    # Non-zero exit so CI (the nightly Tier-2 job) fails on any lookup regression.
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()