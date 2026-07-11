#!/usr/bin/env python3
"""Generate the committed test fixture from the real Scryfall dataset.

The lookup contract is "every real card resolves" — a fabricated fixture can't
represent that, so this samples the *real* `default_cards.ndjson` instead. It
takes a stratified slice: at least a few real cards of every `layout` (so the
`art_series` skip and every dfc/split/meld/etc. path is exercised), plus cards
that carry the rarer keying fields (`flavor_name`, `printed_name`), `//` names,
and a duplicate-normalized-name pair (so first-wins is testable).

The selected lines are written verbatim (byte-identical to the source) so the
fixture stays a faithful Scryfall object, not a re-serialized approximation.

Rerun only when Scryfall introduces a new layout (rare — a few times a year):

    python3 scripts/make_fixture.py \
        --input cards/default_cards.ndjson \
        --output tests/fixtures/sample_cards.ndjson

Defaults resolve relative to the service root, so a bare `python3
scripts/make_fixture.py` works from a checkout that has `cards/` populated.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_INPUT = SERVICE_ROOT / "cards" / "default_cards.ndjson"
DEFAULT_OUTPUT = SERVICE_ROOT / "tests" / "fixtures" / "sample_cards.ndjson"

# How many cards to keep per layout, and per edge-case bucket. Small on purpose:
# the fixture is the fast, hermetic PR gate, not the full-dataset walk (that's
# the nightly Tier-2 job against the real file).
PER_LAYOUT = 3
PER_EDGE = 4


def normalize_name(card: dict) -> str:
    """Mirror api/card_index name keying closely enough to detect dup keys."""
    return card["name"].split(" // ")[0].strip().lower().replace(" ", "")


def make_fixture(input_path: Path, output_path: Path) -> None:
    # Preserve first-seen file order for determinism; dedupe by Scryfall id.
    selected: dict[str, str] = {}          # id -> raw line
    layout_counts: dict[str, int] = {}
    flavor_kept = 0
    printed_kept = 0
    slash_kept = 0

    # For a duplicate-normalized-name pair (two printings of one card): remember
    # the first line seen per normalized name, then when a second printing shows
    # up, pull both in — exactly the first-wins case the index must handle.
    first_line_by_name: dict[str, tuple[str, str]] = {}  # norm_name -> (id, line)
    dup_pair_done = False

    def keep(card_id: str, line: str) -> None:
        selected.setdefault(card_id, line)

    with input_path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\n")
            if not line:
                continue
            card = json.loads(line)
            card_id = card["id"]
            layout = card.get("layout", "normal")

            took = False
            if layout_counts.get(layout, 0) < PER_LAYOUT:
                layout_counts[layout] = layout_counts.get(layout, 0) + 1
                keep(card_id, line)
                took = True

            if not took and flavor_kept < PER_EDGE and card.get("flavor_name"):
                flavor_kept += 1
                keep(card_id, line)
                took = True
            if not took and printed_kept < PER_EDGE and card.get("printed_name"):
                printed_kept += 1
                keep(card_id, line)
                took = True
            if not took and slash_kept < PER_EDGE and " // " in card["name"]:
                slash_kept += 1
                keep(card_id, line)
                took = True

            # Duplicate-normalized-name pair (grab exactly one pair). Restrict to
            # indexed layouts — an art_series printing is skipped by the index, so
            # a pair involving one wouldn't exercise first-wins.
            if not dup_pair_done and layout != "art_series":
                norm = normalize_name(card)
                prev = first_line_by_name.get(norm)
                if prev is None:
                    first_line_by_name[norm] = (card_id, line)
                elif prev[0] != card_id:
                    keep(prev[0], prev[1])
                    keep(card_id, line)
                    dup_pair_done = True

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as out:
        for raw in selected.values():
            out.write(raw + "\n")

    print(f"Wrote {len(selected)} cards to {output_path}")
    print(f"Layouts covered ({len(layout_counts)}): "
          f"{', '.join(sorted(layout_counts))}")
    print(f"Edge cards — flavor_name: {flavor_kept}, printed_name: {printed_kept}, "
          f"'//': {slash_kept}, dup-name pair: {dup_pair_done}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    if not args.input.exists():
        raise SystemExit(
            f"Input not found: {args.input}\n"
            "Point --input at a populated default_cards.ndjson "
            "(run data_updater.py, or use the copy on the server)."
        )
    make_fixture(args.input, args.output)


if __name__ == "__main__":
    main()
