"""In-memory store — default backend for SDK/headless usage. No persistence."""

from __future__ import annotations

from datetime import datetime, timezone

from open_data_ai.models import ChatMessage, Component, Dashboard, Project, UserSettings
from open_data_ai.storage.base import BaseStore


class MemoryStore(BaseStore):
    def __init__(self) -> None:
        self._projects: dict[str, Project] = {}
        self._components: dict[str, Component] = {}
        self._dashboards: dict[str, Dashboard] = {}
        self._messages: dict[str, ChatMessage] = {}
        self._settings: UserSettings = UserSettings()

    # ── projects ───────────────────────────────────────────────────────────────

    async def get_projects(self) -> list[Project]:
        return sorted(self._projects.values(), key=lambda p: p.created_at)

    async def get_project(self, project_id: str) -> Project | None:
        return self._projects.get(project_id)

    async def save_project(self, project: Project) -> Project:
        self._projects[project.id] = project
        return project

    async def delete_project(self, project_id: str) -> bool:
        if project_id not in self._projects:
            return False
        del self._projects[project_id]
        # Cascade
        comp_ids = [c.id for c in self._components.values() if c.project_id == project_id]
        for cid in comp_ids:
            del self._components[cid]
        dash_ids = [d.id for d in self._dashboards.values() if d.project_id == project_id]
        for did in dash_ids:
            del self._dashboards[did]
        msg_ids = [m.id for m in self._messages.values() if m.project_id == project_id]
        for mid in msg_ids:
            del self._messages[mid]
        return True

    # ── components ─────────────────────────────────────────────────────────────

    async def get_components(self, project_id: str) -> list[Component]:
        return sorted(
            [c for c in self._components.values() if c.project_id == project_id],
            key=lambda c: c.created_at,
        )

    async def get_component(self, component_id: str) -> Component | None:
        return self._components.get(component_id)

    async def save_component(self, component: Component) -> Component:
        self._components[component.id] = component
        return component

    async def delete_component(self, component_id: str) -> bool:
        if component_id not in self._components:
            return False
        del self._components[component_id]
        msg_ids = [m.id for m in self._messages.values() if m.component_id == component_id]
        for mid in msg_ids:
            del self._messages[mid]
        return True

    # ── dashboards ─────────────────────────────────────────────────────────────

    async def get_dashboards(self, project_id: str) -> list[Dashboard]:
        return sorted(
            [d for d in self._dashboards.values() if d.project_id == project_id],
            key=lambda d: d.created_at,
        )

    async def get_dashboard(self, dashboard_id: str) -> Dashboard | None:
        return self._dashboards.get(dashboard_id)

    async def save_dashboard(self, dashboard: Dashboard) -> Dashboard:
        self._dashboards[dashboard.id] = dashboard
        return dashboard

    async def delete_dashboard(self, dashboard_id: str) -> bool:
        if dashboard_id not in self._dashboards:
            return False
        del self._dashboards[dashboard_id]
        return True

    # ── messages ───────────────────────────────────────────────────────────────

    async def get_messages(
        self, project_id: str, component_id: str | None = None
    ) -> list[ChatMessage]:
        msgs = [m for m in self._messages.values() if m.project_id == project_id]
        if component_id is not None:
            msgs = [m for m in msgs if m.component_id == component_id]
        return sorted(msgs, key=lambda m: m.created_at)

    async def save_message(self, message: ChatMessage) -> ChatMessage:
        self._messages[message.id] = message
        return message

    # ── user settings ──────────────────────────────────────────────────────────

    async def get_settings(self) -> UserSettings:
        return self._settings

    async def save_settings(self, settings: UserSettings) -> UserSettings:
        settings.updated_at = datetime.now(timezone.utc)
        self._settings = settings
        return settings
