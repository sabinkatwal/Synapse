from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ---------- Authentication ----------

class UserRegister(BaseModel):
    email: EmailStr
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenResponse(Token):
    pass


class UserResponse(BaseModel):
    id: UUID
    email: EmailStr
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------- Chat Messages ----------

class Message(BaseModel):
    role: str
    text: str


# ---------- Chat ----------

class ChatCreate(BaseModel):
    site: str
    title: str | None = None
    url: str
    captured_at: datetime
    messages: list[Message]


class ChatUpdate(BaseModel):
    title: str | None = None
    favorite: bool | None = None
    messages: list[Message] | None = None


class ChatResponse(BaseModel):
    id: UUID
    site: str
    title: str | None
    url: str
    captured_at: datetime
    messages: list[Message]
    favorite: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------- Memory ----------

class MemoryCreate(BaseModel):
    memory_type: str = "fact"
    title: str | None = None
    content: str
    tags: list[str] = Field(default_factory=list)
    source: str = "chat"
    source_url: str | None = None
    confidence: float = 0.5


class MemoryQuery(BaseModel):
    query: str
    limit: int = 5


class MemoryExtractionRequest(BaseModel):
    chat_id: str | None = None
    messages: list[Message] | None = None
    limit: int = 5


class MemoryResponse(BaseModel):
    id: UUID
    user_id: UUID
    memory_type: str
    title: str | None
    content: str
    tags: list[str]
    source: str
    source_url: str | None
    confidence: float
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MemoryContextResponse(BaseModel):
    context: str
    memories: list[MemoryResponse]