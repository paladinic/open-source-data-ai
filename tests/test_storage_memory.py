"""Tests for open_data_ai.storage.memory.MemoryStore — in-memory CRUD."""

import pytest

from open_data_ai.models import (
    ChatMessage,
    Component,
    ComponentType,
    Dashboard,
    Project,
    UserSettings,
)
from open_data_ai.storage.memory import MemoryStore


@pytest.fixture
def store():
    return MemoryStore()


@pytest.fixture
def project():
    return Project(name="Test")


@pytest.fixture
def component(project):
    return Component(project_id=project.id, name="etl1", type=ComponentType.etl, code="[{'x': 1}]")


# ── Projects ──────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_save_and_get_project(store, project):
    await store.save_project(project)
    found = await store.get_project(project.id)
    assert found is not None
    assert found.name == "Test"


@pytest.mark.asyncio
async def test_get_missing_project_returns_none(store):
    assert await store.get_project("missing") is None


@pytest.mark.asyncio
async def test_list_projects(store):
    p1 = Project(name="A")
    p2 = Project(name="B")
    await store.save_project(p1)
    await store.save_project(p2)
    projects = await store.get_projects()
    assert len(projects) == 2


@pytest.mark.asyncio
async def test_delete_project_cascades(store, project, component):
    await store.save_project(project)
    await store.save_component(component)
    msg = ChatMessage(project_id=project.id, component_id=component.id, role="user", content="hi")
    await store.save_message(msg)

    deleted = await store.delete_project(project.id)
    assert deleted is True
    assert await store.get_project(project.id) is None
    assert await store.get_component(component.id) is None
    assert await store.get_messages(project.id) == []


@pytest.mark.asyncio
async def test_delete_missing_project_returns_false(store):
    assert await store.delete_project("ghost") is False


# ── Components ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_save_and_get_component(store, component):
    await store.save_component(component)
    found = await store.get_component(component.id)
    assert found is not None
    assert found.name == "etl1"


@pytest.mark.asyncio
async def test_get_components_filters_by_project(store, project):
    c1 = Component(project_id=project.id, name="a", type=ComponentType.etl)
    c2 = Component(project_id="other-proj", name="b", type=ComponentType.etl)
    await store.save_component(c1)
    await store.save_component(c2)
    results = await store.get_components(project.id)
    assert len(results) == 1
    assert results[0].name == "a"


@pytest.mark.asyncio
async def test_delete_component(store, component):
    await store.save_component(component)
    assert await store.delete_component(component.id) is True
    assert await store.get_component(component.id) is None


@pytest.mark.asyncio
async def test_delete_missing_component_returns_false(store):
    assert await store.delete_component("ghost") is False


# ── Dashboards ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_save_and_get_dashboard(store, project):
    d = Dashboard(project_id=project.id, name="Main")
    await store.save_dashboard(d)
    found = await store.get_dashboard(d.id)
    assert found is not None
    assert found.name == "Main"


@pytest.mark.asyncio
async def test_delete_dashboard(store, project):
    d = Dashboard(project_id=project.id, name="Main")
    await store.save_dashboard(d)
    assert await store.delete_dashboard(d.id) is True
    assert await store.get_dashboard(d.id) is None


# ── Messages ──────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_save_and_list_messages(store, project, component):
    m = ChatMessage(project_id=project.id, component_id=component.id, role="user", content="hello")
    await store.save_message(m)
    msgs = await store.get_messages(project.id)
    assert len(msgs) == 1
    assert msgs[0].content == "hello"


@pytest.mark.asyncio
async def test_filter_messages_by_component(store, project):
    c1 = Component(project_id=project.id, name="a", type=ComponentType.etl)
    c2 = Component(project_id=project.id, name="b", type=ComponentType.etl)
    m1 = ChatMessage(project_id=project.id, component_id=c1.id, role="user", content="for c1")
    m2 = ChatMessage(project_id=project.id, component_id=c2.id, role="user", content="for c2")
    await store.save_message(m1)
    await store.save_message(m2)
    results = await store.get_messages(project.id, component_id=c1.id)
    assert len(results) == 1
    assert results[0].content == "for c1"


# ── Settings ──────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_settings_defaults(store):
    s = await store.get_settings()
    assert s.id == "default"
    assert s.max_auto_retries == 3


@pytest.mark.asyncio
async def test_save_and_get_settings(store):
    s = UserSettings(anthropic_api_key="sk-test")
    await store.save_settings(s)
    loaded = await store.get_settings()
    assert loaded.anthropic_api_key == "sk-test"
