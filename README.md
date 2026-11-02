# CodeSentry AI

CodeSentry AI combines the existing React + Vite interface with a FastAPI
backend for authenticated Python static analysis. The backend parses source
without executing it, uses Pyflakes for undefined/unused names, Bandit for
security findings, and a transparent rule-based risk baseline. It does not use
a trained ML model. Public GitHub repositories are retrieved over HTTPS using
GitHub APIs; source code is never cloned or executed.

## What is analyzed

- Python files (`.py`, `.pyi`) from public GitHub repositories or user uploads.
- Python syntax and selected AST patterns, Pyflakes diagnostics, and actual
  Bandit results.
- Complexity and quality indicators, severity counts, and deterministic
  0–100 risk estimates with their contributing factors.
- Optional Gemini suggestions through the backend only. Scanner findings stay
  distinct from AI-generated recommendations. Gemini is disabled until a
  backend API key is configured.

Other repository languages may be identified as metadata, but are not scanned.
The risk score is a prioritization heuristic, not a calibrated probability or
proof that code is exploitable. Static findings require human review.

## Local development (Windows PowerShell)

Prerequisites: Node.js, Python 3.11 or newer, and Git (only needed for local
development workflows; the analyzer does not execute repository Git hooks).

1. Install frontend packages:

   ```powershell
   npm install --legacy-peer-deps
   ```

2. Create and activate a Python environment, then install backend and test
   dependencies:

   ```powershell
   py -m venv .venv
   .\.venv\Scripts\Activate.ps1
   python -m pip install -r requirements-dev.txt
   ```

3. Copy `.env.example` to `.env`. Set `FIREBASE_PROJECT_ID` and
   `FIREBASE_SERVICE_ACCOUNT_JSON` using a Firebase service account from your
   own project. Keep `.env` private and never commit it. The Firebase web app
   configuration in `firebase-applet-config.json` must also refer to the same
   Firebase project.

4. Start the API from the repository root:

   ```powershell
   .\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --port 8000
   ```

5. In another terminal, start the frontend:

   ```powershell
   npm run dev
   ```

   Vite proxies `/api` requests to `http://127.0.0.1:8000`. Set
   `API_PROXY_TARGET` if the backend is listening elsewhere.

6. Run checks:

   ```powershell
   .\.venv\Scripts\python.exe -m pytest -q
   npm test
   npm run lint
   npm run build
   ```

The public health endpoint is `http://localhost:8000/api/health`; interactive
API docs are at `http://localhost:8000/api/docs` outside production. Analysis
and user-specific history require a valid Firebase ID token, so configure
Firebase before trying authenticated scans.

## Firebase setup

1. Configure Firebase Authentication providers (email/password and Google)
   and add your Vercel hostname under **Authentication → Settings → Authorized
   domains**.
2. Create/enable Cloud Firestore and apply [`firestore.rules`](./firestore.rules).
   Rules deny access by default and permit only owner-scoped legacy profile and
   scan documents. Analysis history is written by the authenticated backend
   using Firebase Admin; Admin SDK access bypasses client rules.
3. Create a Firebase Admin service account for the backend. On Render, store
   its JSON as the secret environment variable `FIREBASE_SERVICE_ACCOUNT_JSON`
   and set `FIREBASE_PROJECT_ID`. For local development, use the same variables
   in `.env`. Never put Admin credentials in Vite variables or source control.

## Deployment

### Backend on Render

1. Create a Render Web Service from this repository. The included
   [`render.yaml`](./render.yaml) specifies the Python service, health check,
   dependency install command, and Uvicorn start command.
2. Configure these service environment variables in Render:
   - `APP_ENV=production`
   - `FIREBASE_PROJECT_ID` and `FIREBASE_SERVICE_ACCOUNT_JSON`
   - `CORS_ORIGINS=https://<your-vercel-hostname>` (comma-separated for more
     than one exact origin; do not use `*`)
   - `GEMINI_API_KEY` only if you want backend AI review
   - `GITHUB_TOKEN` is optional and only increases GitHub API rate limits
3. Wait for `/api/health` to report `status: ok`. This confirms the API process
   is running, not that Firebase, Firestore, or Gemini credentials are valid.
   Test authenticated analysis after configuring Firebase.

### Frontend on Vercel

1. Import this repository into Vercel with build command `npm run build` and
   output directory `dist`. [`vercel.json`](./vercel.json) enables SPA routing.
2. Set `VITE_API_BASE_URL` to the deployed Render API URL, for example
   `https://codesentry-ai-api.onrender.com` (no trailing slash).
3. Confirm the same Vercel origin is listed in the Render `CORS_ORIGINS`
   variable and Firebase Authentication authorized domains, then redeploy.

Never set `GEMINI_API_KEY`, Firebase Admin credentials, or GitHub tokens as
`VITE_*` variables: Vite embeds those variables in public browser assets.

## Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | Vercel/frontend | Public URL of the FastAPI service; empty in local Vite development |
| `APP_ENV` | Backend | Set to `production` to disable interactive API docs |
| `CORS_ORIGINS` | Backend | Exact browser origins permitted to call the API |
| `FIREBASE_PROJECT_ID` | Backend | Firebase project used for token verification and Firestore |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Backend secret | Optional service account JSON; production may use platform credentials instead |
| `GEMINI_API_KEY` | Backend secret | Optional server-side Gemini access |
| `GEMINI_MODEL` | Backend | Gemini model name; defaults to `gemini-2.5-flash` |
| `GITHUB_TOKEN` | Backend secret | Optional token for higher GitHub API rate limits |
| `API_PROXY_TARGET` | Local Vite server | Optional local FastAPI URL; defaults to `http://127.0.0.1:8000` |

## API

- `GET /api/health`
- `POST /api/analyze`
- `POST /api/analyze/repository`
- `GET /api/analysis/{analysis_id}`
- `GET /api/analysis/history`
- `DELETE /api/analysis/{analysis_id}`
- `POST /api/ai/review` and `POST /api/ai/assistant` (optional Gemini features)

All analysis and user-specific API calls require a Firebase ID token in the
`Authorization: Bearer <token>` header. The API derives the user identity from
the verified token; it does not accept a client-supplied UID as authority.

## Tests and limitations

Backend tests cover API validation/auth requirements, AST/Pyflakes/Bandit
behavior, repository URL validation, user-isolated storage, Gemini failure
handling, and risk scoring. Frontend `npm test` runs the existing analyzer
checks plus component tests for sign-in, registration, repository submission,
loading/error states, and analysis results. Live Firebase, Firestore, Gemini,
Vercel, and Render behavior must be verified with credentials and project
settings from the deployer; this repository does not include those credentials.
