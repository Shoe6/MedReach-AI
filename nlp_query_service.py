"""Natural Language Query service: translate plain-English questions to pandas queries.

Pipeline:
    1. ``load_dataset`` - safely resolve ``dataset_id`` and load the CSV.
    2. ``translate_to_pandas_query`` - ask an LLM for a ``DataFrame.query()`` string.
    3. ``validate_query_expression`` - AST allowlist so LLM output can't run code.
    4. ``execute_query``          - apply the expression and return JSON-safe records.

Configuration (environment variables):
    NLP_LLM_PROVIDER   "gemini" (default) or "openai"
    NLP_LLM_MODEL      Model name override (defaults: gemini-2.5-flash / gpt-4o-mini)
    GEMINI_API_KEY     Required for the Gemini provider (GOOGLE_API_KEY also accepted)
    OPENAI_API_KEY     Required for the OpenAI provider
    NLP_DATASET_DIR    Directory with the CSV datasets (default: this module's dir)
"""

from __future__ import annotations

import ast
import json
import logging
import os
import re
from pathlib import Path
from typing import Any, Callable, Iterable

import pandas as pd

logger = logging.getLogger(__name__)

DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"
DEFAULT_OPENAI_MODEL = "gpt-4o-mini"
MAX_QUERY_LENGTH = 500

DATASET_SCHEMA: dict[str, str] = {
    "NPI": "10-digit National Provider Identifier (integer)",
    "Provider_Name": "Full provider name (string)",
    "Specialty": "Medical specialty, e.g. 'Cardiology', 'Family Medicine' (string)",
    "State": "Two-letter US state abbreviation, e.g. 'TX', 'CA' (string)",
    "City": "City name (string)",
    "PII_Violations_Count": "Number of PII violations on the record (integer >= 0)",
    "Is_Duplicate": "Whether the record is flagged as a duplicate (boolean True/False)",
}

SYSTEM_PROMPT_TEMPLATE = """You translate natural-language questions about a \
healthcare provider dataset into a single pandas DataFrame.query() expression.

DATASET COLUMNS:
{schema}

STRICT OUTPUT RULES:
1. Output ONLY the raw pandas query expression. No markdown, no code fences, \
no backticks, no comments, no explanations, no leading "df.query(" wrapper.
2. Use ONLY the column names listed above, spelled exactly as shown (case-sensitive).
3. Wrap ALL string values in single quotes, e.g. State == 'TX'. Never use double quotes.
4. Combine conditions with `and`, `or`, `not` and parentheses.
5. Booleans are True / False, e.g. Is_Duplicate == True.
6. For case-insensitive or partial text matches use \
Column.str.contains('value', case=False, na=False).
7. For membership use Column.isin(['A', 'B']) or Column in ['A', 'B'].
8. Map US state names to their two-letter abbreviation (e.g. Texas -> 'TX').
9. Never reference variables with @, never call functions other than .str.contains, \
.str.startswith, .str.endswith, .str.lower, .str.upper, .isin, .isna, .notna, .between.
10. If the request cannot be expressed with these columns, output exactly: INVALID_QUERY

EXAMPLES:
Question: cardiologists in Texas
Output: Specialty.str.contains('cardio', case=False, na=False) and State == 'TX'
Question: duplicate records with more than 2 PII violations
Output: Is_Duplicate == True and PII_Violations_Count > 2
Question: providers in Austin or Dallas that are not duplicates
Output: City.isin(['Austin', 'Dallas']) and Is_Duplicate == False"""


# --------------------------------------------------------------------------- errors


class NLPQueryError(Exception):
    """Base class for NLP query failures. ``status_code`` maps to the HTTP response."""

    status_code = 400

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class InvalidDatasetIdError(NLPQueryError):
    status_code = 400


class DatasetNotFoundError(NLPQueryError):
    status_code = 404


class QueryTranslationError(NLPQueryError):
    """The LLM output could not be turned into a usable query."""

    status_code = 422


class UnsafeQueryError(NLPQueryError):
    """The generated expression uses constructs outside the allowlist."""

    status_code = 422


class QueryExecutionError(NLPQueryError):
    status_code = 422


class LLMConfigurationError(NLPQueryError):
    status_code = 503


class LLMServiceError(NLPQueryError):
    status_code = 502


# --------------------------------------------------------------------------- datasets


_DATASET_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_\-. ]{0,127}$")


def get_dataset_dir() -> Path:
    return Path(
        os.getenv("NLP_DATASET_DIR") or Path(__file__).resolve().parent
    ).resolve()


def resolve_dataset_path(dataset_id: str, base_dir: Path | None = None) -> Path:
    """Map ``dataset_id`` to a CSV path; reject anything that escapes ``base_dir``."""
    dataset_id = (dataset_id or "").strip()
    if not _DATASET_ID_PATTERN.fullmatch(dataset_id) or ".." in dataset_id:
        raise InvalidDatasetIdError(
            "Invalid dataset_id. Use a plain CSV file name (letters, numbers, "
            "'_', '-', '.') without path components."
        )

    filename = (
        dataset_id if dataset_id.lower().endswith(".csv") else f"{dataset_id}.csv"
    )
    base = (base_dir or get_dataset_dir()).resolve()
    path = (base / filename).resolve()
    if path.parent != base:
        raise InvalidDatasetIdError(
            "dataset_id must refer to a file inside the dataset directory."
        )
    return path


def load_dataset(dataset_id: str, base_dir: Path | None = None) -> pd.DataFrame:
    path = resolve_dataset_path(dataset_id, base_dir)
    try:
        return pd.read_csv(path, low_memory=False)
    except FileNotFoundError as exc:
        raise DatasetNotFoundError(f"Dataset '{dataset_id}' was not found.") from exc
    except (pd.errors.EmptyDataError, pd.errors.ParserError, UnicodeDecodeError) as exc:
        raise InvalidDatasetIdError(
            f"Dataset '{dataset_id}' could not be parsed as CSV: {exc}"
        ) from exc


# ------------------------------------------------------------------ LLM translation


def build_system_prompt(columns: Iterable[str] | None = None) -> str:
    """Build the system prompt from the known schema plus any extra CSV columns."""
    lines = [f"- {name}: {desc}" for name, desc in DATASET_SCHEMA.items()]
    extra = [
        str(c)
        for c in (columns if columns is not None else [])
        if c not in DATASET_SCHEMA
    ]
    lines.extend(f"- {name}" for name in extra)
    return SYSTEM_PROMPT_TEMPLATE.format(schema="\n".join(lines))


def _call_gemini(system_prompt: str, user_query: str, model: str | None) -> str:
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise LLMConfigurationError("GEMINI_API_KEY is not configured on the server.")
    try:
        from google import genai
        from google.genai import types
    except ImportError as exc:
        raise LLMConfigurationError(
            "google-genai is not installed. Run: pip install google-genai"
        ) from exc

    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model=model or DEFAULT_GEMINI_MODEL,
        contents=user_query,
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=0,
            max_output_tokens=256,
        ),
    )
    return response.text or ""


def _call_openai(system_prompt: str, user_query: str, model: str | None) -> str:
    if not os.getenv("OPENAI_API_KEY"):
        raise LLMConfigurationError("OPENAI_API_KEY is not configured on the server.")
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise LLMConfigurationError(
            "openai is not installed. Run: pip install openai"
        ) from exc

    client = OpenAI()
    response = client.chat.completions.create(
        model=model or DEFAULT_OPENAI_MODEL,
        temperature=0,
        max_tokens=256,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_query},
        ],
    )
    return response.choices[0].message.content or ""


LLM_PROVIDERS: dict[str, Callable[[str, str, str | None], str]] = {
    "gemini": _call_gemini,
    "openai": _call_openai,
}


def clean_llm_output(raw: str) -> str:
    """Strip markdown fences, a ``df.query(...)`` wrapper, or surrounding quotes."""
    text = (raw or "").strip()
    fence = re.match(r"^```[a-zA-Z]*\s*(.*?)\s*```$", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    wrapper = re.match(r"^df\.query\(\s*([\"'])(.*)\1\s*\)$", text, re.DOTALL)
    if wrapper:
        text = wrapper.group(2).strip()
    if len(text) >= 2 and text[0] == text[-1] == '"':
        text = text[1:-1].strip()
    return " ".join(text.split())


def translate_to_pandas_query(
    user_query: str,
    columns: Iterable[str] | None = None,
    *,
    provider: str | None = None,
    model: str | None = None,
) -> str:
    """Translate ``user_query`` into a ``DataFrame.query()`` expression via the LLM."""
    provider_name = (
        (provider or os.getenv("NLP_LLM_PROVIDER") or "gemini").strip().lower()
    )
    call_llm = LLM_PROVIDERS.get(provider_name)
    if call_llm is None:
        raise LLMConfigurationError(
            f"Unsupported NLP_LLM_PROVIDER '{provider_name}'. "
            f"Use one of: {', '.join(LLM_PROVIDERS)}."
        )

    system_prompt = build_system_prompt(columns)
    try:
        raw = call_llm(system_prompt, user_query, model or os.getenv("NLP_LLM_MODEL"))
    except NLPQueryError:
        raise
    except Exception as exc:
        logger.exception("LLM provider '%s' failed to translate query", provider_name)
        raise LLMServiceError(
            f"The language model service failed to process the request: {exc}"
        ) from exc

    expression = clean_llm_output(raw)
    if not expression:
        raise QueryTranslationError("The language model returned an empty query.")
    if expression == "INVALID_QUERY":
        raise QueryTranslationError(
            "This question can't be answered with the available columns. "
            "Try rephrasing it."
        )
    return expression


# ------------------------------------------------------------------ safety validation


_ALLOWED_NODES: tuple[type[ast.AST], ...] = (
    ast.Expression,
    ast.BoolOp,
    ast.And,
    ast.Or,
    ast.UnaryOp,
    ast.Not,
    ast.USub,
    ast.UAdd,
    ast.BinOp,
    ast.Add,
    ast.Sub,
    ast.Mult,
    ast.Div,
    ast.Mod,
    ast.Compare,
    ast.Eq,
    ast.NotEq,
    ast.Lt,
    ast.LtE,
    ast.Gt,
    ast.GtE,
    ast.In,
    ast.NotIn,
    ast.Name,
    ast.Load,
    ast.Constant,
    ast.List,
    ast.Tuple,
    ast.Attribute,
    ast.Call,
    ast.keyword,
)
_ALLOWED_STR_METHODS = frozenset(
    {"contains", "startswith", "endswith", "lower", "upper", "strip"}
)
_ALLOWED_SERIES_METHODS = frozenset(
    {"isin", "isna", "notna", "isnull", "notnull", "between"}
)
_ALLOWED_KWARGS = frozenset({"case", "na", "regex", "inclusive"})


def validate_query_expression(expression: str) -> None:
    """Reject anything but column comparisons and a small set of Series/str methods.

    ``DataFrame.query`` evaluates its input, so LLM output must never reach it unchecked
    (e.g. ``NPI.__class__.__init__.__globals__`` style escapes, ``@local`` lookups).
    """
    if len(expression) > MAX_QUERY_LENGTH:
        raise UnsafeQueryError("Generated query is too long.")
    try:
        tree = ast.parse(expression, mode="eval")
    except SyntaxError as exc:
        raise QueryTranslationError(
            f"Generated query has invalid syntax: {exc.msg}"
        ) from exc

    for node in ast.walk(tree):
        if not isinstance(node, _ALLOWED_NODES):
            raise UnsafeQueryError(
                f"Generated query uses a disallowed construct: {type(node).__name__}."
            )
        if isinstance(node, ast.Name) and node.id.startswith("_"):
            raise UnsafeQueryError(
                f"Generated query references a disallowed name: {node.id}."
            )
        if isinstance(node, ast.Attribute):
            if node.attr.startswith("_"):
                raise UnsafeQueryError(
                    f"Generated query references a disallowed attribute: {node.attr}."
                )
            is_str_accessor = node.attr == "str" and isinstance(node.value, ast.Name)
            is_str_method = (
                node.attr in _ALLOWED_STR_METHODS
                and isinstance(node.value, ast.Attribute)
                and node.value.attr == "str"
            )
            is_series_method = node.attr in _ALLOWED_SERIES_METHODS and isinstance(
                node.value, ast.Name
            )
            if not (is_str_accessor or is_str_method or is_series_method):
                raise UnsafeQueryError(
                    f"Generated query uses a disallowed attribute: {node.attr}."
                )
        if isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Attribute):
                raise UnsafeQueryError("Generated query calls a disallowed function.")
            for kw in node.keywords:
                if kw.arg not in _ALLOWED_KWARGS:
                    raise UnsafeQueryError(
                        f"Generated query uses a disallowed argument: {kw.arg}."
                    )
            for arg in [*node.args, *(kw.value for kw in node.keywords)]:
                if not isinstance(arg, (ast.Constant, ast.List, ast.Tuple)):
                    raise UnsafeQueryError("Method arguments must be literal values.")


# --------------------------------------------------------------------------- execution


def execute_query(df: pd.DataFrame, expression: str) -> pd.DataFrame:
    validate_query_expression(expression)
    try:
        # The python engine is required for .str accessor methods.
        result = df.query(expression, engine="python")
    except pd.errors.UndefinedVariableError as exc:
        raise QueryExecutionError(
            "The generated query references a column that doesn't exist in this "
            f"dataset: {exc}"
        ) from exc
    except SyntaxError as exc:
        raise QueryExecutionError(
            f"The generated query has invalid syntax: {exc.msg}"
        ) from exc
    except (ValueError, TypeError, KeyError, AttributeError) as exc:
        raise QueryExecutionError(
            f"The generated query could not be applied to this dataset: {exc}"
        ) from exc

    if not isinstance(result, pd.DataFrame):
        raise QueryExecutionError("The generated query did not produce a row filter.")
    return result


def dataframe_to_records(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Convert to JSON-safe dicts (NaN -> None, numpy scalars -> Python types)."""
    return json.loads(df.to_json(orient="records", date_format="iso"))


def run_nlp_search(
    query: str,
    dataset_id: str,
    *,
    limit: int | None = None,
    base_dir: Path | None = None,
) -> dict[str, Any]:
    """End-to-end search. Raises ``NLPQueryError`` subclasses on failure."""
    query = (query or "").strip()
    if not query:
        raise NLPQueryError("'query' must be a non-empty string.")
    if len(query) > MAX_QUERY_LENGTH:
        raise NLPQueryError(f"'query' must be at most {MAX_QUERY_LENGTH} characters.")

    # Load first so a missing dataset fails fast without spending an LLM call.
    df = load_dataset(dataset_id, base_dir)
    expression = translate_to_pandas_query(query, df.columns)
    filtered = execute_query(df, expression)

    total_matches = len(filtered)
    if limit is not None:
        filtered = filtered.head(limit)

    return {
        "success": True,
        "applied_query": expression,
        "results": dataframe_to_records(filtered),
        "total_matches": total_matches,
        "returned_count": len(filtered),
    }
