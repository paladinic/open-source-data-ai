"""Abstract base class for all storage backends."""

from __future__ import annotations

from abc import ABC, abstractmethod

from open_data_ai.models import ChatMessage, Component, Dashboard, Project, UserSettings


class BaseStore(ABC):
    async def init(self) -> None:
        """One-time setup (create tables, etc.). No-op by default."""

    # ── projects ───────────────────────────────────────────────────────────────

    @abstractmethod
    async def get_projects(self, workspace_id: str | None = None) -> list[Project]: ...

    @abstractmethod
    async def get_project(self, project_id: str) -> Project | None: ...

    @abstractmethod
    async def save_project(self, project: Project) -> Project: ...

    @abstractmethod
    async def delete_project(self, project_id: str) -> bool: ...

    # ── components ─────────────────────────────────────────────────────────────

    @abstractmethod
    async def get_components(self, project_id: str) -> list[Component]: ...

    @abstractmethod
    async def get_component(self, component_id: str) -> Component | None: ...

    @abstractmethod
    async def save_component(self, component: Component) -> Component: ...

    @abstractmethod
    async def delete_component(self, component_id: str) -> bool: ...

    # ── dashboards ─────────────────────────────────────────────────────────────

    @abstractmethod
    async def get_dashboards(self, project_id: str) -> list[Dashboard]: ...

    @abstractmethod
    async def get_dashboard(self, dashboard_id: str) -> Dashboard | None: ...

    @abstractmethod
    async def save_dashboard(self, dashboard: Dashboard) -> Dashboard: ...

    @abstractmethod
    async def delete_dashboard(self, dashboard_id: str) -> bool: ...

    # ── messages ───────────────────────────────────────────────────────────────

    @abstractmethod
    async def get_messages(
        self, project_id: str, component_id: str | None = None
    ) -> list[ChatMessage]: ...

    @abstractmethod
    async def save_message(self, message: ChatMessage) -> ChatMessage: ...

    # ── user settings ──────────────────────────────────────────────────────────

    @abstractmethod
    async def get_settings(self) -> UserSettings: ...

    @abstractmethod
    async def save_settings(self, settings: UserSettings) -> UserSettings: ...
