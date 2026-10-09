# Synapse

Synapse is a local-first chat archiving workspace. It combines a browser extension for capturing conversations from supported AI chat sites, a FastAPI service for authenticated storage, and a React dashboard for browsing and analyzing archived chats.

## Components

- `backend/` - FastAPI API, JWT authentication, SQLAlchemy models, and PostgreSQL persistence.
- `webapp/` - React dashboard powered by Vite.
- `chat-archiver/` - Manifest V3 browser extension for capturing conversations, exporting local data, and injecting prompts.

## Architecture

```text
Supported chat site
        |
        v
Chrome extension  --->  Synapse API  --->  PostgreSQL
        |                    ^
        |                    |
        +--> local storage   React dashboard
```

The backend is the shared API for the dashboard and extension workflows. Authentication uses bearer tokens. The web dashboard uses `VITE_API_BASE_URL` in production and falls back to `http://127.0.0.1:8000` locally.

## Prerequisites

- Python 3.10 or newer
- Node.js 18 or newer and npm
- PostgreSQL 14 or newer
- Chromium-based browser with Manifest V3 extension support

## Quick start

### 1. Configure PostgreSQL

Create a database for Synapse, then create `backend/.env`:

```env
DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/synapse
SECRET_KEY=replace-with-a-long-random-value
```

`DATABASE_URL` is required when the backend starts. Use a different database username, password, host, or port when your local PostgreSQL installation requires it.

### Deploy with Render

The repository includes [render.yaml](S:/Projects/Synapse/render.yaml), which
creates the FastAPI API, PostgreSQL database, and static dashboard. In Render,
choose **New > Blueprint**, connect this repository, and apply the blueprint.
Enter `GROQ_API_KEY` when Render prompts for the secret value. The blueprint
uses the default service names `synapse-api` and `synapse-dashboard`; update
the two `*.onrender.com` URLs in `render.yaml` if you choose different names.

### 2. Start the backend

From `backend/`, create and activate a virtual environment, install dependencies, and start FastAPI:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The API is available at `http://127.0.0.1:8000`. Interactive OpenAPI documentation is available at `http://127.0.0.1:8000/docs`; the health check is `http://127.0.0.1:8000/healthz`.

### 3. Start the dashboard

In a second terminal, from `webapp/`:

```powershell
cd webapp
npm install
npm run dev
```

Open `http://localhost:4173`. The dashboard uses the backend URL defined in `webapp/src/api/client.js`.

### 4. Install the browser extension

1. Build the React popup if needed:
   ```powershell
   cd chat-archiver
   npm install
   npm run build
   ```
2. Open `chrome://extensions` or the equivalent extensions page in your browser.
3. Enable **Developer mode**.
4. Select **Load unpacked** and choose the `chat-archiver/` directory.
5. Open a supported chat site and click the Synapse extension icon.

The extension currently declares support for ChatGPT, Claude, and Gemini. It can capture a conversation, export archived data as JSON, inject a prompt into the active chat, and open its side panel.

## API overview

All `/chats` endpoints require an `Authorization: Bearer <token>` header.

| Method | Endpoint | Purpose | Auth |
| --- | --- | --- | --- |
| `GET` | `/` | API welcome response | No |
| `GET` | `/healthz` | Health check | No |
| `POST` | `/auth/register` | Create an account and return a token | No |
| `POST` | `/auth/login` | Authenticate and return a token | No |
| `GET` | `/auth/me` | Return the current user | Yes |
| `GET` | `/chats` | List the current user's chats | Yes |
| `GET` | `/chats/{chat_id}` | Get one chat | Yes |
| `POST` | `/chats` | Store a captured chat | Yes |
| `PUT` | `/chats/{chat_id}` | Update a chat | Yes |
| `DELETE` | `/chats/{chat_id}` | Delete a chat | Yes |

The full request and response schemas are available in the FastAPI docs at `/docs`.

## Development commands

### Backend

```powershell
cd backend
uvicorn app.main:app --reload --port 8000
```

The backend creates database tables during application startup. Alembic is included for future migration work.

### Dashboard

```powershell
cd webapp
npm run dev      # development server on port 4173
npm run build    # production build
npm run preview  # preview the production build
```

### Extension

```powershell
cd chat-archiver
npm run build    # bundles src/index.jsx into dist/popup.js
```

The extension's non-React popup, content script, background service worker, and side panel are loaded directly from the extension directory.

## Troubleshooting

- **Backend fails with `DATABASE_URL is not set`:** create `backend/.env` with a valid PostgreSQL connection string.
- **Dashboard cannot reach the API:** confirm the backend is running on port `8000` and that the URL in `webapp/src/api/client.js` matches it.
- **CORS errors:** use the configured dashboard origin `http://localhost:4173` or `http://127.0.0.1:4173`. For extension requests, verify that the installed extension ID matches the origin allowed in `backend/app/main.py`; update that allowlist when developing with a different extension ID.
- **Extension popup is blank:** run `npm run build` inside `chat-archiver/`, then reload the unpacked extension from the browser's extensions page.

## Repository layout

```text
Synapse/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── auth.py
│   │   ├── database.py
│   │   ├── models.py
│   │   ├── schemas.py
│   │   └── routes/
│   ├── requirements.txt
│   └── README.md
├── chat-archiver/
│   ├── manifest.json
│   ├── background.js
│   ├── content.js
│   ├── popup.html
│   ├── sidepanel.html
│   └── src/
├── webapp/
│   ├── src/
│   ├── package.json
│   └── vite.config.js
└── README.md
```
