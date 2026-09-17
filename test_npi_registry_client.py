import asyncio
import logging
import time
from unittest.mock import patch

import httpx
import pytest

from npi_registry_client import CMSNPIRegistryClient


@pytest.mark.asyncio
async def test_fetch_npi_retries_three_times_and_returns_offline_fallback(caplog):
    client = CMSNPIRegistryClient()
    attempts = 0

    async def timeout_get(self, url, params=None):
        nonlocal attempts
        attempts += 1
        raise httpx.TimeoutException("CMS request timed out")

    with patch.object(httpx.AsyncClient, "get", new=timeout_get):
        with caplog.at_level(logging.ERROR, logger="npi_registry_client"):
            result = await client.fetch_npi("1234567890")

    assert result == {}
    assert attempts == 3
    assert "CMS API offline" in caplog.text
    await client.close()


@pytest.mark.asyncio
async def test_fetch_many_respects_rate_limit_and_handles_100_requests_under_6_seconds():
    client = CMSNPIRegistryClient(batch_size=20, batch_interval_seconds=1.0)

    def fake_response_factory(npi: str):
        return {
            "status": "OK",
            "results": [{
                "number": npi,
                "basic": {"first_name": "Test", "last_name": "Doctor"},
                "taxonomies": [{"desc": "Internal Medicine"}],
            }],
        }

    async def fake_get(self, url, params=None):
        npi = str(params["number"])
        await asyncio.sleep(0.01)
        return FakeResponse(fake_response_factory(npi))

    class FakeResponse:
        def __init__(self, payload):
            self._payload = payload
            self.status_code = 200
            self.headers = {}

        def raise_for_status(self):
            return None

        def json(self):
            return self._payload

    start = time.perf_counter()
    with patch.object(httpx.AsyncClient, "get", new=fake_get):
        results = await client.fetch_many([f"{1000000000 + i}" for i in range(100)])

    elapsed = time.perf_counter() - start

    assert len(results) == 100
    assert all(item.get("number") for item in results)
    assert elapsed < 6.0
    assert not any(item.get("status") == "429" for item in results)

    await client.close()
