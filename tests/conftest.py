"""Shared fixtures for open_data_ai SDK tests."""

import pytest
import pytest_asyncio

from open_data_ai.models import Component, ComponentType, Project
from open_data_ai.storage.memory import MemoryStore
from open_data_ai.storage.sqlite import SQLiteStore


@pytest.fixture
def memory_store():
    return MemoryStore()


@pytest_asyncio.fixture
async def sqlite_store(tmp_path):
    store = SQLiteStore(tmp_path / "test.db")
    await store.init()
    return store


@pytest.fixture
def sample_project():
    return Project(name="Test Project", description="A project for testing")


@pytest.fixture
def sample_component(sample_project):
    return Component(
        project_id=sample_project.id,
        name="my_etl",
        type=ComponentType.etl,
        code="[{'x': 1}]",
    )
