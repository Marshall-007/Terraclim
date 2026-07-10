#!/usr/bin/env bash
# Start the Vino backend and frontend together for local development.
# Usage: ./scripts/dev.sh  (or `make dev`)
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -d backend/.venv ]; then
  echo "==> Creating backend virtualenv"
  python3 -m venv backend/.venv
  backend/.venv/bin/pip install -q -r backend/requirements.txt
fi

if [ ! -d frontend/node_modules ]; then
  echo "==> Installing frontend dependencies"
  (cd frontend && npm install)
fi

echo "==> Starting backend on :8000 and frontend on :5173 (Ctrl-C stops both)"
trap 'kill 0' EXIT
(cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000) &
(cd frontend && npm run dev) &
wait
