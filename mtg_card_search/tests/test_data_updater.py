import dataclasses
import gzip
import json
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import data_updater
from data_updater import DataSanityError


def test_acquire_lock_blocks_concurrent_run(tmp_path, monkeypatch):
    lock_path = tmp_path / ".data_updater.lock"
    monkeypatch.setattr(data_updater, "LOCK_PATH", lock_path)

    holder_script = textwrap.dedent(f"""
        import fcntl, time
        f = open({str(lock_path)!r}, "w")
        fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
        print("locked", flush=True)
        time.sleep(2)
    """)
    proc = subprocess.Popen(
        [sys.executable, "-c", holder_script],
        stdout=subprocess.PIPE,
        text=True,
    )
    assert proc.stdout.readline().strip() == "locked"

    blocked = data_updater.acquire_lock()
    assert blocked is None

    proc.wait(timeout=5)

    free = data_updater.acquire_lock()
    assert free is not None
    free.close()


def _download_path(folder: Path, name: str) -> Path:
    return folder / f"{name}{data_updater.DOWNLOAD_SUFFIX}"


def _write_fixture(folder: Path, name: str, count: int) -> None:
    """Write a gzipped JSON Lines download, the way Scryfall now serves it."""
    lines = "".join(json.dumps({"name": f"Card {i}"}) + "\n" for i in range(count))
    with gzip.open(_download_path(folder, name), "wb") as f:
        f.write(lines.encode("utf-8"))


def _isolate(tmp_path, monkeypatch, dataset_name="fakeset"):
    monkeypatch.setattr(data_updater, "FOLDER", str(tmp_path))
    monkeypatch.setattr(data_updater, "BULK_DATA_TYPES", [dataset_name])
    monkeypatch.setattr(data_updater, "COUNTS_PATH", tmp_path / ".dataset_counts.json")
    return dataset_name


def test_unpack_rejects_sharp_drop(tmp_path, monkeypatch):
    dataset_name = _isolate(tmp_path, monkeypatch)

    _write_fixture(tmp_path, dataset_name, 10)
    baseline_counts = data_updater.unpack_jsonl_to_ndjson()
    assert baseline_counts[dataset_name] == 10
    ndjson_before = (tmp_path / f"{dataset_name}.ndjson").read_text()
    counts_before = json.loads((tmp_path / ".dataset_counts.json").read_text())

    _write_fixture(tmp_path, dataset_name, 1)
    with pytest.raises(DataSanityError):
        data_updater.unpack_jsonl_to_ndjson()

    assert (tmp_path / f"{dataset_name}.ndjson").read_text() == ndjson_before
    assert json.loads((tmp_path / ".dataset_counts.json").read_text()) == counts_before
    assert not (tmp_path / f"{dataset_name}.ndjson_new").exists()
    # A rejected download is NOT deleted — we didn't promote it, so keep it for
    # debugging rather than silently discarding it.
    assert _download_path(tmp_path, dataset_name).exists()


def test_unpack_accepts_growth(tmp_path, monkeypatch):
    dataset_name = _isolate(tmp_path, monkeypatch)

    _write_fixture(tmp_path, dataset_name, 10)
    first_counts = data_updater.unpack_jsonl_to_ndjson()
    assert first_counts[dataset_name] == 10

    _write_fixture(tmp_path, dataset_name, 12)
    second_counts = data_updater.unpack_jsonl_to_ndjson()
    assert second_counts[dataset_name] == 12
    assert json.loads((tmp_path / ".dataset_counts.json").read_text())[dataset_name] == 12
    assert len((tmp_path / f"{dataset_name}.ndjson").read_text().splitlines()) == 12


def test_unpack_removes_compressed_download_after_success(tmp_path, monkeypatch):
    # The .jsonl.gz is only needed for the unpack; leaving it around is what
    # filled the prod disk. A successful run must delete it.
    dataset_name = _isolate(tmp_path, monkeypatch)

    _write_fixture(tmp_path, dataset_name, 10)
    assert _download_path(tmp_path, dataset_name).exists()

    data_updater.unpack_jsonl_to_ndjson()

    assert (tmp_path / f"{dataset_name}.ndjson").exists()
    assert not _download_path(tmp_path, dataset_name).exists()


def test_unpack_preserves_jsonl_lines_verbatim(tmp_path, monkeypatch):
    # JSONL *is* NDJSON: unpacking must not re-serialize (and so must not reorder
    # keys, drop unicode, or turn Scryfall's numbers into floats).
    dataset_name = _isolate(tmp_path, monkeypatch)
    rows = [
        {"name": "Pântano", "printed_name": "Pântano", "cmc": 0.0, "prices": {"usd": "0.15"}},
        {"name": "Juzám Djinn", "lang": "en", "cmc": 4.0},
    ]
    source = "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows)
    with gzip.open(_download_path(tmp_path, dataset_name), "wb") as f:
        f.write(source.encode("utf-8"))

    data_updater.unpack_jsonl_to_ndjson()

    assert (tmp_path / f"{dataset_name}.ndjson").read_text(encoding="utf-8") == source


def test_unpack_rejects_truncated_gzip(tmp_path, monkeypatch):
    # A download cut off mid-flight fails gzip's CRC/length trailer. That must be
    # a rejected run, not a promoted half-dataset.
    dataset_name = _isolate(tmp_path, monkeypatch)

    _write_fixture(tmp_path, dataset_name, 10)
    data_updater.unpack_jsonl_to_ndjson()
    good_ndjson = (tmp_path / f"{dataset_name}.ndjson").read_text()

    _write_fixture(tmp_path, dataset_name, 500)
    download = _download_path(tmp_path, dataset_name)
    download.write_bytes(download.read_bytes()[:-40])  # chop the tail

    with pytest.raises(DataSanityError):
        data_updater.unpack_jsonl_to_ndjson()

    assert (tmp_path / f"{dataset_name}.ndjson").read_text() == good_ndjson
    assert not (tmp_path / f"{dataset_name}.ndjson_new").exists()


def test_unpack_rejects_malformed_json_line(tmp_path, monkeypatch):
    # Caught here, before the swap — otherwise the bad NDJSON is already live and
    # it's build_all_indices that explodes.
    dataset_name = _isolate(tmp_path, monkeypatch)

    with gzip.open(_download_path(tmp_path, dataset_name), "wb") as f:
        f.write(b'{"name": "Fine"}\n{"name": "Broken"\n')

    with pytest.raises(DataSanityError):
        data_updater.unpack_jsonl_to_ndjson()

    assert not (tmp_path / f"{dataset_name}.ndjson").exists()
    assert not (tmp_path / f"{dataset_name}.ndjson_new").exists()


def test_download_uses_the_jsonl_uri(tmp_path, monkeypatch):
    # Scryfall retired the JSON-array `download_uri` in July 2026. Reading it
    # would hand the unpack step a single `[{...}]` line instead of NDJSON, so the
    # JSONL URI is the only one we accept.
    dataset_name = _isolate(tmp_path, monkeypatch)
    requested = []

    class FakeResponse:
        def __init__(self, payload=None, content=b""):
            self._payload = payload
            self._content = content

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def raise_for_status(self):
            pass

        def json(self):
            return self._payload

        def iter_content(self, chunk_size=None):
            yield self._content

    catalog = {
        "data": [{
            "type": dataset_name,
            "download_uri": f"https://data.scryfall.io/{dataset_name}.json",
            "jsonl_download_uri": f"https://data.scryfall.io/{dataset_name}.jsonl.gz",
        }]
    }
    payload = gzip.compress(b'{"name": "Card 0"}\n')

    def fake_get(url, headers=None, stream=False):
        requested.append(url)
        if url.endswith("/bulk-data"):
            return FakeResponse(payload=catalog)
        return FakeResponse(content=payload)

    monkeypatch.setattr(data_updater.requests, "get", fake_get)

    data_updater.download_bulk_data()

    assert requested[-1].endswith(".jsonl.gz")
    # And the bytes landed compressed, ready for the unpack step to read.
    counts = data_updater.unpack_jsonl_to_ndjson()
    assert counts[dataset_name] == 1


def test_download_errors_when_jsonl_uri_is_absent(tmp_path, monkeypatch):
    dataset_name = _isolate(tmp_path, monkeypatch)

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {"data": [{
                "type": dataset_name,
                "download_uri": f"https://data.scryfall.io/{dataset_name}.json",
            }]}

    monkeypatch.setattr(
        data_updater.requests, "get", lambda url, headers=None, stream=False: FakeResponse()
    )

    with pytest.raises(ValueError, match="jsonl_download_uri"):
        data_updater.download_bulk_data()


def _patched_settings(monkeypatch, **overrides):
    new_settings = dataclasses.replace(data_updater.settings, **overrides)
    monkeypatch.setattr(data_updater, "settings", new_settings)
    return new_settings


def test_ping_healthcheck_sequence(monkeypatch):
    _patched_settings(monkeypatch, healthcheck_ping_url="https://hc-ping.com/abc123")

    calls = []
    monkeypatch.setattr(
        data_updater.requests, "get",
        lambda url, timeout=None: calls.append(url) or None,
    )

    data_updater.ping_healthcheck("/start")
    data_updater.ping_healthcheck()
    data_updater.ping_healthcheck("/fail")

    assert calls == [
        "https://hc-ping.com/abc123/start",
        "https://hc-ping.com/abc123",
        "https://hc-ping.com/abc123/fail",
    ]


def test_ping_healthcheck_noop_without_url(monkeypatch):
    _patched_settings(monkeypatch, healthcheck_ping_url=None)

    calls = []
    monkeypatch.setattr(
        data_updater.requests, "get",
        lambda url, timeout=None: calls.append(url) or None,
    )

    data_updater.ping_healthcheck()
    assert calls == []


def test_init_posthog_noop_without_key(monkeypatch):
    _patched_settings(monkeypatch, posthog_api_key=None)
    assert data_updater.init_posthog() is False


def test_notify_posthog_noop_when_disabled(monkeypatch):
    calls = []
    monkeypatch.setattr(data_updater.posthog, "capture", lambda **kw: calls.append(kw))

    data_updater.notify_posthog(False, "data_update_succeeded", {"counts": {}})
    assert calls == []


def test_init_sentry_noop_without_dsn(monkeypatch):
    _patched_settings(monkeypatch, sentry_dsn=None)
    assert data_updater.init_sentry() is None
