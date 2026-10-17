"""Shared retry policies for asynchronous external HTTP calls."""

from collections.abc import Callable
from typing import Any, TypeVar

import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential


AsyncCallable = TypeVar("AsyncCallable", bound=Callable[..., Any])


def retry_transient_http_call(function: AsyncCallable) -> AsyncCallable:
    """Retry only network-level HTTP failures, never HTTP status failures."""
    return retry(
        retry=retry_if_exception_type((httpx.TimeoutException, httpx.ConnectError)),
        wait=wait_exponential(multiplier=0.1, min=0.1, max=1.0),
        stop=stop_after_attempt(3),
        reraise=False,
    )(function)


__all__ = ["retry_transient_http_call"]