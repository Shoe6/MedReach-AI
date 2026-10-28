"""Assign the `role` custom claim used by the API's require_role checks.

Usage: python set_user_role.py user@example.com admin

The user must sign out and back in (or refresh their ID token) to pick up the claim.
"""
import sys

from firebase_admin import auth

import database  # noqa: F401  (initializes the firebase_admin app)

VALID_ROLES = {"viewer", "editor", "admin", "super-admin"}


def main() -> int:
    if len(sys.argv) != 3 or sys.argv[2].lower() not in VALID_ROLES:
        print(f"Usage: python set_user_role.py <email> <{'|'.join(sorted(VALID_ROLES))}>")
        return 2
    email, role = sys.argv[1], sys.argv[2].lower()
    user = auth.get_user_by_email(email)
    auth.set_custom_user_claims(user.uid, {"role": role})
    print(f"Set role '{role}' for {email} ({user.uid}).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
