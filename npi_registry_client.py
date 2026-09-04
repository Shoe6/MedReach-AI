from __future__ import annotations

import asyncio
from typing import Any, Sequence

import httpx


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

    async def fetch_npi(self, npi: str) -> dict[str, Any]:
        """Fetch a single NPI record with retry + timeout handling."""
        if not npi or not str(npi).strip():
            raise ValueError("NPI value is required.")

        last_error: Exception | None = None
        for attempt in range(1, self.max_retries + 1):
            try:
                response = await self._client.get(
                    self.base_url,
                    params={"number": str(npi), "version": "2.1"},
                )

                if response.status_code == 429:
                    retry_after = response.headers.get("Retry-After")
                    delay = float(retry_after) if retry_after else min(2**attempt, 5)
                    await asyncio.sleep(delay)
                    continue

                response.raise_for_status()
                payload = response.json()

                results = payload.get("results") or []
                if not results:
                    return {}
                return results[0]

            except (httpx.TimeoutException, httpx.HTTPError, ValueError) as exc:
                last_error = exc
                if attempt == self.max_retries:
                    break
                await asyncio.sleep(min(2**attempt, 5))

        if last_error is not None:
            raise RuntimeError(f"Failed to fetch NPI {npi}: {last_error}") from last_error
        raise RuntimeError(f"Failed to fetch NPI {npi} without a specific error.")

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
