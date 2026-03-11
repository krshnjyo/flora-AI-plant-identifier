#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PYTHON_BIN="$(bash "${SCRIPT_DIR}/_python.sh")"

exec "${PYTHON_BIN}" "${ROOT_DIR}/plant_ai/model_service/app.py"
