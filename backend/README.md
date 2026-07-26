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

All chat routes require a bearer token in the Authorization header.
