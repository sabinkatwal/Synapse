import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker

# Load environment variables from .env
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

# Get the database URL
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set. Please check your .env file.")

# Create SQLAlchemy engine
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
)

# Database session
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

# Base class for all models
Base = declarative_base()


def init_db():
    """
    Create all database tables.
    This should only be used during development.
    Later we'll use Alembic migrations.
    """
    from app.models import User, Chat  # noqa: F401

    Base.metadata.create_all(bind=engine)
    if engine.dialect.name == "postgresql":
        table_additions = {
            "chats": {
                "handoff_summary": "TEXT",
            },
            "memory_items": {
                "needs_review": "BOOLEAN NOT NULL DEFAULT FALSE",
                "platform": "VARCHAR(100)",
                "conversation_url": "VARCHAR(2000)",
                "message_index": "INTEGER",
                "extracted_at": "TIMESTAMP WITH TIME ZONE",
                "sources": "JSONB NOT NULL DEFAULT '[]'::jsonb",
            },
        }
        with engine.begin() as connection:
            for table_name, additions in table_additions.items():
                existing = {column["name"] for column in inspect(engine).get_columns(table_name)}
                for name, definition in additions.items():
                    if name not in existing:
                        connection.execute(text(f'ALTER TABLE {table_name} ADD COLUMN "{name}" {definition}'))


def get_db():
    """
    Dependency for FastAPI routes.
    Creates a database session and closes it automatically.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()