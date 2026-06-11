"""Tests for open_data_ai.models — Pydantic model validation and defaults."""

from open_data_ai.models import AgentResponse, Component, ComponentType, Project, UserSettings


class TestComponent:
    def test_defaults(self):
        c = Component(project_id="p", name="etl", type=ComponentType.etl)
        assert c.id != ""
        assert c.code == ""
        assert c.depends_on == []
        assert c.cells == []
        assert c.output_schema == []
        assert c.last_run_ok is None

    def test_type_enum(self):
        assert ComponentType("etl") == ComponentType.etl
        assert ComponentType("visualisation") == ComponentType.visualisation
        assert ComponentType("model") == ComponentType.model

    def test_serialisation_roundtrip(self):
        c = Component(project_id="p", name="test", type=ComponentType.etl, code="x = 1")
        data = c.model_dump_json()
        restored = Component.model_validate_json(data)
        assert restored.id == c.id
        assert restored.code == "x = 1"

    def test_cells_take_precedence_over_code(self):
        c = Component(
            project_id="p",
            name="nb",
            type=ComponentType.etl,
            code="old code",
            cells=[{"id": "1", "source": "new code"}],
        )
        assert c.cells[0]["source"] == "new code"


class TestProject:
    def test_defaults(self):
        p = Project(name="My Project")
        assert p.id != ""
        assert p.workspace_id == ""
        assert p.description == ""


class TestUserSettings:
    def test_defaults(self):
        s = UserSettings()
        assert s.id == "default"
        assert s.max_auto_retries == 3
        assert s.safe_mode is False

    def test_active_provider_optional(self):
        s = UserSettings(active_provider="anthropic", active_model="claude-sonnet-4-6")
        assert s.active_provider == "anthropic"


class TestAgentResponse:
    def test_no_component(self):
        r = AgentResponse(reply="hello")
        assert r.component is None

    def test_with_component(self, sample_component):
        r = AgentResponse(reply="built it", component=sample_component)
        assert r.component is not None
        assert r.component.name == "my_etl"
