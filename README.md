# CodeSentry AI

CodeSentry AI is an AI-assisted code review and vulnerability scanner. A signed-in
developer enters a GitHub repository URL, picks a branch, and gets a report of bugs,
security findings, committed secrets and vulnerable dependencies, with Gemini
explanations of the most important findings and a transparent risk score.

* **Frontend:** React 19 + Vite + Tailwind (deploy on Vercel)
* **Backend:** FastAPI (deploy on Render or any Python host)
* **Auth & history:** Firebase Authentication + Cloud Firestore (via Firebase Admin on the backend)
* **AI:** Google Gemini, called **only from the backend**

Repository code is downloaded as text and parsed. It is never cloned, imported, or executed.

## What is analyzed

| Target | Analyzers | Nature |
| --- | --- | --- |
| Python (`.py`, `.pyi`) | Python parser, AST checks, Pyflakes, **Bandit**, CodeSentry rules, secret detection | Bandit/Pyflakes results are tool-verified; rules are heuristic |
| JavaScript / TypeScript, Java, Go, PHP, Ruby, C/C++, Rust, Shell | CodeSentry pattern rules, secret detection | Heuristic — every match is marked "verify manually" |
| Config & IaC (YAML, JSON, `.env`, Dockerfile, Firebase rules, SQL, Terraform…) | Configuration rules, secret detection | Heuristic |
| Dependency manifests (`requirements*.txt`, `package-lock.json`, `package.json`, `poetry.lock`, `Pipfile.lock`) | **OSV.dev** known-vulnerability lookup | Exact pinned versions only; ranges are reported as unchecked |
| Kotlin, Swift, C#, Scala, … | — | Reported as **unsupported**, never silently counted as clean |

Vulnerability categories covered: SQL injection, XSS / template injection, command and
code injection, path traversal / file inclusion, insecure deserialization, hard-coded
credentials, exposed API keys and private keys, weak authentication (JWT verification,
weak password hashing), broken access control (open Firebase rules), insecure file
uploads, unsafe cryptography, SSRF, insecure configuration and transport, XXE, open
redirects, memory-safety issues in C/C++, and vulnerable dependencies.

Every report states its **coverage**: files scanned, files skipped (and why), unsupported
languages, analysis failures (for example syntax errors), and whether the dependency check
ran. A scan with no findings is reported as "No security issues detected", never "secure".

### Risk score

```
points = Σ severity_weight × confidence_factor × source_factor × location_factor
  severity:   CRITICAL 40, HIGH 20, MEDIUM 8, LOW 2, INFO 0
  confidence: HIGH 1.0, MEDIUM 0.7, LOW 0.4
  source:     security 1.0, dependency 0.8, bug 0.5, quality 0.15
  location:   0.25 for tests/fixtures/examples/docs, else 1.0
  (bug points capped at 20 and quality points at 6)
risk_score = round(100 × (1 − e^(−points/80)))
label: ≥70 CRITICAL, ≥45 HIGH, ≥20 MEDIUM, else LOW
       (a confident CRITICAL security finding forces at least HIGH)
```

It is a prioritisation aid computed only from the files that were scanned, not a
probability or a certification.

### AI review (Gemini)

After static analysis, the backend sends the up-to-12 most severe findings (redacted
code context only) to Gemini. Gemini explains each one, gives a verdict
(`likely_true_positive` / `needs_manual_verification` / `likely_false_positive`), and
suggests a fix. Gemini cannot add findings or change severities. Weak heuristic evidence
is always shown as "needs manual verification". All AI output is labelled as an
unverified suggestion. Failures are reported specifically (missing or invalid key,
model not available, quota exceeded, timeout, empty or malformed response) and never
block the static report.

## Local development (Windows PowerShell)

Prerequisites: Node.js 20+, Python 3.11+.

```powershell
# 1. Frontend packages
npm install --legacy-peer-deps

# 2. Backend environment
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt

# 3. Configuration
Copy-Item .env.example .env      # then fill in values (see "Environment variables")

# 4. Start the API (terminal 1)
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --port 8000

# 5. Start the frontend (terminal 2)
npm run dev                      # http://localhost:3000
```

Vite proxies `/api` to `http://127.0.0.1:8000` in development (`API_PROXY_TARGET`
overrides this). Health check: `http://localhost:8000/api/health`; API docs:
`http://localhost:8000/api/docs` (disabled when `APP_ENV=production`).

### Checks

```powershell
.\.venv\Scripts\python.exe -m pytest -q   # backend: API, scanner, GitHub, OSV, Gemini, auth
npm test                                   # analyzer unit tests + UI component tests
npm run lint                               # TypeScript type check
npm run build                              # production build
```

Tests use an in-process GitHub API emulator (`tests/github_fake.py`) and mocked
OSV/Gemini/Firebase responses, so they run offline.

## Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | Frontend (Vercel) | Public URL of the API, no trailing slash. Empty in local dev. |
| `VITE_FIREBASE_*` | Frontend | Firebase **web** config (public by design). Overrides `firebase-applet-config.json`. |
| `APP_ENV` | Backend | `production` disables interactive docs |
| `CORS_ORIGINS` | Backend | Comma-separated exact origins (no `*` in production) |
| `FIREBASE_PROJECT_ID` | Backend | Must equal `VITE_FIREBASE_PROJECT_ID` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Backend secret | Service-account JSON, or a path to the JSON file |
| `GEMINI_API_KEY` | Backend secret | Enables AI review (optional) |
| `GEMINI_MODEL` | Backend | Default `gemini-3.5-flash-lite` |
| `GITHUB_TOKEN` | Backend secret | Optional; raises rate limits for **public** repos only |
| `MAX_REPOSITORY_FILES`, `MAX_SOURCE_FILE_BYTES`, `MAX_REPOSITORY_BYTES`, `REPOSITORY_TIMEOUT_SECONDS` | Backend | Scan limits |
| `DEPENDENCY_SCAN_ENABLED` | Backend | OSV.dev lookups (default `true`) |
| `RATE_LIMIT_ANALYSIS_PER_MINUTE`, `RATE_LIMIT_AI_PER_MINUTE` | Backend | Per-user limits (default 6 and 20) |

Never put `GEMINI_API_KEY`, `GITHUB_TOKEN` or Firebase Admin credentials in a `VITE_*`
variable: Vite embeds those in public browser assets.

## Private repositories

The server's `GITHUB_TOKEN` is never used to read private repositories; otherwise any
user could read whatever that token can see. To scan a private repository, the user ticks
"This is a private repository" and supplies their own fine-grained token (read-only
*Contents* and *Metadata* on that repository). The token is used for that request only.
It is not stored, logged, or returned.

## Deployment

### Backend on Render

1. Create a Web Service from this repository; [`render.yaml`](./render.yaml) defines the build, start command and health check.
2. Set `CORS_ORIGINS=https://<your-vercel-domain>`, `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON` (paste the JSON as a secret), and optionally `GEMINI_API_KEY` and `GITHUB_TOKEN`.
3. Check `https://<service>.onrender.com/api/health`. The configuration flags show what is *set*, not that credentials are valid; run a signed-in scan to verify Firebase, and look at the AI panel to verify Gemini.

### Frontend on Vercel

1. Import the repository (build `npm run build`, output `dist`; [`vercel.json`](./vercel.json) handles SPA routes).
2. Set `VITE_API_BASE_URL` to the Render URL and the `VITE_FIREBASE_*` values, then redeploy.
3. Add the Vercel domain to Firebase **Authentication → Settings → Authorized domains** and to `CORS_ORIGINS`.

### Firebase

* Enable the Email/Password, Google and (optionally) Anonymous providers.
* Create Firestore and deploy [`firestore.rules`](./firestore.rules) (`firebase deploy --only firestore:rules`). Rules deny by default. Users can only read and write their own profile. Analysis history (`users/{uid}/analyses`) is written and read only by the backend through Firebase Admin, after verifying the caller's ID token.

## API

All endpoints except `/api/health` require `Authorization: Bearer <Firebase ID token>`.
The user identity always comes from the verified token.

| Method & path | Purpose |
| --- | --- |
| `GET /api/health` | Status, configured integrations, enforced limits |
| `POST /api/repository/branches` | `{repo_url, github_token?}` → branches and default branch |
| `POST /api/analyze/repository` | `{repo_url, branch?, include_ai?, github_token?}` → full analysis |
| `POST /api/analyze` | `{files:[{path,content}], include_ai?, save_history?}` → analysis of uploaded files |
| `GET /api/analysis/history` | The caller's saved analyses (summary) |
| `GET /api/analysis/{id}` / `DELETE /api/analysis/{id}` | Read or delete one saved analysis |
| `POST /api/ai/review` | Gemini explanation for one finding |
| `POST /api/ai/assistant` | Gemini Q&A grounded in a scan summary |

Responses use `{success, data, error:{code,message}}`. Error codes include `unauthorized`,
`invalid_request`, `not_found`, `rate_limited` (with `Retry-After`), `upstream_error`,
`upstream_timeout` and `service_unavailable`.

## Limitations

* Rule-based checks for non-Python languages are line-oriented heuristics without data-flow analysis. They can miss issues and report false positives.
* Logic flaws and most access-control bugs cannot be found by static rules.
* Dependency checks need exact pinned versions (commit a lockfile).
* Rate limiting is per backend process. Add a shared limiter if you run several instances.
* Very large repositories are scanned up to the configured limits; the remainder is reported as skipped.
