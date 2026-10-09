from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Chat, User
from app.schemas import ChatCreate, ChatResponse, ChatUpdate, HandoffSummaryResponse
from app.services.conversation_summarizer import (
    generate_handoff_summary,
    render_summary,
    summary_char_budget,
)

router = APIRouter()


@router.get("", response_model=list[ChatResponse])
def list_chats(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[ChatResponse]:
    chats = db.query(Chat).filter(Chat.user_id == current_user.id).order_by(Chat.created_at.desc()).all()
    return chats


@router.get("/{chat_id}", response_model=ChatResponse)
def get_chat(chat_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> ChatResponse:
    chat = db.query(Chat).filter(Chat.id == chat_id, Chat.user_id == current_user.id).first()
    if not chat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found")
    return chat


@router.post("", response_model=ChatResponse, status_code=status.HTTP_201_CREATED)
def create_chat(payload: ChatCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> ChatResponse:
    chat = Chat(
        user_id=current_user.id,
        site=payload.site,
        title=payload.title,
        url=payload.url,
        captured_at=payload.captured_at,
        messages=[message.model_dump() for message in payload.messages],
    )
    db.add(chat)
    db.commit()
    db.refresh(chat)
    return chat


@router.put("/{chat_id}", response_model=ChatResponse)
def update_chat(
    chat_id: str,
    payload: ChatUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChatResponse:
    chat = db.query(Chat).filter(Chat.id == chat_id, Chat.user_id == current_user.id).first()
    if not chat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found")

    if payload.site is not None:
        chat.site = payload.site
    if payload.title is not None:
        chat.title = payload.title
    if payload.url is not None:
        chat.url = payload.url
    if payload.captured_at is not None:
        chat.captured_at = payload.captured_at
    if payload.messages is not None:
        chat.messages = [message.model_dump() for message in payload.messages]
        chat.handoff_summary = None

    db.commit()
    db.refresh(chat)
    return chat


@router.post("/{chat_id}/handoff-summary", response_model=HandoffSummaryResponse)
def create_handoff_summary(
    chat_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> HandoffSummaryResponse:
    chat = db.query(Chat).filter(Chat.id == chat_id, Chat.user_id == current_user.id).first()
    if not chat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found")

    try:
        summary = render_summary(
            generate_handoff_summary(chat.messages, chat.site),
            max_chars=summary_char_budget(chat.messages),
        )
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    chat.handoff_summary = summary
    db.commit()
    return HandoffSummaryResponse(
        chat_id=chat.id,
        summary=summary,
        generated_at=datetime.now(timezone.utc),
    )


@router.delete("/{chat_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_chat(chat_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> None:
    chat = db.query(Chat).filter(Chat.id == chat_id, Chat.user_id == current_user.id).first()
    if not chat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found")
    db.delete(chat)
    db.commit()
