from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr


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