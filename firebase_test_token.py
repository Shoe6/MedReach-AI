"""Obtain a Firebase ID token for scripts that call the API with real authentication.

Resolution order:
1. ``TEST_FIREBASE_TOKEN`` - a ready-made ID token (not refreshed; expires after ~1 hour).
2. Sign in a test user through the Firebase Auth REST API using
   ``TEST_FIREBASE_EMAIL`` and ``TEST_FIREBASE_PASSWORD``. Tokens are cached and
   re-fetched shortly before they expire.

Sign-in settings:
- Emulator: set ``FIREBASE_AUTH_EMULATOR_HOST`` (e.g. ``127.0.0.1:9099``); no API key needed.
- Production: set ``FIREBASE_WEB_API_KEY`` (or ``VITE_FIREBASE_API_KEY``).

The test user needs a ``role`` custom claim of ``editor`` or higher; assign one with
``python set_user_role.py <email> editor``.
"""
from __future__ import annotations

import os
import threading
import time

import requests

_REFRESH_MARGIN_SECONDS = 300
_lock = threading.Lock()
_cached: dict[str, float | str] = {"token": "", "expires_at": 0.0}


class TestTokenError(RuntimeError):
    __test__ = False  # not a pytest test class


def _sign_in(email: str, password: str) -> tuple[str, float]:
    emulator_host = os.environ.get("FIREBASE_AUTH_EMULATOR_HOST")
    if emulator_host:
        base = f"http://{emulator_host}/identitytoolkit.googleapis.com/v1"
        api_key = os.environ.get("FIREBASE_WEB_API_KEY") or "local-emulator-key"
    else:
        base = "https://identitytoolkit.googleapis.com/v1"
        api_key = os.environ.get("FIREBASE_WEB_API_KEY") or os.environ.get("VITE_FIREBASE_API_KEY", "")
        if not api_key:
            raise TestTokenError("Set FIREBASE_WEB_API_KEY (or VITE_FIREBASE_API_KEY) to sign in the test user.")

    response = requests.post(
        f"{base}/accounts:signInWithPassword",
        params={"key": api_key},
        json={"email": email, "password": password, "returnSecureToken": True},
        timeout=30,
    )
    if not response.ok:
        raise TestTokenError(f"Firebase sign-in failed ({response.status_code}): {response.text[:300]}")
    body = response.json()
    return body["idToken"], time.time() + int(body.get("expiresIn", 3600))


def get_test_token() -> str:
    """Return a valid ID token, signing in (and re-signing in near expiry) when credentials are provided."""
    static_token = os.environ.get("TEST_FIREBASE_TOKEN", "").strip()
    if static_token:
        return static_token

    email = os.environ.get("TEST_FIREBASE_EMAIL", "").strip()
    password = os.environ.get("TEST_FIREBASE_PASSWORD", "")
    if not email or not password:
        raise TestTokenError(
            "No credentials available. Set TEST_FIREBASE_TOKEN, or TEST_FIREBASE_EMAIL and "
            "TEST_FIREBASE_PASSWORD (plus FIREBASE_AUTH_EMULATOR_HOST or FIREBASE_WEB_API_KEY)."
        )

    with _lock:
        if not _cached["token"] or time.time() >= float(_cached["expires_at"]) - _REFRESH_MARGIN_SECONDS:
            token, expires_at = _sign_in(email, password)
            _cached["token"], _cached["expires_at"] = token, expires_at
        return str(_cached["token"])


def auth_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {get_test_token()}"}
