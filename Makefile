.PHONY: dev backend frontend test build seed

# One command: install anything missing, then run backend (:8000) + frontend (:5173).
dev:
	./scripts/dev.sh

backend:
	cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000

frontend:
	cd frontend && npm run dev

test:
	cd backend && .venv/bin/python -m pytest -q

build:
	cd frontend && npm run build

# Regenerate the deterministic demo irrigation history (B1 too-wet, B4 top too-dry).
seed:
	cd backend && .venv/bin/python -m scripts.seed_irrigation
