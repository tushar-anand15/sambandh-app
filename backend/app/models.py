from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, description="Minimum 8 characters")
    full_name: str = Field(min_length=1)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class ChatRequest(BaseModel):
    message: str
    chat_id: UUID | None = None


class ChatResponse(BaseModel):
    response: str
    sources: list[dict] = []


# Chat history schemas
class ChatMessageResponse(BaseModel):
    id: UUID
    role: str
    content: str
    sources: list[dict] | None = None
    tool_calls: list[dict] | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatSummary(BaseModel):
    id: UUID
    title: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ChatDetail(BaseModel):
    id: UUID
    title: str | None
    messages: list[ChatMessageResponse]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ChatCreate(BaseModel):
    title: str | None = None


class ChatUpdate(BaseModel):
    title: str | None = None


class ChatsListResponse(BaseModel):
    chats: list[ChatSummary]
    total: int
