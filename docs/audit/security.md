# Vino: Security & Compliance Audit

Date: 2026-07-10 · Auditor: automated security/compliance pass · Scope: full git history (22 commits, all refs), working tree at `eb0c1bf` + WIP, `.github/workflows/`, backend, frontend, docs.
Context: public GitHub repo; hackathon IP notice (docs/BRIEF.md §"Data & IP notice") forbids publishing TerraClim data, research assets, starter files, or credentials. Backend and frontend are mid-upgrade by other agents; findings target committed state and structural patterns, not transient WIP.

**Headline: no secret, token, or credential exists anywhere in git history.** The one Critical (photo-upload directory not gitignored) was **remediated mid-audit** in commit `eb0c1bf`; the fix is verified in Finding 1. The top remaining open issue: the repo is public despite the brief's own binding "keep private" rule.

Severity totals: **1 Critical (remediated, verified) · 1 High · 4 Medium · 4 Low** (plus verified-clean checks in §V).

---

## Findings

### 1. CRITICAL: Photo upload directory `backend/app/data/photos/` had no gitignore pattern (**REMEDIATED mid-audit, fix verified**)

Contract v2 §C (docs/API_CONTRACT.md) is explicit: `POST /api/photos` "stores file under `backend/app/data/photos/` (gitignored)". At audit start the pattern existed in neither `.gitignore` nor `backend/.gitignore`, meaning the moment the wave-2 photo endpoint landed and someone ran `git add -A` (the WIP-snapshot commits in history show exactly this habit, e.g. `9d5d623` swept in untracked `mswp_map.json`), grower photos would have been committed to a **public** repo. Field-Mode camera captures carry EXIF GPS of a real vineyard, a privacy leak as well as an IP-notice problem, and public history is effectively irreversible.

Evidence at audit start:

```
$ git check-ignore -v backend/app/data/photos/abc.jpg
(exit 1: NOT IGNORED)
```

**Remediation (coordinator, commit `eb0c1bf` "WIP snapshot + gitignore photo uploads directory"):** root `.gitignore` lines 46-47 now read `backend/app/data/photos/*` + `!backend/app/data/photos/.gitkeep`.

**Fix verified after remediation:**

```
$ git check-ignore -v backend/app/data/photos/abc.jpg
.gitignore:46:backend/app/data/photos/*     backend/app/data/photos/abc.jpg
$ git check-ignore -v backend/app/data/photos/x/y.png
.gitignore:46:backend/app/data/photos/*     backend/app/data/photos/x/y.png
$ git check-ignore -v backend/app/data/photos/.gitkeep
.gitignore:47:!backend/app/data/photos/.gitkeep   backend/app/data/photos/.gitkeep
```

Subdirectories and all extensions are covered; only `.gitkeep` is trackable. Status: **closed**. Optional hardening (defence in depth, matching the cache pattern): mirror it in `backend/.gitignore` as `app/data/photos/*` so the rule survives operations run with `backend/` as the repo-relative root, and keep the tripwire CI (Finding 6) as the backstop against `git add -f`.

---

### 2. HIGH: Repo is public, contradicting the brief's own binding team rule

docs/BRIEF.md line 63 (committed in `aca7c0a`):

> "**Team rule derived from this:** the TerraClim data pack must NEVER be committed to this repository (gitignored path: `backend/app/data/datapack/`). Keep the repository private for the duration of the hackathon."

The repo is public today. Nothing confidential is currently in it (verified in §V), but the Day-0 starter kit and datapack arrive 16 July; from that moment a single `git add -f`, a pattern gap (see Finding 1), or a screenshot pasted into docs publishes TerraClim assets with no undo. Public visibility removes the entire safety margin the IP notice assumes. It also means the detailed kick-off brief ("data-pack/starter-kit brief arrives at kick-off", a *challenge material* under the IP notice) must never be captured into docs/ the way the public web brief was.

**Fix:** flip the repository to private until the 20 July submission (Settings → General → Danger Zone → Change visibility), or obtain written TerraClim permission to keep it public and record that in docs/BRIEF.md. Note GitHub Pages on a private repo requires a paid plan. If Pages must stay, accept the risk explicitly and rely on Findings 1 and 6 as compensating controls, and never point the deployed frontend at a backend serving real TerraClim data.

---

### 3. MEDIUM: Other contracted runtime-state files not gitignored: `user_blocks.geojson`, `validation_readings.json`

Same failure mode as Finding 1 (before its fix), lower blast radius. Contract v2 §C persists pressure-bomb readings to `backend/app/data/validation_readings.json`; §F persists user-traced blocks (already implemented in WIP `backend/app/services.py`, `_USER_BLOCKS_PATH = DATA_DIR / "user_blocks.geojson"`, line 138). Both are runtime user data on a public repo and will be swept up by the next WIP snapshot once the app is exercised. The `eb0c1bf` remediation covered photos only. These remain open (re-verified after that commit):

Evidence:

```
$ git check-ignore -v backend/app/data/user_blocks.geojson      → NOT IGNORED
$ git check-ignore -v backend/app/data/validation_readings.json → NOT IGNORED
```

**Fix:** add to root `.gitignore`:

```
backend/app/data/user_blocks.geojson
backend/app/data/validation_readings.json
```

(Keep the seed files `irrigation_log.json`, `blocks.geojson`, `kc_curves.json`, `stress_targets.json`, `mswp_map.json` tracked: they are authored fixtures, not runtime output. `irrigation_log.json` is the one hybrid: seeded but appended to at runtime by `POST /api/irrigation`; acceptable for the demo, but be aware demo-day log entries will show up as diffs.)

---

### 4. MEDIUM: Photo upload/serving security requirements are unspecified in the contract

Contract v2 §C defines the endpoints (`POST /api/photos` multipart; `GET /api/photos/file/{photo_id}`) but is silent on every security property. Since the contract is the binding build spec for the wave-2 agent, unstated requirements will not be built. Risks if built naively: HTML/SVG polyglot uploaded as "image" then served and rendered (stored XSS on the API origin), path traversal via `photo_id`/filename reaching arbitrary files (`GET /api/photos/file/../../settings.json` would leak the TerraClim token), attacker-controlled filenames overwriting `blocks.geojson` or other data files, unbounded upload size (disk DoS), and EXIF GPS retention (Finding 1).

**Fix: add these as binding bullets to contract §C (and verify in the implementation):**
1. Validate content by decoding with Pillow (`Image.open` + `verify()`), accept only JPEG/PNG/WebP/HEIC-decodable input; reject on failure with 415. Never trust the client `Content-Type` or filename extension.
2. **Re-encode** the decoded image to JPEG before storing. This simultaneously strips EXIF/GPS, destroys polyglot payloads, and normalizes format.
3. `photo_id` is server-generated (`uuid4().hex`); stored filename is exactly `{photo_id}.jpg` inside `photos/`. Client filename is discarded, never used in any path. Serving route validates `photo_id` against `^[a-f0-9]{32}$` and additionally checks `path.resolve().is_relative_to(PHOTOS_DIR)` before opening.
4. Serve with `media_type="image/jpeg"`, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline; filename="{photo_id}.jpg"`. Never serve SVG or reflect uploaded bytes with a sniffable type.
5. Enforce a size cap (e.g. 10 MB) by streaming with a hard limit, not by reading the whole body first; return 413.
6. Store `note` text JSON-escaped only (it is returned to the frontend; React escapes by default; do not ever `dangerouslySetInnerHTML` analysis/note fields).

---

### 5. MEDIUM: Pages deploy workflow: third-party action pinned by tag, with a `contents: write` token

`.github/workflows/deploy-pages.yml` uses `peaceiris/actions-gh-pages@v4` (mutable tag) and grants the job `permissions: contents: write`, passing `${{ secrets.GITHUB_TOKEN }}` to the action. If the `v4` tag were ever re-pointed to malicious code (supply-chain compromise), that code holds a token that can push to any branch of this public repo and deface the public site. Positives worth keeping: workflow triggers only on `push` to named branches + `workflow_dispatch` (no `pull_request_target` pwn-request surface), no custom secrets are referenced, `concurrency` is set, and `force_orphan: true` keeps gh-pages history from accumulating.

Evidence (`.github/workflows/deploy-pages.yml` lines 9-10, 36-38):

```yaml
permissions:
  contents: write
...
      - uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
```

**Fix (either):**
- Pin all three actions to full commit SHAs (`gh api repos/peaceiris/actions-gh-pages/git/ref/tags/v4 --jq .object.sha`, same for `actions/checkout` and `actions/setup-node`), e.g. `uses: peaceiris/actions-gh-pages@<40-char-sha> # v4`; or
- Preferred: switch to first-party Pages deployment (`actions/configure-pages` + `actions/upload-pages-artifact` + `actions/deploy-pages`) which needs only `permissions: pages: write, id-token: write`, dropping `contents: write` entirely and eliminating the gh-pages branch.
- For a 9-day hackathon, tag-pinning first-party `actions/*` is acceptable; the third-party action is the one to pin or replace.

---

### 6. MEDIUM: No automated guardrail enforcing the IP notice (gitignore is the only control)

Every control keeping TerraClim data out of the public repo is a passive gitignore pattern, which `git add -f` silently bypasses and which cannot catch new paths (Finding 1, a real gap since fixed, and the still-open Finding 3 prove patterns get missed). The datapack lands Day 0; multiple agents commit rapidly with `git add -A` WIP snapshots. There is also no secret-scanning push protection on the repo. Other IP leak paths to close: screenshots containing datapack-derived maps pasted into `docs/`, datapack-derived JSON written outside `datapack/` (the DataPackProvider's zonal stats flow through `data/cache/`, covered, but keep it that way), and demo recordings.

**Fix: add a tripwire CI job (new workflow, runs on every push) plus a local pre-commit hook, both failing when the git index contains:**
- any path under `backend/app/data/datapack/`, `backend/app/data/photos/`, `backend/app/data/cache/` (except `.gitkeep`)
- `backend/app/data/settings.json`, `.env` at any depth
- `*.tif`, `*.tiff`, `*.nc`, or any blob > 5 MB (datapack rasters are large; nothing legitimate in this repo is)

Example check: `git ls-files | grep -E '(^|/)(datapack|photos)/|data/settings\.json|\.env$|\.(tif|tiff|nc)$' && exit 1`. Also enable GitHub secret scanning + push protection (Settings → Code security), free on public repos, takes one minute. Team rule for demo day: screenshots/screen-recordings only of the Open-Meteo/fixture-backed app, never of datapack layers.

---

### 7. LOW: Unauthenticated mutating endpoints (acceptable for demo; bound them)

All write endpoints are unauthenticated: `POST /api/irrigation` (appends to `irrigation_log.json`), and contracted `POST /api/blocks`, `DELETE /api/blocks/{id}`, `POST /api/settings/provider`, `POST /api/settings/cache/refresh`, `POST /api/photos`. For a localhost demo this is fine. Current input validation is decent (`IrrigationEvent.mm: Field(ge=0)`, `BattlePlanRequest` bounded, `days` params capped in `backend/app/schemas.py` / `routes/blocks.py`), but `mm` has no upper bound and the log grows without limit.

**Fix / contract checkpoints:**
- `IrrigationEvent.mm`: add `le=200` (no vineyard applies 200 mm in a day); optionally cap log length.
- `DELETE /api/blocks/{id}`: the contract already limits it to user-created blocks. When implemented, verify seed blocks B1-B7 are refused (409/403), and that user-block geometry is validated (ring closure, vertex count ≤ 64, lon/lat in range) before persisting.
- `POST /api/settings/provider` is the most sensitive write (accepts the TerraClim token, triggers a live validation call). Ensure its error response echoes provider-API error *category* only, never the submitted token; rate-limit is overkill for the demo but never deploy this endpoint on a public URL without auth.

---

### 8. LOW: CORS allow-all: correct for the demo, must change before any real deployment

`backend/app/main.py` lines 29-35: `allow_origins=["*"]` with `allow_credentials=False`. The `False` is the right call (starlette would refuse `*`+credentials anyway; nothing cookie-based can be riding along). This is fine while the backend binds to localhost for judges.

**Before production (or any tunnel/public exposure):** pin `allow_origins` to the actual frontend origin(s) (e.g. the Pages URL), restrict `allow_methods`/`allow_headers` to what the contract uses, and add authentication to all mutating endpoints (Finding 7). Record this as a known pre-production task in the README.

---

### 9. LOW: Token-at-rest and leak-vector hygiene (current code is clean; keep it that way)

Verified clean today, the design is right:
- Token enters via env only (`backend/app/config.py:31`, `TERRACLIM_TOKEN`), `.env` ignored in both gitignores, `.env.example` ships empty values.
- Never returned: `GET /api/health` returns only `provider` name + `terraclim_ready` boolean (`routes/health.py`). Contract §D mandates masking (`token_status: "set (••••1234)"`, "token value never returned") and the frontend type documents write-only semantics (`frontend/src/types/api.ts:285`).
- Never logged: the only token-adjacent log line is `factory.py:54` "TERRACLIM_TOKEN present but provider not ready" (presence, not value). `explain.py:77` and `factory.py:33,43` log `str(exc)`; httpx exception strings include URL + status, not request headers, and both the TerraClim stub (`Token` header, `terraclim.py:25`) and the Anthropic call (`x-api-key` header, `explain.py:37`) carry credentials in headers, so exception logging cannot leak them **as long as tokens never move into query strings**.
- The settings persistence layer landed mid-audit (`backend/app/settings_store.py`, commit `eb0c1bf`) and was reviewed: it uses a strict key allowlist (`ALLOWED_KEYS = {"provider", "terraclim_token", "demo_date"}`, line 13), writes only to the gitignored `data/settings.json`, and its one log line (`settings_store.py:30`) logs the `OSError` (path, errno), never file contents. Clean, with one gap: `STORE_PATH.write_text(...)` (line 28) creates the file with default umask perms (typically 0644, world-readable), while it may hold the TerraClim token.

**Guardrails to hold during wave-2 implementation:**
- When `TerraClimProvider.get_daily/get_forecast` are filled in on Day 0: token stays in headers, never in URL params (URLs end up in logs, caches, and exception messages).
- `settings_store.save()` should create the file `0600`: e.g. `fd = os.open(STORE_PATH, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)` then write, or `STORE_PATH.touch(mode=0o600)` before `write_text`. Never include `settings.json` contents in any diagnostic endpoint (`GET /api/settings` must build its masked view from memory, not echo the file).
- The masking last-4 (`••••1234`) is fine; do not extend it to more characters.
- Frontend: no `VITE_*` variable may ever carry a token: anything `VITE_` is baked into the public Pages bundle. Current `frontend/.env.example` only has `VITE_API_BASE`. Correct.

---

### 10. LOW: PWA service worker caches `/api/*` responses on visitor devices for 24 h

`frontend/vite.config.ts` lines 40-51: Workbox `NetworkFirst` runtime cache for any same-origin path starting `/api/`, 64 entries, 24 h. On the Pages site there is no backend so this is inert, and for the localhost demo it is the feature it is meant to be (offline resilience). But it means that if a backend serving **real TerraClim data** is ever fronted by this PWA, TerraClim responses persist in every visitor's browser CacheStorage, a data-redistribution vector under the IP notice.

**Fix:** none needed now. Note it as a constraint: the deployed public PWA must only ever talk to fixture/Open-Meteo-backed APIs, or the API cache rule must be removed before pointing it at TerraClim-backed data.

---

## V. Verified clean (evidence of absence)

**V1. No secret in any of the 22 commits across all refs.** (Initial sweep covered 20 commits; the two that landed mid-audit, `5cb9ebb` and `eb0c1bf`, were re-scanned with the same patterns: clean. `eb0c1bf`'s hits are this audit report quoting the patterns, plus the pre-existing benign matches.)

```
$ git rev-list --all | wc -l
22
$ git grep -iE "(secret|apikey|api[_-]key|password|Bearer |AKIA|ghp_|gho_|github_pat_|sk-|xox[bap]-|PRIVATE KEY)" $(git rev-list --all)
# → only: variable names (api_key: str, x-api-key header key), the workflow's
#   ${{ secrets.GITHUB_TOKEN }} reference, gitignore comments, and one
#   package-lock sha512 false-positive ("...zAkIa..." matching AKIA case-insensitively).
$ git grep -iE "(TERRACLIM_TOKEN|AI_KEY)\s*=\s*['\"]?[A-Za-z0-9_-]{8,}" $(git rev-list --all)   # no hits
$ git grep -E "Bearer [A-Za-z0-9_.-]{10,}" $(git rev-list --all)                                # no hits
```

**V2. No sensitive file was ever added in history.** `git log --all --diff-filter=A --name-only` over every commit shows the only env/cache/settings-adjacent paths ever added are `backend/.env.example`, `frontend/.env.example`, and `backend/app/data/cache/.gitkeep`. No `.env`, no `settings.json`, no `cache/*.json`, no datapack file, no photo, no `*.tif`/`*.nc`, ever. The 14 Open-Meteo cache JSONs in the working tree are untracked and ignored.

**V3. Gitignore coverage (git check-ignore -v), passing paths:** `.env` (`.gitignore:2`), `backend/.env` (`backend/.gitignore:5`), `frontend/.env` + `.env.local` (`.gitignore:2,4`), `backend/app/data/settings.json` (`.gitignore:28`), `backend/app/data/datapack/**` (`.gitignore:32`), `backend/app/data/cache/*` any extension (`.gitignore:26`, plus `backend/.gitignore:7` for `*.json`), `backend/app/data/photos/*` incl. subdirs (`.gitignore:46`, added `eb0c1bf`, see Finding 1), `*.tif`/`*.tiff`/`*.nc` at any depth (`.gitignore:33-35`), `dist/`, `__pycache__/`, `.pytest_cache/`, `*.tsbuildinfo`. The only remaining failing paths are Finding 3's two files.

**V4. Public-repo content review:** zero email addresses in tracked files (regex sweep); sole commit author identity is `Claude <noreply@anthropic.com>`; no internal or real TerraClim endpoint committed: `backend/app/providers/terraclim.py:21` deliberately uses the placeholder `https://api.terraclim.example/api` ("confirmed on Day 0"); the only real URLs are public Open-Meteo, Anthropic API, OSM tiles, and localhost. docs/BRIEF.md reproduces the *public* hackathon webpage (low risk); the confidential kick-off materials are not present and must never be (Finding 2/6).

---

## Must fix before hackathon day (16 July)

| # | Action | Finding | Status |
|---|--------|---------|--------|
| 1 | ~~Add `backend/app/data/photos/` gitignore pattern~~ | 1 (Critical) | **DONE** (`eb0c1bf`, verified) |
| 2 | Make the repo private (or obtain and record written TerraClim permission to stay public) | 2 (High) | open |
| 3 | Add `user_blocks.geojson` + `validation_readings.json` ignore lines | 3 (Medium) | open |
| 4 | Add the tripwire CI job + pre-commit hook; enable GitHub secret scanning & push protection | 6 (Medium) | open |
| 5 | Amend contract §C with the six upload-security requirements (re-encode, UUID ids, nosniff, size cap) so wave-2 builds them in | 4 (Medium) | open |
| 6 | SHA-pin `peaceiris/actions-gh-pages` or move to first-party Pages actions and drop `contents: write` | 5 (Medium) | open |
| 7 | Day-0 checklist when the real TerraClim API is wired: token in header only, never in URL; `settings_store.save()` writes 0600; no datapack screenshot/recording ever enters docs or the Pages site | 9, 6, 10 | open |

Item 3 is one minute of work; items 2-3 close the remaining repo-exposure gap. Do them first.
