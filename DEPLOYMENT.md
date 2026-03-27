# Deployment Guide

This repo deploys cleanly as:

- frontend on Vercel
- backend API on Render
- model service on Render
- database on Neon

## 1. Frontend on Vercel

Set the Vercel project root to `frontend`.

Required environment variables:

```env
NEXT_PUBLIC_API_BASE_URL=https://flora-frontend-app.vercel.app
BACKEND_ORIGIN=https://flora-backend-o6rc.onrender.com
```

This uses Vercel rewrites so browser requests stay same-origin on the frontend host and are then proxied to Render.
That avoids third-party-cookie problems for login and account loading.

## 2. Backend on Render

Set the Render service root to `backend`.

Build command:

```bash
npm install && npm run build
```

Start command:

```bash
npm run start
```

Required environment variables:

```env
DATABASE_URL=postgresql://...
JWT_SECRET=replace-with-a-long-random-secret
CORS_ORIGIN=https://YOUR-FRONTEND.vercel.app
LOCAL_MODEL_ENDPOINT=https://YOUR-MODEL.onrender.com/predict
AUTH_COOKIE_SAMESITE=none
JWT_ISSUER=flora-api
JWT_AUDIENCE=flora-client
```

Notes:

- `CORS_ORIGIN` must exactly match the Vercel origin used in the browser. If you use both the default Vercel URL and a custom domain, list both separated by commas.
- `LOCAL_MODEL_ENDPOINT` must end in `/predict`.
- `AUTH_COOKIE_SAMESITE=none` is required because Vercel and Render are different sites. Without it, login/profile/history/admin requests will fail even if the frontend can reach the backend.
- You can use `/api/health` to confirm the backend can read config and reach Neon.

## 3. Model service on Render

Keep the service at repo root and use:

Build command:

```bash
pip install -r plant_ai/requirements.txt
```

Start command:

```bash
gunicorn --bind 0.0.0.0:$PORT --timeout 180 --workers 1 --chdir plant_ai/model_service app:app
```

Recommended environment variables:

```env
PYTHON_VERSION=3.11.11
MIN_LEAF_LIKELIHOOD=0.02
```

Use `/health` to confirm the model has loaded.

## 4. Neon database

Use the Neon PostgreSQL connection string as `DATABASE_URL` on the backend.

Before using the deployed app, apply the PostgreSQL schema:

```bash
psql "$DATABASE_URL" -f backend/database/schema.pg.sql
```

Then sync the catalog:

```bash
npm --prefix backend run db:sync
```

## 5. Smoke tests after deploy

Check these in order:

1. `https://YOUR-BACKEND.onrender.com/api/health`
2. `https://YOUR-MODEL.onrender.com/health`
3. Vercel frontend can open gallery and disease gallery
4. Register/login works
5. Identify works with a leaf image

If identify still fails with a browser-level `Load failed` message, the usual causes are:

- wrong `NEXT_PUBLIC_API_BASE_URL`
- wrong or missing backend `CORS_ORIGIN`
- wrong `LOCAL_MODEL_ENDPOINT`
- Render cold start on the model service

## 6. Important production limitation

The backend currently stores uploaded files in local directories under `backend/public`:

- `public/uploads`
- `public/profiles`
- `public/plants`

That works locally, but Render filesystem storage is ephemeral. Uploaded images can disappear after a restart or redeploy.

For full production durability, move uploads to object storage such as S3, Cloudinary, or Supabase Storage.
