"""FastAPI routes for the Natural Language Query feature."""

import logging

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from auth import verify_firebase_token
from nlp_query_service import NLPQueryError, run_nlp_search

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/dataset", tags=["nlp-query"])

DEFAULT_RESULT_LIMIT = 1000
MAX_RESULT_LIMIT = 10000


class NLPSearchRequest(BaseModel):
    query: str = Field(
        default="", description="Plain-English question, e.g. 'cardiologists in Texas'."
    )
    dataset_id: str = Field(
        default="",
        description="CSV file name to search, e.g. 'raw_registry_input.csv'.",
    )
    limit: int = Field(
        default=DEFAULT_RESULT_LIMIT,
        ge=1,
        le=MAX_RESULT_LIMIT,
        description=(
            "Maximum rows returned in 'results'. "
            "'total_matches' always reflects the full count."
        ),
    )


def _error(status_code: int, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code, content={"success": False, "error": message}
    )


@router.post("/nlp-search")
def nlp_search(payload: NLPSearchRequest, _user: dict = Depends(verify_firebase_token)):
    """Translate a plain-English question into a pandas query and return matching rows.

    Declared sync so FastAPI runs the blocking LLM call and pandas work in a threadpool.
    """
    try:
        return run_nlp_search(payload.query, payload.dataset_id, limit=payload.limit)
    except NLPQueryError as exc:
        logger.info("NLP search failed (%s): %s", exc.status_code, exc.message)
        return _error(exc.status_code, exc.message)
    except Exception:
        logger.exception("Unexpected NLP search failure")
        return _error(500, "An unexpected error occurred while processing the query.")
