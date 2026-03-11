#!/usr/bin/env bash
set -euo pipefail

if command -v python3.11 >/dev/null 2>&1; then
  PYTHON_BIN="python3.11"
elif command -v python3.10 >/dev/null 2>&1; then
  PYTHON_BIN="python3.10"
elif command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="python3"
else
  echo "Python 3 is required. Install Python 3.10 or 3.11." >&2
  exit 1
fi

"${PYTHON_BIN}" -c '
import sys
major, minor = sys.version_info[:2]
if major != 3 or minor < 10 or minor > 11:
    raise SystemExit(
        f"Unsupported Python {major}.{minor}. Use Python 3.10 or 3.11 for TensorFlow."
    )
'

echo "${PYTHON_BIN}"
