import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.routes.auth import router as auth_router
from app.routes.chats import router as chats_router
from app.routes.memories import router as memories_router

api = FastAPI(title="Synapse API", version="1.0.0")

configured_origins = os.getenv("CORS_ORIGINS", "")
allowed_origins = [
    origin.strip()
    for origin in configured_origins.split(",")
    if origin.strip()
]
allowed_origins.append("chrome-extension://neaficlfbibdhlhkjjakoiijdlfollna")
if os.getenv("ENVIRONMENT", "development").lower() != "production":
    allowed_origins.extend(["http://127.0.0.1:4173", "http://localhost:4173"])


@api.on_event("startup")
def startup_event() -> None:
    init_db()

@api.get("/")
def root() -> dict[str, str]:
    return {"message": "Welcome to the Synapse API!"}

@api.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


api.include_router(auth_router, prefix="/auth", tags=["auth"])
api.include_router(chats_router, prefix="/chats", tags=["chats"])
api.include_router(memories_router, prefix="/memories", tags=["memories"])

# Keep CORS outside FastAPI's error middleware so browser clients also receive
# CORS headers when an unhandled backend exception produces a 500 response.
app = CORSMiddleware(
    api,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)
