import os

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Load environment variables from .env
load_dotenv()

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