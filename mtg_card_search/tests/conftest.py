"""Shared pytest setup for the card-search service.

Two jobs, both done *before* any test module imports `api`/`settings`/
`data_updater` (whose import runs `settings.load()` and would otherwise raise
`ConfigError` in an environment without a `.env`, e.g. CI):

1. Put the service root on `sys.path` so `import api` / `import settings` work
   no matter where pytest is invoked from.
2. Provide the required env vars, pointing the service at the committed test
   fixture instead of the real (multi-GB, uncommitted) `cards/` dataset. We use
   `setdefault` and set these before `settings.load()` runs — `load_dotenv()`
   does not override already-set vars, so a developer's local `.env` can't leak
   real data into the hermetic suite.

3. Transcode the fixture into the block-compressed form the service reads.
   `sample_cards.ndjson` stays the committed source of truth because it is plain
   text: reviewable in a diff, editable by hand, greppable. The `.zndjson` the
   service actually opens is a derived build artifact regenerated here (and
   gitignored), which also means every test run exercises `block_store`'s writer
   against the same rows its reader will serve.

`test_all_cards.py` (the slow full-dataset walk) stays out of the fast suite.
"""
import os
import sys
from pathlib import Path

TESTS_DIR = Path(__file__).resolve().parent
SERVICE_ROOT = TESTS_DIR.parent

sys.path.insert(0, str(SERVICE_ROOT))

FIXTURE_DIR = TESTS_DIR / "fixtures"
os.environ.setdefault("CARD_JSON_DIR", str(FIXTURE_DIR))
os.environ.setdefault("BULK_DATA_TYPES", "sample_cards")

# Must happen before any test module imports `api`, which opens the data file
# during app startup.
import block_store  # noqa: E402


def _build_fixture_blocks() -> None:
    """Regenerate `<fixture>.zndjson` from the committed `.ndjson`."""
    for source in sorted(FIXTURE_DIR.glob("*.ndjson")):
        target = source.with_suffix(block_store.DATA_EXT)
        if target.exists() and target.stat().st_mtime_ns >= source.stat().st_mtime_ns:
            continue
        with source.open("rb") as inp, target.open("wb") as raw_out:
            with block_store.BlockWriter(raw_out) as out:
                for line in inp:
                    if line.strip():
                        out.add_line(line)


_build_fixture_blocks()

# The full-dataset fidelity walk needs a running server + real data; it is the
# nightly Tier-2 job, not part of the fast, hermetic suite.
collect_ignore = ["test_all_cards.py"]


# marisa-trie's C extension intermittently segfaults during CPython's interpreter
# teardown on Linux — visible in CI as "N passed" followed by exit 139. All tests
# have run and been reported by the time session-finish fires, so exit immediately
# with the real status and skip the crashing global finalization. This only
# affects process *exit* — never a running server (which never finalizes) nor a
# test outcome. `trylast` so pytest's own summary prints first.

import pytest  # noqa: E402


@pytest.hookimpl(hookwrapper=True, tryfirst=True)
def pytest_sessionfinish(session, exitstatus):
    # Outermost wrapper (tryfirst) so our post-yield runs LAST — after pytest's
    # own terminal-summary wrapper has printed the result — then exit hard.
    yield
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(int(exitstatus))
