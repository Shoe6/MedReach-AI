from __future__ import annotations

import asyncio
import logging
from typing import Any, Sequence

import httpx
from tenacity import RetryError

from http_retry import retry_transient_http_call


class CMSNPIRegistryClient:
    """Asynchronous client for the CMS NPI Registry API with strict rate limiting."""

    def __init__(
        self,
        base_url: str = "https://npiregistry.cms.hhs.gov/api",
        timeout: float = 10.0,
        max_retries: int = 3,
        batch_size: int = 20,
        batch_interval_seconds: float = 1.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.max_retries = max_retries
        self.batch_size = batch_size
        self.batch_interval_seconds = batch_interval_seconds
        self._client = httpx.AsyncClient(timeout=timeout, http2=True)

    async def close(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> "CMSNPIRegistryClient":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        await self.close()

    @retry_transient_http_call
    async def _request_npi(self, npi: str) -> dict[str, Any]:
        response = await self._client.get(
            self.base_url,
            params={"number": str(npi), "version": "2.1"},
        )
        response.raise_for_status()
        payload = response.json()
        results = payload.get("results") or []
        return results[0] if results else {}

    async def fetch_npi(self, npi: str) -> dict[str, Any]:
        """Fetch a single NPI record with transient retry and offline fallback."""
        if not npi or not str(npi).strip():
            raise ValueError("NPI value is required.")

        try:
            return await self._request_npi(npi)
        except RetryError as exc:
            logging.getLogger(__name__).error(
                "CMS API offline after 3 attempts while fetching NPI %s: %s",
                npi,
                exc.last_attempt.exception(),
            )
            return {}

    async def fetch_many(self, npis: Sequence[str]) -> list[dict[str, Any]]:
        """Fetch multiple NPIs using chunking so the client stays under the 20 rps cap."""
        if not npis:
            return []

        normalized = [str(npi).strip() for npi in npis if str(npi).strip()]
        results: list[dict[str, Any]] = []

        for start in range(0, len(normalized), self.batch_size):
            batch = normalized[start : start + self.batch_size]
            tasks = [asyncio.create_task(self.fetch_npi(npi)) for npi in batch]
            batch_results = await asyncio.gather(*tasks)
            results.extend(batch_results)

            if start + self.batch_size < len(normalized):
                await asyncio.sleep(self.batch_interval_seconds)

        return results
