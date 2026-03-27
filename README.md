# Flora

Flora is a full-stack plant intelligence platform that identifies plant species and likely diseases from images, then presents treatment and care information through a web interface.

It includes:
- a Next.js frontend (`frontend/`) for user and admin workflows
- a Next.js backend (`backend/`) for API routes
- a Python inference service (`plant_ai/`) serving `/predict`
- PostgreSQL for users, catalog, relations, and scan history
- JSON catalogs as a resilient fallback data source

## About The Project

### What Flora Solves

- Accepts a plant **leaf** image upload and returns plant or disease results.
- Keeps a structured plant and disease knowledge base.
- Supports user auth, scan history, and admin catalog management.
- Stays available even when DB lookups fail by falling back to local JSON catalog files.

### Core Capabilities

- Image-based identification (`/api/identify`) via local model service (`plant_ai/model_service/app.py`)
- Leaf-likelihood guard in model service to reject likely non-leaf images with a retry message.
- Plant and disease browsing:
  - `/gallery`
  - `/disease-gallery`
- Full result pages:
  - `/results/plant/:name`
  - `/results/disease/:name`
- Admin CRUD and relation management:
  - plants
  - diseases
  - plant-disease links
  - catalog sync
- Security and operations:
  - cookie-based JWT auth
  - role guards (`user`, `admin`)
  - rate limiting with Redis or in-memory fallback
  - admin audit logs + API telemetry

## Architecture Overview

```text
User Browser
   |
   v
Frontend (Next.js App Router, port 3000)
   |
   v
Backend API (Next.js Pages API, port 4000)
   | \
   |  \--> Local Model Service (`/predict`)
   |
   +--> PostgreSQL / Neon (users, plants, diseases, history, telemetry)
   |
   +--> Local JSON Catalog (backend/data/*) as fallback
   |
   +--> Optional Redis REST (rate limit + short cache)
```

## Monorepo Structure

```text
flora/
├── frontend/
│   ├── app/                  # App Router pages
│   ├── components/           # Shared UI/animation components
│   └── lib/                  # API client + frontend helpers
├── backend/
│   ├── pages/api/            # API routes
│   ├── lib/                  # DB/auth/upload/resolvers/utilities
│   ├── data/                 # Plant + disease JSON catalogs
│   ├── public/               # Uploaded images + static assets
│   ├── database/schema.sql   # Tables + procedures
│   ├── scripts/sync-catalog.mjs
│   └── tests/                # Node test suites
├── plant_ai/
│   ├── model_service/app.py  # Flask inference API (`/predict`)
│   ├── plant_model.h5         # Trained TensorFlow model
│   ├── run_model.sh           # Model service launcher (Python version guard)
│   ├── install_model_deps.sh  # Dependency installer (Python version guard)
│   └── requirements.txt       # Python deps for inference service
└── README.md
```

## Tech Stack

- Node.js 22
- npm
- Next.js 15
- TypeScript
- PostgreSQL / Neon
- Optional:
  - Python model service (Flask + TensorFlow, Python 3.10/3.11)
  - Upstash Redis REST

## Production Deployment

The current production shape is:

- frontend: Vercel
- backend API: Render
- model service: Render
- database: Neon PostgreSQL

Important production notes:

- The frontend proxies `/api/*` and backend-served assets through Vercel rewrites so browser auth stays same-origin on the frontend host.
- The backend must allow the exact frontend origin in `CORS_ORIGIN`.
- Cross-site auth cookies require `AUTH_COOKIE_SAMESITE=none` when frontend and backend are on different domains.
- The model service must be awake for `/api/identify` to work. On sleeping Render plans, first requests after idle can fail with `502`, `503`, or `hibernate-wake-error`.
- For reliable identify traffic, use an always-on Render plan for the model service.

See also: [`DEPLOYMENT.md`](./DEPLOYMENT.md)

## Model Scope (Important)

The current `plant_ai` model is a **leaf disease classifier**, not a general object classifier.

It recognizes these classes:
- `Pepper__bell___Bacterial_spot`
- `Pepper__bell___healthy`
- `PlantVillage`
- `Potato___Early_blight`
- `Potato___Late_blight`
- `Potato___healthy`
- `Tomato_Bacterial_spot`
- `Tomato_Early_blight`
- `Tomato_Late_blight`
- `Tomato_Leaf_Mold`
- `Tomato_Septoria_leaf_spot`
- `Tomato_Spider_mites_Two_spotted_spider_mite`
- `Tomato__Target_Spot`
- `Tomato__Tomato_YellowLeaf__Curl_Virus`
- `Tomato__Tomato_mosaic_virus`
- `Tomato_healthy`

Because this is closed-set, non-leaf photos can be misclassified if not guarded.
To reduce this, the model service returns a retry hint for likely non-leaf images.

## Detailed Setup And Implementation Steps

Follow these steps in order for a clean local implementation.

### 1. Install Dependencies

From repository root:

```bash
npm --prefix frontend install
npm --prefix backend install
npm run install:model
```

`npm run install:model` installs Python dependencies for `plant_ai/model_service/app.py`.
It auto-selects Python 3.11 or 3.10 and exits with a clear error for unsupported versions.
If you prefer an isolated Python environment, create one first:

```bash
python3.11 -m venv .venv-model
source .venv-model/bin/activate
python3 -m pip install -r plant_ai/requirements.txt
```

### 2. Configure Environment Variables

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
```

Create `backend/.env.local`:

```env
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/flora
JWT_SECRET=replace-with-a-long-random-secret
CORS_ORIGIN=http://localhost:3000,http://127.0.0.1:3000
LOCAL_MODEL_ENDPOINT=http://127.0.0.1:5050/predict
AUTH_COOKIE_SAMESITE=lax

# Optional (Redis-backed cache/rate limit)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

Generate a strong JWT secret if needed:

```bash
openssl rand -hex 32
```

### 3. Start PostgreSQL

Use local PostgreSQL or Docker.

Docker example:

```bash
docker run --name flora-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=flora \
  -p 5432:5432 \
  -d postgres:16
```

### 4. Initialize Database Schema

Run:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:5432/flora" -f backend/database/schema.pg.sql
```

If using Neon, use your Neon connection string instead:

```bash
psql "$DATABASE_URL" -f backend/database/schema.pg.sql
```

This creates:
- core tables (`users`, `plants`, `plant_diseases`, `scan_history`, etc.)
- relation and alias tables
- admin audit and request telemetry tables
- PostgreSQL functions used by admin APIs when present

### 5. Sync JSON Catalog Into PostgreSQL

Run:

```bash
npm --prefix backend run db:sync
```

What this does:
- reads `backend/data/plants/*.json`
- reads `backend/data/diseases/*.json`
- upserts `plants`
- upserts `plant_diseases`
- links `plant_disease_map`
- generates aliases in `plant_aliases` and `disease_aliases`
- ensures missing schema/index/constraint compatibility where needed

### 6. Start Model Service, Backend, And Frontend

Terminal 1:

```bash
npm run dev:model
```

Optional: tune leaf guard threshold when starting model service:

```bash
MIN_LEAF_LIKELIHOOD=0.02 npm run dev:model
```

Terminal 2:

```bash
npm run dev:backend
```

Terminal 3:

```bash
npm run dev:frontend
```

Open:
- frontend: `http://localhost:3000`
- backend: `http://localhost:4000`

### 7. Create First User And Promote Admin

Register through UI (`/register`) or API:

```bash
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Admin User","email":"admin@example.com","password":"password123"}'
```

Promote this user in PostgreSQL / Neon:

```sql
UPDATE users SET role = 'admin' WHERE email = 'admin@example.com';
```

Then log out and log back in so the updated role is reflected in a fresh auth token.

### 8. Smoke Test Key Flows

Plant list:

```bash
curl http://localhost:4000/api/plants
```

Disease list:

```bash
curl http://localhost:4000/api/diseases
```

Identify upload:

```bash
curl -X POST http://localhost:4000/api/identify \
  -F "image=@/absolute/path/to/leaf.jpg" \
  -F "output_mode=smart"
```

## How The Project Works Internally

### Identification Flow (`POST /api/identify`)

1. Frontend uploads `multipart/form-data` with:
   - `image` (JPG/PNG/WEBP, max 5MB)
   - `output_mode` (`smart`, `plant`, `disease`)
2. Backend applies rate limiting.
3. Image is saved in `backend/public/uploads`.
4. Backend calls the local model service (`LOCAL_MODEL_ENDPOINT`) for class + confidence output.
5. Model service computes `leaf_likelihood` and may return `needs_retry=true` for likely non-leaf images.
6. If `needs_retry=true`, backend returns `RETRY_WITH_LEAF` (HTTP 422) so UI asks user to upload a clearer leaf image.
7. Otherwise resolver logic maps model output to canonical DB/catalog entries.
8. Decision engine selects response entity type (`plant`, `disease`, or `not_found`).
9. Scan event is stored in `scan_history`.
10. API returns structured response envelope with resolved names and metadata.

### Catalog Query Strategy

- `/api/plants` and `/api/diseases` are DB-first.
- If DB is unavailable or missing rows, APIs fallback to local JSON catalog.
- Responses are cached short-term (Redis if configured, else in-memory).

### Auth And Access Control

- JWT stored in HTTP-only cookie (`flora_token`).
- `requireUser` protects authenticated routes (example: `/api/history`).
- `requireAdmin` protects admin routes (example: `/api/admin/*`).
- In production, Vercel rewrites keep browser auth requests same-origin while forwarding them to the Render backend.

### Telemetry And Audit

- API wrapper records per-route request telemetry in `api_request_telemetry`.
- Admin mutations record audit events in `admin_audit_logs`.

## JSON Catalog Contracts (Important)

Validation is enforced by:
- `backend/lib/plant-json-schema.ts`
- `backend/lib/disease-json-schema.ts`

At minimum, keep these high-value fields correct:
- plant JSON:
  - `common_name`
  - `scientific_name`
  - `species`
  - `plant_description`
  - `common_diseases`
  - `confidence_score`
- disease JSON:
  - `disease_name`
  - `affected_species`
  - `disease_description`
  - `symptoms`
  - `causes`
  - `prevention_methods`
  - `treatment_methods`
  - `severity_level`

If schema validation fails, admin create/update APIs reject payloads.

## Implementation Playbooks

### Add A New Plant Profile

1. Add a valid JSON file in `backend/data/plants/`.
2. If needed, add matching image in `backend/public/plants/`.
3. Ensure `image_url` in JSON points to `/plants/<filename>`.
4. Run:

```bash
npm --prefix backend run db:sync
```

5. Verify:
   - `GET /api/plants`
   - frontend `/gallery`
   - `GET /api/plant/<name>`

### Add A New Disease Profile

1. Add a valid JSON file in `backend/data/diseases/`.
2. Add image in `backend/public/diseases/`.
3. Ensure JSON `image_url` points to `/diseases/<filename>`.
4. Run:

```bash
npm --prefix backend run db:sync
```

5. Verify:
   - `GET /api/diseases`
   - frontend `/disease-gallery`
   - `GET /api/disease/<name>`

### Add A New Backend API Route

1. Create route under `backend/pages/api/...`.
2. Wrap handler with `withMethods([...], handler)`.
3. Validate payloads (prefer Zod).
4. Return responses via:
   - `sendSuccess`
   - `sendError`
5. If route needs auth:
   - `requireUser` or `requireAdmin`
6. Add/adjust tests in `backend/tests/`.

### Add A New Frontend Page

1. Add route in `frontend/app/...`.
2. Use `apiFetch`/`apiFetchJson` from `frontend/lib/api-client.ts`.
3. Keep backend response envelope handling (`success` + `error`).
4. Add navigation links/actions from existing pages.
5. Test with both success and error API responses.

## Important Routes

Frontend:
- `/identify`
- `/gallery`
- `/disease-gallery`
- `/results/[type]/[name]`
- `/history`
- `/admin`
- `/login`
- `/register`

Backend API:
- `POST /api/identify`
- `GET /api/plants`
- `GET /api/diseases`
- `GET /api/plant/:name`
- `GET /api/disease/:name`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/history`
- `GET|PUT|DELETE /api/admin/users`
- `POST|PUT|DELETE /api/admin/plant`
- `POST|PUT|DELETE /api/admin/disease`
- `POST|DELETE /api/admin/relations`
- `POST /api/admin/sync-catalog`
- `GET /api/admin/stats`

## Scripts

Root:

```bash
npm run install:model
npm run dev:model
npm run dev:frontend
npm run dev:backend
npm run build:frontend
npm run build:backend
```

Backend:

```bash
npm --prefix backend run dev
npm --prefix backend run build
npm --prefix backend run start
npm --prefix backend run lint
npm --prefix backend run typecheck
npm --prefix backend run test
npm --prefix backend run db:sync
```

Frontend:

```bash
npm --prefix frontend run dev
npm --prefix frontend run build
npm --prefix frontend run start
npm --prefix frontend run lint
npm --prefix frontend run typecheck
```

## PostgreSQL Functions Used By Admin APIs

Defined in `backend/database/schema.pg.sql`:
- `sp_upsert_plant`
- `sp_delete_plant`
- `sp_upsert_disease`
- `sp_delete_disease`
- `sp_link_plant_disease`
- `sp_unlink_plant_disease`
- `sp_update_user_role_status`
- `sp_delete_user`

If these are missing or outdated, admin mutations fall back to direct SQL for the core update/delete paths.

## Troubleshooting

- `IDENTIFICATION_FAILED`:
  - ensure the model service is running and `LOCAL_MODEL_ENDPOINT` is reachable.
  - check `https://<model-service>/health`.
  - if Render returns `hibernate-wake-error`, the model service is sleeping and needs time to wake or an always-on plan.
- `RETRY_WITH_LEAF`:
  - upload a close, clear leaf photo (not fruit/tuber/whole-plant scene).
  - if too strict, lower `MIN_LEAF_LIKELIHOOD` when starting model service (for example `0.01`).
- Potato image predicted as tomato:
  - this usually means the image is out-of-domain (non-leaf) or low-quality for disease-style leaf classification.
- CORS issues:
  - ensure `CORS_ORIGIN` exactly matches the frontend origin.
- Auth works locally but not on Vercel/Render:
  - set backend `AUTH_COOKIE_SAMESITE=none`.
  - keep frontend requests same-origin via the Vercel rewrites in `frontend/next.config.mjs`.
- DB connection errors:
  - verify PostgreSQL / Neon is reachable and `DATABASE_URL` is correct.
- Empty gallery/disease list:
  - run `npm --prefix backend run db:sync`.
- Admin role missing:
  - run `UPDATE users SET role = 'admin' WHERE email = '<your-email>';` in Neon / PostgreSQL.
- Admin function errors:
  - re-run `backend/database/schema.pg.sql`.
