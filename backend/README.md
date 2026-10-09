# Synapse Backend

## Setup

1. Create and activate a virtual environment.
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Set environment variables for PostgreSQL and JWT:
   ```bash
   set DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/synapse
   set SECRET_KEY=change-me
   set GROQ_API_KEY=your-groq-key
   ```
4. Run the API:
   ```bash
   uvicorn app.main:app --reload
   ```

## API Overview
- POST /auth/register
- POST /auth/login
- GET /chats
- GET /chats/{id}
- POST /chats
- PUT /chats/{id}
- DELETE /chats/{id}
- POST /chats/{id}/handoff-summary

`POST /chats/{id}/handoff-summary` uses Groq to create and persist a structured
handoff summary containing the conversation objective, progress, decisions,
unresolved questions, next steps, and important context. The summary is included
when archived context is pushed to a different AI agent. Set `GROQ_MODEL` to
override the default `openai/gpt-oss-120b` model. Groq model availability can
change over time, so use an active model ID from the Groq Models API.

All chat routes require a bearer token in the Authorization header.
