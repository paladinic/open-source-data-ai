from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _id() -> str:
    return str(uuid.uuid4())


class ComponentType(str, Enum):
    etl = "etl"
    visualisation = "visualisation"
    model = "model"  # always runs on unfiltered data; cached until code changes
    code = "code"  # reusable functions/helpers; output is a namespace object


class Component(BaseModel):
    id: str = Field(default_factory=_id)
    project_id: str
    name: str
    type: ComponentType
    description: str = ""
    code: str = ""  # generated Python code (connector / pipeline)
    config: dict[str, Any] = Field(default_factory=dict)  # Chart.js config for viz
    depends_on: list[str] = Field(default_factory=list)  # component IDs this references
    cells: list[dict] = Field(
        default_factory=list
    )  # notebook cells [{id, source}]; takes precedence over code
    output_schema: list[str] = Field(default_factory=list)  # column names from last successful run
    last_run_ok: bool | None = None  # True=passed, False=failed, None=never run
    last_error: str = ""  # error message from most recent failed run
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class ChatMessage(BaseModel):
    id: str = Field(default_factory=_id)
    project_id: str
    component_id: str | None = None  # the component this chat thread belongs to
    role: str  # "user" | "assistant"
    content: str
    created_at: datetime = Field(default_factory=_now)


class Workspace(BaseModel):
    id: str = Field(default_factory=_id)
    name: str
    slug: str = ""
    created_at: datetime = Field(default_factory=_now)


class WorkspaceMember(BaseModel):
    workspace_id: str
    user_id: str
    email: str = ""
    role: str = "member"  # owner | admin | member
    joined_at: datetime = Field(default_factory=_now)


class Project(BaseModel):
    id: str = Field(default_factory=_id)
    workspace_id: str = ""
    name: str
    description: str = ""
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class Dashboard(BaseModel):
    id: str = Field(default_factory=_id)
    project_id: str
    name: str
    layout: list[str] = Field(default_factory=list)  # viz component IDs on this dashboard
    positions: dict[str, dict] = Field(default_factory=dict)  # id → {xPct, y, wPct, h}
    filters: list[dict] = Field(default_factory=list)  # dashboard-level filter definitions
    widgets: list[dict] = Field(default_factory=list)  # text boxes & shapes
    visibility: str = "workspace"  # private | workspace | public
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class AgentResponse(BaseModel):
    reply: str
    component: Component | None = None


class UserSettings(BaseModel):
    id: str = "default"
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    gemini_api_key: str = ""
    active_provider: str = ""  # "anthropic" | "openai" | "gemini" | "" (fall back to env)
    active_model: str = ""  # model name, or "" (fall back to env default)
    system_instructions: str = ""
    max_auto_retries: int = 3
    dark_mode: bool = False
    safe_mode: bool = False
    updated_at: datetime = Field(default_factory=_now)
