#!/usr/bin/env python3
"""
Export real deck lists from PostHog into the parser's test corpus.

Every fixture under tests/fixtures/deck-imports/ is real text a real player
pasted. That matters: the parser's hard cases are all things no one would think
to invent — a commander header in curly quotes, a sideboard header followed by a
blank line, a command zone that never closes. The corpus is how we keep the
parser honest against formats we didn't imagine.

Presets:
    illegal-size       imports whose deck size is neither 60 nor 100 — the
                       population behind the "Illegal deck sizes" insight.
    commander-section  imports whose text carries a commander header. These are
                       where the command zone can swallow the deck, and most of
                       them import at a legal size, so no size-based insight can
                       see them.

Auth: a PostHog *personal* API key (`phx_...`) from POSTHOG_PERSONAL_API_KEY or
~/.posthog_key. Never pass it on the command line.

Usage:
    python3 scripts/export-deck-import-corpus.py --preset commander-section
"""

import argparse
import json
import os
import pathlib
import sys
import urllib.error
import urllib.request

PROJECT_ID = "476486"
HOST = "https://us.posthog.com"

# ClickHouse match() runs RE2. Backslashes are doubled because HogQL unescapes
# the string literal once before the regex engine ever sees it.
COMMANDER_HEADER = (
    r'(?im)^\\s*(//|#)?\\s*["“”‘’]*\\s*'
    r'(commander|commanders|command zone)'
    r'\\s*["“”‘’]*\\s*:?\\s*(\\(\\d+\\))?\\s*$'
)

PRESETS = {
    "illegal-size": "toInt(properties.card_count) NOT IN (60, 100)",
    "commander-section": f"match(properties.raw_text, '{COMMANDER_HEADER}')",
}


def load_key() -> str:
    key = os.environ.get("POSTHOG_PERSONAL_API_KEY")
    if key:
        return key.strip()

    key_file = pathlib.Path.home() / ".posthog_key"
    if key_file.is_file():
        return key_file.read_text().strip()

    sys.exit(
        "No PostHog personal API key found.\n"
        "Set POSTHOG_PERSONAL_API_KEY, or write the key to ~/.posthog_key:\n"
        "  echo 'phx_...' > ~/.posthog_key && chmod 600 ~/.posthog_key"
    )


def run_query(key: str, days: int, where: str, limit: int):
    # The query endpoint caps results at 100 rows unless LIMIT says otherwise —
    # without it you silently export a sample and think it's the population.
    query = f"""
    SELECT
        toInt(properties.card_count)           AS imported,
        toInt(properties.requested_card_count) AS requested,
        toInt(properties.parsed_entry_count)   AS entries,
        toInt(properties.excluded_card_count)  AS excluded,
        toInt(properties.text_length)          AS text_length,
        toDate(timestamp)                      AS day,
        toString(uuid)                         AS uuid,
        properties.raw_text                    AS raw_text
    FROM events
    WHERE event = 'deck_import_succeeded'
      AND timestamp > now() - INTERVAL {days} DAY
      AND isNotNull(properties.raw_text) AND properties.raw_text != ''
      AND {where}
    ORDER BY imported, uuid
    LIMIT {limit}
    """

    request = urllib.request.Request(
        f"{HOST}/api/projects/{PROJECT_ID}/query/",
        data=json.dumps({"query": {"kind": "HogQLQuery", "query": query}}).encode(),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as error:
        sys.exit(f"PostHog returned {error.code}: {error.read().decode()[:500]}")

    return payload["columns"], payload["results"]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--preset", choices=sorted(PRESETS), required=True)
    parser.add_argument("--days", type=int, default=30)
    parser.add_argument("--limit", type=int, default=10000)
    parser.add_argument("--out")
    args = parser.parse_args()

    columns, rows = run_query(load_key(), args.days, PRESETS[args.preset], args.limit)
    index = {name: i for i, name in enumerate(columns)}

    out_path = pathlib.Path(
        args.out or f"tests/fixtures/deck-imports/{args.preset}-imports.txt"
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)

    chunks = [
        f"# Real deck lists, exactly as players pasted them.\n"
        f"# Preset `{args.preset}`, last {args.days} days, PostHog project {PROJECT_ID}.\n"
        f"# {len(rows)} decks. Regenerate: scripts/export-deck-import-corpus.py --preset {args.preset}\n"
        f"#\n"
        f"#   imported  — cards the import actually built\n"
        f"#   requested — sum of the quantities we parsed\n"
        f"#   entries   — card lines the parser accepted\n"
        f"#   excluded  — cards dropped under a sideboard-style header\n"
        f"#\n"
        f"# Deck bodies are verbatim and contain blank lines, so blocks are delimited\n"
        f"# by the `===== DECK` lines below — never by blank lines.\n"
    ]

    for number, row in enumerate(rows, start=1):
        def field(name):
            value = row[index[name]]
            return "?" if value is None else value

        chunks.append(
            f"\n===== DECK {number:03d} "
            f"| imported={field('imported')} "
            f"| requested={field('requested')} "
            f"| entries={field('entries')} "
            f"| excluded={field('excluded')} "
            f"| chars={field('text_length')} "
            f"| {field('day')} "
            f"| {field('uuid')} =====\n"
            f"{row[index['raw_text']]}\n"
        )

    out_path.write_text("".join(chunks))
    print(f"Wrote {len(rows)} decks to {out_path}")


if __name__ == "__main__":
    main()
