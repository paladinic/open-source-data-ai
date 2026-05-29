"""
SQLite-backed store for lite/local mode (no Supabase, no Docker, no auth).

Each table has a minimal set of indexable columns plus a `data` TEXT column
that holds the full JSON-serialised Pydantic model.  This keeps the schema
simple and forward-compatible — adding new model fields never requires a
migration.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import aiosqlite

from open_data_ai.storage.base import BaseStore
from open_data_ai.models import Project, Component, ChatMessage, Dashboard, UserSettings

_SCHEMA = """
CREATE TABLE IF NOT EXISTS projects (
    id         TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    data       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS components (
    id         TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    data       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dashboards (
    id         TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    data       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
    id           TEXT PRIMARY KEY,
    project_id   TEXT NOT NULL,
    component_id TEXT,
    created_at   TEXT NOT NULL,
    data         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_settings (
    id   TEXT PRIMARY KEY,
    data TEXT NOT NULL
);
"""


class SQLiteStore(BaseStore):
    def __init__(self, db_path: Path | str):
        self._db_path = Path(db_path)

    async def init(self) -> None:
        """Create tables if they don't exist. Call once at startup."""
        async with aiosqlite.connect(self._db_path) as db:
            await db.executescript(_SCHEMA)
            await db.commit()

    # ── projects ───────────────────────────────────────────────────────────────

    async def get_projects(self, workspace_id: str | None = None) -> list[Project]:
        async with aiosqlite.connect(self._db_path) as db:
            async with db.execute("SELECT data FROM projects ORDER BY created_at") as cur:
                return [Project.model_validate(json.loads(r[0])) async for r in cur]

    async def get_project(self, project_id: str) -> Project | None:
        async with aiosqlite.connect(self._db_path) as db:
            async with db.execute("SELECT data FROM projects WHERE id=?", (project_id,)) as cur:
                row = await cur.fetchone()
                return Project.model_validate(json.loads(row[0])) if row else None

    async def save_project(self, project: Project) -> Project:
        data = project.model_dump_json()
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                "INSERT OR REPLACE INTO projects (id, created_at, data) VALUES (?,?,?)",
                (project.id, project.created_at.isoformat(), data),
            )
            await db.commit()
        return project

    async def delete_project(self, project_id: str) -> bool:
        async with aiosqlite.connect(self._db_path) as db:
            async with db.execute("SELECT id FROM components WHERE project_id=?", (project_id,)) as cur:
                comp_ids = [r[0] async for r in cur]
            for cid in comp_ids:
                await db.execute("DELETE FROM messages WHERE component_id=?", (cid,))
            await db.execute("DELETE FROM components WHERE project_id=?", (project_id,))
            await db.execute("DELETE FROM dashboards WHERE project_id=?", (project_id,))
            await db.execute("DELETE FROM messages WHERE project_id=?", (project_id,))
            cur = await db.execute("DELETE FROM projects WHERE id=?", (project_id,))
            await db.commit()
            return cur.rowcount > 0

    # ── components ─────────────────────────────────────────────────────────────

    async def get_components(self, project_id: str) -> list[Component]:
        async with aiosqlite.connect(self._db_path) as db:
            async with db.execute(
                "SELECT data FROM components WHERE project_id=? ORDER BY created_at",
                (project_id,),
            ) as cur:
                return [Component.model_validate(json.loads(r[0])) async for r in cur]

    async def get_component(self, component_id: str) -> Component | None:
        async with aiosqlite.connect(self._db_path) as db:
            async with db.execute("SELECT data FROM components WHERE id=?", (component_id,)) as cur:
                row = await cur.fetchone()
                return Component.model_validate(json.loads(row[0])) if row else None

    async def save_component(self, component: Component) -> Component:
        data = component.model_dump_json()
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                "INSERT OR REPLACE INTO components (id, project_id, created_at, data) VALUES (?,?,?,?)",
                (component.id, component.project_id, component.created_at.isoformat(), data),
            )
            await db.commit()
        return component

    async def delete_component(self, component_id: str) -> bool:
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute("DELETE FROM messages WHERE component_id=?", (component_id,))
            cur = await db.execute("DELETE FROM components WHERE id=?", (component_id,))
            await db.commit()
            return cur.rowcount > 0

    # ── dashboards ─────────────────────────────────────────────────────────────

    async def get_dashboards(self, project_id: str) -> list[Dashboard]:
        async with aiosqlite.connect(self._db_path) as db:
            async with db.execute(
                "SELECT data FROM dashboards WHERE project_id=? ORDER BY created_at",
                (project_id,),
            ) as cur:
                return [Dashboard.model_validate(json.loads(r[0])) async for r in cur]

    async def get_dashboard(self, dashboard_id: str) -> Dashboard | None:
        async with aiosqlite.connect(self._db_path) as db:
            async with db.execute("SELECT data FROM dashboards WHERE id=?", (dashboard_id,)) as cur:
                row = await cur.fetchone()
                return Dashboard.model_validate(json.loads(row[0])) if row else None

    async def save_dashboard(self, dashboard: Dashboard) -> Dashboard:
        data = dashboard.model_dump_json()
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                "INSERT OR REPLACE INTO dashboards (id, project_id, created_at, data) VALUES (?,?,?,?)",
                (dashboard.id, dashboard.project_id, dashboard.created_at.isoformat(), data),
            )
            await db.commit()
        return dashboard

    async def delete_dashboard(self, dashboard_id: str) -> bool:
        async with aiosqlite.connect(self._db_path) as db:
            cur = await db.execute("DELETE FROM dashboards WHERE id=?", (dashboard_id,))
            await db.commit()
            return cur.rowcount > 0

    # ── messages ───────────────────────────────────────────────────────────────

    async def get_messages(self, project_id: str, component_id: str | None = None) -> list[ChatMessage]:
        async with aiosqlite.connect(self._db_path) as db:
            if component_id is not None:
                q = "SELECT data FROM messages WHERE project_id=? AND component_id=? ORDER BY created_at"
                args = (project_id, component_id)
            else:
                q = "SELECT data FROM messages WHERE project_id=? ORDER BY created_at"
                args = (project_id,)
            async with db.execute(q, args) as cur:
                return [ChatMessage.model_validate(json.loads(r[0])) async for r in cur]

    async def save_message(self, message: ChatMessage) -> ChatMessage:
        data = message.model_dump_json()
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                "INSERT OR REPLACE INTO messages (id, project_id, component_id, created_at, data) VALUES (?,?,?,?,?)",
                (message.id, message.project_id, message.component_id, message.created_at.isoformat(), data),
            )
            await db.commit()
        return message

    # ── user settings ──────────────────────────────────────────────────────────

    async def get_settings(self) -> UserSettings:
        async with aiosqlite.connect(self._db_path) as db:
            async with db.execute("SELECT data FROM user_settings WHERE id='default'") as cur:
                row = await cur.fetchone()
                return UserSettings.model_validate(json.loads(row[0])) if row else UserSettings()

    async def save_settings(self, settings: UserSettings) -> UserSettings:
        settings.updated_at = datetime.now(timezone.utc)
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                "INSERT OR REPLACE INTO user_settings (id, data) VALUES ('default', ?)",
                (settings.model_dump_json(),),
            )
            await db.commit()
        return settings
