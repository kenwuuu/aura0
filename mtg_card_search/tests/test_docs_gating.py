"""Interactive docs (/docs, /redoc, /openapi.json) must be off unless
EXPOSE_DOCS is explicitly set — they map the whole API surface, so leaving them
on in production is an information-disclosure risk. These tests pin both the
env parsing (settings.expose_docs) and the resulting FastAPI app wiring.
"""
import os
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest

REPO_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_DIR))

from settings import Settings


def _base_env(monkeypatch, tmp_path):
    """Minimum env for Settings.load(), with EXPOSE_DOCS cleared."""
    monkeypatch.setenv("CARD_JSON_DIR", str(tmp_path))
    monkeypatch.setenv("BULK_DATA_TYPES", "default_cards")
    monkeypatch.delenv("EXPOSE_DOCS", raising=False)


def test_expose_docs_defaults_false(monkeypatch, tmp_path):
    _base_env(monkeypatch, tmp_path)
    assert Settings.load().expose_docs is False


@pytest.mark.parametrize("value", ["true", "True", "1", "yes", "on", "ON"])
def test_expose_docs_truthy(monkeypatch, tmp_path, value):
    _base_env(monkeypatch, tmp_path)
    monkeypatch.setenv("EXPOSE_DOCS", value)
    assert Settings.load().expose_docs is True


@pytest.mark.parametrize("value", ["", "false", "0", "no", "off", "nope"])
def test_expose_docs_falsey(monkeypatch, tmp_path, value):
    _base_env(monkeypatch, tmp_path)
    monkeypatch.setenv("EXPOSE_DOCS", value)
    assert Settings.load().expose_docs is False


def test_app_docs_disabled_by_default():
    """The app as imported under a normal (EXPOSE_DOCS-unset) test env must
    expose no docs/schema routes at all. Read-only — never mutates the shared
    `api` module."""
    import api

    paths = {getattr(r, "path", None) for r in api.app.routes}
    assert api.app.docs_url is None
    assert api.app.redoc_url is None
    assert api.app.openapi_url is None
    assert "/docs" not in paths
    assert "/redoc" not in paths
    assert "/openapi.json" not in paths


def test_app_docs_enabled_when_flag_set():
    """With EXPOSE_DOCS set, the app exposes the docs/schema routes.

    Run in a fresh interpreter rather than reloading `api` in-process: this
    process's `api`/`settings` modules are shared with the rest of the suite
    (the lookup-contract tests drive the real app), so re-importing them here
    under a throwaway config would leave those modules pointing at the wrong
    CARD_JSON_DIR and break every later test. A subprocess isolates it fully.
    """
    script = textwrap.dedent(
        """
        import api
        assert api.app.docs_url == "/docs", api.app.docs_url
        assert api.app.redoc_url == "/redoc", api.app.redoc_url
        assert api.app.openapi_url == "/openapi.json", api.app.openapi_url
        print("DOCS_ENABLED_OK")
        """
    )
    env = {
        **os.environ,
        "EXPOSE_DOCS": "true",
        # Importing `api` only needs settings to load — it doesn't read the data
        # files (that happens at app startup). Point at the committed fixture.
        "CARD_JSON_DIR": str(REPO_DIR / "tests" / "fixtures"),
        "BULK_DATA_TYPES": "sample_cards",
    }
    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=str(REPO_DIR),
        env=env,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, (
        f"subprocess failed\nstdout={result.stdout!r}\nstderr={result.stderr!r}"
    )
    assert "DOCS_ENABLED_OK" in result.stdout
