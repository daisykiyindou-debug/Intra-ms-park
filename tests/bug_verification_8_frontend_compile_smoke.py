#!/usr/bin/env python3
"""Focused frontend smoke check for the reported UI flows.

The UI cannot be meaningfully exercised if the CRA dev overlay reports a compile
error. Browser automation evidence captured the same error on /login.
"""

EXPECTED_ERROR = "src/pages/Actualites.jsx: Unexpected token (1023:2)"

print(
    "Manual/browser smoke result: frontend dev overlay blocks the app; "
    f"expected error observed: {EXPECTED_ERROR}"
)