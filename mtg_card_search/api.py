from fastapi import FastAPI, HTTPException, Query, Request
from pydantic import BaseModel, Field
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import json
import logging
import random
import threading
import watchfiles
import asyncio
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi.middleware.cors import CORSMiddleware

from settings import settings
from card_index import Dataset, load_dataset, normalize_key  # noqa: F401 (re-exported)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

CARD_JSON_DIR = settings.card_json_dir

# List of dataset names (no extension). Each must have a matching <name>.ndjson
# in CARD_JSON_DIR. Sourced from the BULK_DATA_TYPES env var (see settings.py).
DATASET_NAMES: List[str] = settings.dataset_names

NDJSON_EXT = ".ndjson"

# Rate limit strings. DESIGN DECISION: tune these per your traffic expectations.
RATE_SINGLE   = "200/second"
RATE_BULK     = "2/second"

# Maximum card IDs accepted in a single bulk request.
BULK_MAX_IDS  = 200

# Maximum cards returned by a single /v1/cards/random request.
RANDOM_MAX_N  = 100

# A dataset's underlying .ndjson file is considered stale if it hasn't been
# replaced (by data_updater.py) in longer than this. Reported via /v1/health so
# an external monitor can poll and alert on it.
STALE_AFTER_SECONDS = 10 * 24 * 3600

# CORS origins, sourced from the CORS_ORIGIN env var (see settings.py).
CORS_ORIGINS  = settings.cors_origins


# ---------------------------------------------------------------------------
# Loaded datasets (mmap-backed) + thread-local file handles
# ---------------------------------------------------------------------------

# name -> Dataset (loaded trie + per-card offsets + generation). A reload swaps a
# whole Dataset in; single-key dict assignment is atomic under the GIL, and every
# reader snapshots the current Dataset, so a lookup's offset and file bytes always
# come from the same NDJSON generation.
datasets: Dict[str, Dataset] = {}

# Thread-local open file handles, keyed by dataset name -> (generation, file).
_local = threading.local()


def get_handle(ds: Dataset):
    """Return (and lazily open) a thread-local read handle for *ds*'s NDJSON.

    The handle is tied to the dataset's generation: when a reload swaps in a newer
    generation, the next call closes the stale handle and reopens — so a reader
    never seeks a freshly-built offset into the old (already-replaced) file. This
    is the fix for the pre-existing stale-handle bug in the in-RAM rebuild path.
    """
    if not hasattr(_local, "handles"):
        _local.handles = {}
    cached = _local.handles.get(ds.name)
    if cached is None or cached[0] != ds.generation or cached[1].closed:
        if cached is not None and not cached[1].closed:
            cached[1].close()
        fh = ds.ndjson_path.open("rb")
        _local.handles[ds.name] = (ds.generation, fh)
        return fh
    return cached[1]


# ---------------------------------------------------------------------------
# Index load + hot reload
# ---------------------------------------------------------------------------

def load_all_datasets() -> None:
    for name in DATASET_NAMES:
        datasets[name] = load_dataset(CARD_JSON_DIR, name)


async def watch_data_files() -> None:
    """Reload a dataset when data_updater finishes (re)building its artifacts.

    The meta file (`<name>.index.json`) is written LAST by build_artifacts, so
    reacting to *its* change means we only reload once every artifact is in place.
    """
    meta_to_name = {
        str((CARD_JSON_DIR / f"{name}.index.json").resolve()): name
        for name in DATASET_NAMES
    }
    logger.info("Watching %s for index updates", CARD_JSON_DIR)
    async for changes in watchfiles.awatch(str(CARD_JSON_DIR)):
        reloaded: set[str] = set()
        for _change_type, changed_path in changes:
            name = meta_to_name.get(str(Path(changed_path).resolve()))
            if name and name not in reloaded:
                logger.info("[%s] index artifacts changed — reloading", name)
                try:
                    datasets[name] = load_dataset(CARD_JSON_DIR, name)
                    reloaded.add(name)
                except Exception:
                    logger.exception("[%s] reload failed; keeping previous index", name)


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    missing = [
        str(CARD_JSON_DIR / f"{name}{NDJSON_EXT}")
        for name in DATASET_NAMES
        if not (CARD_JSON_DIR / f"{name}{NDJSON_EXT}").exists()
    ]
    if missing:
        raise RuntimeError(f"Data file(s) not found: {missing}")

    load_all_datasets()
    task = asyncio.create_task(watch_data_files())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


# ---------------------------------------------------------------------------
# App + middleware
# ---------------------------------------------------------------------------

app = FastAPI(title="Card Lookup API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    # Wildcard origins + credentials is rejected by browsers, so only allow
    # credentials when a concrete origin allowlist is configured.
    allow_credentials=CORS_ORIGINS != ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Per-IP rate limiting, keyed by request.client.host. Behind a reverse proxy
# this is only the real client IP if uvicorn trusts the proxy's X-Forwarded-For
# (--forwarded-allow-ips); otherwise every request collapses to the proxy IP and
# the limit becomes global. See "Rate limiting behind the proxy" in SETUP.md.
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# ---------------------------------------------------------------------------
# Lookup helpers
# ---------------------------------------------------------------------------

def _dataset_for_request(dataset: Optional[str]) -> Dataset:
    """
    Resolve which dataset to query, returning the loaded Dataset.

    DESIGN DECISION: when no dataset is specified by the caller, fall back to
    the first entry in DATASET_NAMES. If ambiguity should be an error instead,
    raise HTTPException here.
    """
    if dataset is not None:
        if dataset not in datasets:
            raise HTTPException(status_code=400, detail=f"Unknown dataset: {dataset!r}. "
                                                        f"Valid options: {list(datasets)}")
        return datasets[dataset]
    return datasets[DATASET_NAMES[0]]  # DESIGN DECISION: default dataset fallback


def lookup(card_id: str, dataset: Optional[str] = None) -> Optional[dict]:
    ds = _dataset_for_request(dataset)
    offset = ds.get_offset(normalize_key(card_id))

    if offset is None:
        # DESIGN DECISION: cross-dataset fallback chain, e.g. an Oracle-only
        # card ID falling back to a unique-artwork dataset. Configure via
        # DATASET_FALLBACKS (see settings.py).
        fallback = settings.dataset_fallbacks.get(ds.name)
        if fallback and fallback != ds.name and fallback in datasets:
            return lookup(card_id.lower(), fallback)
        return None

    try:
        f = get_handle(ds)
        f.seek(offset)
        return json.loads(f.readline())
    except (OSError, json.JSONDecodeError):
        logger.exception(f"Failed to read card {card_id!r} from dataset [{ds.name}] at offset {offset}")
        return None


def bulk_lookup(
        card_ids: List[str],
        dataset: Optional[str] = None,
) -> Tuple[List[dict], List[str]]:
    ds = _dataset_for_request(dataset)
    f = get_handle(ds)
    found, not_found = [], []
    for card_id in card_ids:
        offset = ds.get_offset(normalize_key(card_id))
        if offset is None:
            not_found.append(card_id)
        else:
            f.seek(offset)
            found.append(json.loads(f.readline()))
    return found, not_found


def random_cards(n: int, dataset: Optional[str] = None) -> List[dict]:
    """Return *n* distinct random cards from *dataset*.

    Samples without replacement from the dataset's per-card offset list, so the
    result is unbiased (each card equally likely) and free of duplicates. If the
    dataset holds fewer than *n* cards, every card is returned.
    """
    ds = _dataset_for_request(dataset)
    offsets = ds.offsets
    f = get_handle(ds)
    cards = []
    for offset in random.sample(offsets, min(n, len(offsets))):
        f.seek(offset)
        cards.append(json.loads(f.readline()))
    return cards


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class BulkLookupRequest(BaseModel):
    card_ids: List[str] = Field(..., max_length=BULK_MAX_IDS)
    # DESIGN DECISION: expose `dataset` in the bulk request body, or keep it
    # a query param for consistency with the single-card endpoint? Pick one.
    dataset: Optional[str] = Field(
        default=None,
        description="Dataset name to query. Defaults to the primary dataset.",
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

def _dataset_health(name: str, ds: Dataset) -> dict:
    """Entry count plus freshness, derived from the .ndjson file's mtime so
    it reflects when data_updater.py last replaced it — not when this
    process last (re)loaded its index."""
    info = {"entries": len(ds.trie), "last_updated": None, "age_seconds": None, "stale": None}
    try:
        mtime = ds.ndjson_path.stat().st_mtime
    except OSError:
        return info
    last_updated = datetime.fromtimestamp(mtime, tz=timezone.utc)
    age_seconds = (datetime.now(timezone.utc) - last_updated).total_seconds()
    info.update(
        last_updated=last_updated.isoformat(),
        age_seconds=age_seconds,
        stale=age_seconds > STALE_AFTER_SECONDS,
    )
    return info


@app.get("/v1/health")
def health():
    if not datasets:
        raise HTTPException(status_code=503, detail="No indices loaded")
    ds_health = {name: _dataset_health(name, ds) for name, ds in datasets.items()}
    return {
        "status": "degraded" if any(d["stale"] for d in ds_health.values()) else "ok",
        "datasets": ds_health,
    }


# NOTE: declared before /v1/cards/{card_id} so the literal "random" path isn't
# captured by the {card_id} path parameter.
@app.get("/v1/cards/random")
@limiter.limit(RATE_BULK)
def get_random_cards(
        request: Request,
        n: int = Query(..., ge=1, le=RANDOM_MAX_N,
                       description="Number of random cards to return."),
        dataset: Optional[str] = None,  # e.g. GET /v1/cards/random?n=5&dataset=cards
):
    return {"results": random_cards(n, dataset)}


@app.get("/v1/cards/{card_id}")
@limiter.limit(RATE_SINGLE)
def get_card(
        request: Request,
        card_id: str,
        dataset: Optional[str] = None,  # e.g. GET /cards/lightning-bolt?dataset=cards
):
    result = lookup(card_id, dataset)
    if result is None:
        raise HTTPException(status_code=404, detail="Card not found")
    return result


@app.post("/v1/cards/bulk/lookup")
@limiter.limit(RATE_BULK)
def get_cards_bulk(request: Request, body: BulkLookupRequest):
    found, not_found = bulk_lookup(body.card_ids, body.dataset)
    return {
        "results": found,
        "not_found": not_found,
    }
