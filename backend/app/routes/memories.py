from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Chat
from app.models import MemoryItem, User
from app.schemas import (
    MemoryContextResponse,
    MemoryCreate,
    MemoryExtractionResponse,
    MemoryExtractionRequest,
    MemoryQuery,
    MemoryResponse,
)
from app.services.message_adapter import normalize_messages
from app.services.memory_extractor import extract_with_report
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


@router.post("/extract", response_model=MemoryExtractionResponse)
def extract_memories(
    payload: MemoryExtractionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MemoryExtractionResponse:
    platform = None
    conversation_url = None
    title = None
    messages = payload.messages or []
    if payload.chat_id:
        chat = db.query(Chat).filter(Chat.id == payload.chat_id, Chat.user_id == current_user.id).first()
        if not chat:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found")
        platform = chat.site
        conversation_url = chat.url
        title = chat.title
        messages = chat.messages

    if not messages:
        return MemoryExtractionResponse(memories=[], debug={
            "messages_seen": 0, "user_messages": 0, "empty_text_skips": 0,
            "sentences_examined": 0, "accepted": 0, "rejections": {},
        })

    normalized = normalize_messages(messages, platform=platform)
    extracted, report = extract_with_report(
        messages,
        platform=platform,
        conversation_url=conversation_url,
        title=title,
        include_topic=True,
    )
    report["messages_seen"] = len(messages)
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
            needs_review=item.get("needs_review", False),
            platform=item.get("platform"),
            conversation_url=item.get("conversation_url"),
            message_index=item.get("message_index"),
            extracted_at=datetime.fromisoformat(item["extracted_at"]),
            sources=item.get("sources", []),
        )
        db.add(memory)
        records.append(memory)

    db.commit()
    for memory in records:
        db.refresh(memory)

    return MemoryExtractionResponse(memories=records, debug=report)


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
