# Synapse

Synapse is a secure chat-archiving workspace for conversations captured from
ChatGPT, Claude, and Gemini. It includes:

- A Manifest V3 Chrome extension for capture and prompt injection.
- A FastAPI backend with JWT authentication and PostgreSQL storage.
- A React dashboard for browsing chats, extracting memories, and generating
  Groq-powered handoff summaries.

## Production services

| Service | URL |
| --- | --- |
| Dashboard | https://synapse-gsb7.vercel.app |
| API | https://synapse-wqm8.onrender.com |
| API health | https://synapse-wqm8.onrender.com/healthz |

The browser extension and dashboard use the deployed API in production. Local
development defaults to `http://127.0.0.1:8000`.

## Architecture

```text
ChatGPT / Claude / Gemini
          |
          v
Chrome extension ───────┐
                        v
                 Render FastAPI API ─── Supabase PostgreSQL
                        ^
                        |
                 Vercel React dashboard
```

## Requirements

- Python 3.12.7
- Node.js 18 or newer and npm
- PostgreSQL 14 or newer
- Chromium-based browser with Manifest V3 support

## Local setup

### Backend

Create `backend/.env` from [backend/.env.example](backend/.env.example).
Never commit the real `.env` file.

```powershell
cd backend
py -3.12 -m venv ..\.venv
..\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The API runs at `http://127.0.0.1:8000`.

- OpenAPI docs: `http://127.0.0.1:8000/docs`
- Health check: `http://127.0.0.1:8000/healthz`

### Dashboard

```powershell
cd webapp
npm ci
npm run dev
```

Open `http://localhost:4173`. Set `VITE_API_BASE_URL` when using a different
backend:

```powershell
$env:VITE_API_BASE_URL = "http://127.0.0.1:8000"
npm run dev
```

The committed [webapp/.env.production](webapp/.env.production) points
production builds at the deployed Render API.

### Chrome extension

```powershell
cd chat-archiver
npm ci
npm run build
```

Then open `chrome://extensions`, enable **Developer mode**, choose **Load
unpacked**, and select `chat-archiver/`. Reload the extension after changing
the service worker, manifest, or API URL.

## Deployment

### Render backend

[render.yaml](render.yaml) configures the backend service:

- Root directory: `backend`
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Health check: `/healthz`
- Python version: 3.12.7 from [.python-version](.python-version)

Set these Render environment variables:

```env
DATABASE_URL=your-supabase-pooler-connection-string
SECRET_KEY=long-random-production-secret
GROQ_API_KEY=your-groq-api-key
GROQ_MODEL=openai/gpt-oss-120b
ENVIRONMENT=production
CORS_ORIGINS=https://synapse-gsb7.vercel.app
```

For Supabase, copy the complete pooled PostgreSQL URL from the dashboard.
URL-encode special characters in the password. After changing dependency pins
or Python versions, use **Clear build cache & deploy** in Render.

### Vercel frontend

Create a Vercel project from this repository with root directory `webapp`.
Set:

```env
VITE_API_BASE_URL=https://synapse-wqm8.onrender.com
```

[webapp/vercel.json](webapp/vercel.json) rewrites client-side routes to the
React entry point.

## API

Protected endpoints require:

```http
Authorization: Bearer <access-token>
```

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/` | API welcome response |
| GET | `/healthz` | Health check |
| POST | `/auth/register` | Create an account |
| POST | `/auth/login` | Login and receive a token |
| GET | `/auth/me` | Read the authenticated user |
| GET | `/chats` | List the user's chats |
| GET | `/chats/{id}` | Read one chat |
| POST | `/chats` | Store a captured chat |
| PUT | `/chats/{id}` | Update a chat |
| DELETE | `/chats/{id}` | Delete a chat |
| POST | `/chats/{id}/handoff-summary` | Generate a compact Groq handoff |
| GET | `/memories` | List memories |
| POST | `/memories` | Create a memory |
| POST | `/memories/context` | Retrieve relevant memory context |
| POST | `/memories/extract` | Extract memories from a chat |
| DELETE | `/memories/{id}` | Delete a memory |

Interactive documentation is available at
`https://synapse-wqm8.onrender.com/docs`.

## Security requirements

### Secrets

- Never commit `.env`, database passwords, JWT secrets, Groq keys, or bearer
  tokens.
- `SECRET_KEY` is mandatory. The backend fails during startup if it is missing;
  it never generates or prints a fallback secret.
- Keep secrets in Render/Vercel environment settings, not in frontend source.
- `GROQ_API_KEY` must exist only on the backend. Never use it as a `VITE_*`
  variable or put it in the extension.
- Rotate every credential that has appeared in chat, logs, screenshots, or
  source control.

If a credential was exposed:

1. Reset the Supabase database password.
2. Generate a new high-entropy `SECRET_KEY`.
3. Revoke and recreate the Groq API key.
4. Update Render variables and restart the service.
5. Clear browser tokens and sign in again.

### Authentication and data

- Use HTTPS for all production traffic.
- Do not share JWTs; clear local browser storage after suspected compromise.
- Chat ownership is enforced by filtering every database query by the current
  user ID.
- Review captured content before storing or generating a handoff summary.
- Do not put secrets, passwords, or API keys into archived conversations.

### CORS and browser permissions

- Production CORS is controlled by `CORS_ORIGINS`.
- Use exact origins, without `*` or trailing slashes.
- The extension is limited to supported AI sites and the deployed API.
- Do not add broad host permissions unless a feature requires them.
- If the extension ID changes, update the backend extension origin allowlist.

### Operations

- Do not run production with `--reload`.
- Keep Render, Vercel, Supabase, npm, and Python dependencies updated.
- Review deployment logs for accidental secret output.
- Use database backups and test restoration before relying on production data.

## Validation

```powershell
cd backend
..\.venv\Scripts\python.exe -m pytest

cd ..\webapp
npm ci
npm run build
```

The backend test suite currently contains 79 passing tests.

## Troubleshooting

- **Database authentication failure:** copy a current Supabase pooler URL and
  verify the encoded password, then restart the backend.
- **Render build fails on Pydantic:** confirm Python 3.12.7 is selected and use
  **Clear build cache & deploy**.
- **CORS failure:** set `CORS_ORIGINS` to the exact Vercel origin and verify
  the extension ID.
- **Vercel dependency failure:** deploy the latest commit with both
  `webapp/package.json` and `webapp/package-lock.json`.
- **Extension still uses localhost:** reload it from `chrome://extensions`.
- **Handoff generation fails:** confirm `GROQ_API_KEY`, `GROQ_MODEL`, and
  backend connectivity.

## Repository layout

```text
Synapse/
├── .python-version
├── render.yaml
├── backend/
│   ├── app/
│   ├── .env.example
│   ├── requirements.txt
│   └── README.md
├── chat-archiver/
├── webapp/
│   ├── src/
│   ├── package.json
│   ├── package-lock.json
│   └── vercel.json
└── README.md
```

## License

No license has been declared. Add a license before distributing the project.
