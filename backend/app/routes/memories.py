from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Chat
from app.models import MemoryItem, User
from app.schemas import (
    MemoryContextResponse,
    MemoryCreate,
    MemoryExtractionRequest,
    MemoryQuery,
    MemoryResponse,
)
from app.services.memory_extractor import extract_memories_from_messages
from app.services.memory_retriever import build_memory_context, rank_memories

router = APIRouter()


def _message_for_extraction(message: object) -> dict[str, str]:
    if not isinstance(message, dict):
        return {"role": "", "text": ""}

    text = message.get("text") or message.get("content") or message.get("message") or ""
    role = message.get("role") or message.get("sender") or message.get("author") or "user"
    if str(role).lower() in {"unknown", "user_message", "human_message"}:
        role = "user"
    return {"role": str(role), "text": str(text)}


@router.get("", response_model=list[MemoryResponse])
def list_memories(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[MemoryItem]:
    return (
        db.query(MemoryItem)
        .filter(MemoryItem.user_id == current_user.id)
        .order_by(MemoryItem.created_at.desc())
        .all()
    )


@router.post("", response_model=MemoryResponse, status_code=status.HTTP_201_CREATED)
def create_memory(
    payload: MemoryCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MemoryItem:
    memory = MemoryItem(
        user_id=current_user.id,
        memory_type=payload.memory_type,
        title=payload.title,
        content=payload.content,
        tags=payload.tags,
        source=payload.source,
        source_url=payload.source_url,
        confidence=payload.confidence,
    )
    db.add(memory)
    db.commit()
    db.refresh(memory)
    return memory


@router.post("/extract", response_model=list[MemoryResponse])
def extract_memories(
    payload: MemoryExtractionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[MemoryItem]:
    messages = payload.messages
    if payload.chat_id:
        chat = db.query(Chat).filter(Chat.id == payload.chat_id, Chat.user_id == current_user.id).first()
        if not chat:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found")
        messages = [_message_for_extraction(message) for message in chat.messages]

    if not messages:
        return []

    extracted = extract_memories_from_messages(messages)
    records: list[MemoryItem] = []

    for item in extracted[: max(1, payload.limit)]:
        memory = MemoryItem(
            user_id=current_user.id,
            memory_type=item["memory_type"],
            title=item["title"],
            content=item["content"],
            tags=item.get("tags", []),
            source=item.get("source", "chat"),
            source_url=item.get("source_url"),
            confidence=item.get("confidence", 0.5),
        )
        db.add(memory)
        records.append(memory)

    db.commit()
    for memory in records:
        db.refresh(memory)

    return records


@router.post("/relevant", response_model=list[MemoryResponse])
def get_relevant_memories(
    payload: MemoryQuery,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[MemoryItem]:
    items = (
        db.query(MemoryItem)
        .filter(MemoryItem.user_id == current_user.id)
        .order_by(MemoryItem.created_at.desc())
        .all()
    )
    return rank_memories(items, payload.query, payload.limit)


@router.post("/context", response_model=MemoryContextResponse)
def get_memory_context(
    payload: MemoryQuery,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MemoryContextResponse:
    items = (
        db.query(MemoryItem)
        .filter(MemoryItem.user_id == current_user.id)
        .order_by(MemoryItem.created_at.desc())
        .all()
    )
    memories = rank_memories(items, payload.query, payload.limit)
    return MemoryContextResponse(
        context=build_memory_context(memories),
        memories=memories,
    )


@router.get("/{memory_id}", response_model=MemoryResponse)
def get_memory(
    memory_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MemoryItem:
    memory = db.query(MemoryItem).filter(MemoryItem.id == memory_id, MemoryItem.user_id == current_user.id).first()
    if not memory:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Memory not found")
    return memory


@router.delete("/{memory_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_memory(
    memory_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    memory = db.query(MemoryItem).filter(MemoryItem.id == memory_id, MemoryItem.user_id == current_user.id).first()
    if not memory:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Memory not found")
    db.delete(memory)
    db.commit()
