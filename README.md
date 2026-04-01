# Flora

Flora is a full-stack plant intelligence application that takes a plant image, runs local ML inference, resolves the result against a structured catalog, and opens detailed plant or disease pages for the user.

This repository is a small monorepo with three cooperating parts:

- `frontend/`: Next.js App Router UI
- `backend/`: Next.js Pages API
- `plant_ai/`: Flask + TensorFlow model service

## Project Summary

Flora is more than an image classifier. It combines:

- image upload and prediction
- catalog-backed plant and disease browsing
- result pages with structured care or pathology content
- user accounts and scan history
- admin CRUD and relation management
- PostgreSQL persistence with JSON fallback for public catalog flows

In practice, Flora behaves like a catalog application with an ML-powered entry point into that catalog.

## What Problem Flora Solves

The project is designed to help a user:

1. upload a plant image
2. infer a likely plant or disease
3. map that inference to a structured catalog record
4. read care, risk, treatment, and descriptive information in a clean UI

The backend protects the experience with extra logic the raw model does not provide on its own:

- leaf-likelihood rejection for obvious non-leaf photos
- confidence thresholds before direct routing
- plant and disease name normalization
- DB resolution with local JSON fallback
- history persistence for authenticated users

## Current Scope

### Seeded catalog in this repository

The versioned JSON catalog currently includes:

- Plants: `Potato`, `Tomato`, `Pepper`
- Diseases: `Early Blight`, `Late Blight`, `Bacterial Spot`

### Model scope

The ML model in `plant_ai/plant_model.h5` is a closed-set leaf-disease classifier. It is strongest when the input image is a clear close-up of a leaf.

This is important:

- Flora is not a general-purpose plant-recognition system
- out-of-domain images can be rejected before routing
- some model outputs can be broader than the currently seeded catalog
- unsupported detections may end in retry or unresolved-result messaging

## Architecture

### Component view

```mermaid
classDiagram
    class FrontendApp {
      Next.js App Router
      Public pages
      Auth pages
      History and settings
      Admin workspace
    }

    class BackendAPI {
      Next.js Pages API
      JWT auth
      Upload handling
      Resolver logic
      Admin CRUD
      Audit and telemetry
    }

    class ModelService {
      Flask API
      GET /health
      POST /predict
      TensorFlow model loading
      Leaf-likelihood heuristic
    }

    class PostgreSQL {
      users
      user_profiles
      plants
      plant_diseases
      scan_history
      audit and telemetry
    }

    class JsonCatalog {
      Plant JSON files
      Disease JSON files
      Media metadata
      Git-tracked seed source
    }

    class RedisOptional {
      Rate limiting
      Short-lived cache
    }

    FrontendApp --> BackendAPI : /api/* and proxied assets
    BackendAPI --> ModelService : POST /predict
    BackendAPI --> PostgreSQL : reads and writes
    BackendAPI --> JsonCatalog : fallback and sync source
    BackendAPI --> RedisOptional : cache and rate limit
```

### Identify request sequence

```mermaid
sequenceDiagram
    actor User
    participant FE as Frontend
    participant BE as Backend /api/identify
    participant ML as Model Service /predict
    participant DB as PostgreSQL
    participant JSON as Local JSON Catalog

    User->>FE: Upload image and choose mode
    FE->>BE: POST /api/identify
    BE->>BE: Rate limit and save upload
    BE->>ML: Forward image for inference
    ML-->>BE: class, confidence, plant and disease hints
    BE->>BE: Apply retry and confidence rules
    BE->>DB: Resolve against DB when available
    alt DB unavailable or unresolved
        BE->>JSON: Resolve against local catalog
    end
    BE->>DB: Save scan history for logged-in user
    BE-->>FE: Canonical result payload
    FE-->>User: Open plant page, disease page, or retry guidance
```

## Monorepo Layout

```text
flora/
├── frontend/
│   ├── app/                    # App Router pages and one local API route
│   ├── components/             # Shared UI, layout, animation
│   ├── lib/                    # API client and frontend utilities
│   └── public/                 # Static frontend assets
├── backend/
│   ├── pages/api/              # API routes
│   ├── lib/                    # Auth, DB, upload, cache, resolver helpers
│   ├── data/                   # Plant and disease JSON catalog
│   ├── database/               # PostgreSQL schema
│   ├── public/                 # Uploaded files and catalog images
│   ├── scripts/                # Catalog sync tooling
│   └── tests/                  # Backend tests
├── plant_ai/
│   ├── model_service/app.py    # Flask inference service
│   ├── plant_model.h5          # Trained TensorFlow model
│   ├── run_model.sh            # Local launcher
│   ├── install_model_deps.sh   # Python dependency installer
│   └── requirements.txt        # Python dependencies
├── DEPLOYMENT.md
├── render.yaml
└── README.md
```

## Frontend Surface

### Main routes

| Route | Purpose |
| --- | --- |
| `/` | Minimal landing page and entry into core workflows |
| `/identify` | Upload image, choose Smart, Plant, or Disease mode, and run detection |
| `/gallery` | Plant gallery |
| `/disease-gallery` | Disease gallery |
| `/results/plant/:name` | Plant detail view |
| `/results/disease/:name` | Disease detail view |
| `/history` | Authenticated scan history |
| `/settings` | Profile, avatar, password, and preferences |
| `/admin` | Role-gated admin workspace |
| `/login` | Sign in |
| `/register` | Create account |
| `/about` | Product and team overview |

### Frontend runtime notes

- `frontend/lib/api-client.ts` centralizes API requests, timeouts, auth credentials, and asset URL building
- `frontend/next.config.mjs` rewrites `/api`, `/uploads`, `/profiles`, `/plants`, `/diseases`, and `/gallery-result` to the backend in deployed environments
- result views intentionally use backend-served media
- `/api/strip-images` is a small App Router endpoint used by the footer strip

## Backend Surface

### API groups

| Route group | Purpose |
| --- | --- |
| `/api/health` | Environment and DB health checks |
| `/api/auth/register`, `/login`, `/logout`, `/me` | Authentication lifecycle |
| `/api/account/profile`, `/avatar`, `/password` | User profile management |
| `/api/plants`, `/api/plant/:name` | Plant listing and detail |
| `/api/diseases`, `/api/disease/:name` | Disease listing and detail |
| `/api/identify` | Upload-based inference pipeline |
| `/api/history` | User scan archive |
| `/api/admin/*` | Admin stats, users, catalog CRUD, relations, sync |

### Backend behavior that matters

- the backend is the main orchestration layer
- it merges DB rows with local JSON where needed
- it stores auth in an HTTP-only JWT cookie named `flora_token`
- it supports optional Redis REST for cache and rate limiting
- it records admin audit logs and request telemetry

## Data Model

The PostgreSQL schema in `backend/database/schema.pg.sql` defines the core application model:

- `users`
- `user_profiles`
- `plants`
- `plant_aliases`
- `plant_diseases`
- `disease_aliases`
- `plant_disease_map`
- `scan_history`
- `admin_audit_logs`
- `api_request_telemetry`

### Entity relationship sketch

```mermaid
erDiagram
    USERS ||--|| USER_PROFILES : has
    USERS ||--o{ SCAN_HISTORY : creates
    USERS ||--o{ ADMIN_AUDIT_LOGS : performs
    USERS ||--o{ API_REQUEST_TELEMETRY : triggers
    PLANTS ||--o{ PLANT_ALIASES : has
    PLANT_DISEASES ||--o{ DISEASE_ALIASES : has
    PLANTS ||--o{ PLANT_DISEASE_MAP : links
    PLANT_DISEASES ||--o{ PLANT_DISEASE_MAP : links
    PLANTS ||--o{ SCAN_HISTORY : resolved_for
    PLANT_DISEASES ||--o{ SCAN_HISTORY : resolved_for
```

## Catalog Strategy

Flora uses a hybrid catalog approach:

1. JSON files in `backend/data/` are the Git-tracked seed source
2. `npm --prefix backend run db:sync` imports that data into PostgreSQL
3. runtime APIs prefer the database when it is available
4. public browse flows can still work from local JSON if the DB is missing or down

This hybrid DB + JSON pattern is one of the central architectural ideas in the repository.

## ML Layer

The model service in `plant_ai/model_service/app.py` exposes:

- `GET /health`
- `POST /predict`

It handles:

- model loading
- image normalization and resize
- leaf-likelihood estimation
- inference over the TensorFlow model
- response packaging with confidence and class breakdowns

The backend then adds application-aware rules on top of that raw ML output.

## Local Development Setup

### Prerequisites

- Node.js `22.x`
- npm
- PostgreSQL 14+ or Neon
- Python `3.10` or `3.11`

### 1. Install dependencies

```bash
npm --prefix frontend install
npm --prefix backend install
npm run install:model
```

### 2. Configure environment variables

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
```

Create `backend/.env.local`:

```env
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/flora
JWT_SECRET=replace-with-a-long-random-secret-at-least-32-chars
JWT_ISSUER=flora-api
JWT_AUDIENCE=flora-client
CORS_ORIGIN=http://localhost:3000,http://127.0.0.1:3000
LOCAL_MODEL_ENDPOINT=http://127.0.0.1:5050/predict
AUTH_COOKIE_SAMESITE=lax

# Optional
AUTH_COOKIE_DOMAIN=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

Optional model-service settings:

```env
MODEL_PATH=plant_ai/plant_model.h5
MIN_LEAF_LIKELIHOOD=0.02
```

### 3. Start PostgreSQL

You can use local PostgreSQL or Docker.

Quick Docker example:

```bash
docker run --name flora-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=flora \
  -p 5432:5432 \
  -d postgres:16
```

### 4. Apply schema and sync the catalog

```bash
psql "$DATABASE_URL" -f backend/database/schema.pg.sql
npm --prefix backend run db:sync
```

### 5. Start the three runtimes

Terminal 1:

```bash
npm run dev:model
```

Terminal 2:

```bash
npm run dev:backend
```

Terminal 3:

```bash
npm run dev:frontend
```

### Local addresses

- frontend: `http://127.0.0.1:3000`
- backend: `http://127.0.0.1:4000`
- model service: `http://127.0.0.1:5050`

## Useful Scripts

### Repository root

| Command | Purpose |
| --- | --- |
| `npm run dev:frontend` | Start frontend dev server |
| `npm run dev:backend` | Start backend dev server |
| `npm run dev:model` | Start model service |
| `npm run install:model` | Install Python model dependencies |
| `npm run build:frontend` | Build frontend |
| `npm run build:backend` | Build backend |

### Backend

| Command | Purpose |
| --- | --- |
| `npm --prefix backend run test` | Run backend tests |
| `npm --prefix backend run typecheck` | Type-check backend |
| `npm --prefix backend run db:sync` | Sync JSON catalog into PostgreSQL |

### Frontend

| Command | Purpose |
| --- | --- |
| `npm --prefix frontend run typecheck` | Type-check frontend |
| `npm --prefix frontend run build` | Production build |

## Quick Smoke Tests

Once everything is running, these are the fastest sanity checks:

```bash
curl http://127.0.0.1:4000/api/health
curl http://127.0.0.1:5050/health
curl http://127.0.0.1:4000/api/plants
curl http://127.0.0.1:4000/api/diseases
```

For identify:

```bash
curl -X POST http://127.0.0.1:4000/api/identify \
  -F "image=@/absolute/path/to/leaf.jpg" \
  -F "output_mode=smart"
```

## Deployment Shape

The repository is currently set up for:

- frontend on Vercel
- backend API on Render
- model service on Render
- PostgreSQL on Neon

Important deployment details:

- the frontend uses rewrites so browser auth can stay same-origin
- the backend must allow the frontend origin in `CORS_ORIGIN`
- cross-site deployments usually require `AUTH_COOKIE_SAMESITE=none`
- cold starts on the model service can affect `/api/identify`

See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for deployment-specific instructions.

## Known Limitations

- The model is closed-set and leaf-focused.
- The richest repository-backed catalog coverage is currently for Potato, Tomato, Pepper, and three disease records.
- Some uploaded-file storage uses `backend/public`, which is simple locally but ephemeral on providers like Render.
- Public browse flows degrade gracefully via JSON fallback, but auth, admin, and history still depend on a working database.
- The repository contains backend tests, but not a comparable automated frontend test suite yet.

## Study Guide For New Contributors

If someone wants to understand the repo quickly, this reading order works well:

1. `frontend/app/identify/page.tsx`
2. `backend/pages/api/identify.ts`
3. `plant_ai/model_service/app.py`
4. `backend/data/`
5. `backend/database/schema.pg.sql`
6. `frontend/app/results/[type]/[name]/page.tsx`
7. `frontend/app/admin/page.tsx`

## Final Takeaway

Flora is a catalog-backed plant intelligence system with an ML-assisted entry flow, a PostgreSQL data model, admin tooling, and a resilient JSON fallback strategy. The most important thing to understand about the codebase is that the model is only one piece of the product; the real application value comes from how inference, catalog resolution, persistence, and UI routing are stitched together.
