"""Tests for open_data_ai.context_builder — system prompt construction."""

from open_data_ai.context_builder import SYSTEM_PROMPT, build_context
from open_data_ai.models import Component, ComponentType


def make_comp(name, type=ComponentType.etl, code="", depends_on=None, output_schema=None):
    return Component(
        project_id="p",
        name=name,
        type=type,
        code=code,
        depends_on=depends_on or [],
        output_schema=output_schema or [],
    )


class TestBuildContext:
    def test_contains_system_prompt(self):
        comp = make_comp("my_etl")
        context = build_context(comp, [])
        assert SYSTEM_PROMPT in context

    def test_contains_component_name_and_type(self):
        comp = make_comp("revenue_loader")
        context = build_context(comp, [])
        assert "revenue_loader" in context
        assert "etl" in context

    def test_includes_current_code(self):
        comp = make_comp("loader", code="import pandas as pd")
        context = build_context(comp, [])
        assert "import pandas as pd" in context

    def test_no_code_section_when_empty(self):
        comp = make_comp("empty")
        context = build_context(comp, [])
        assert "Current code" not in context

    def test_dependency_columns_shown(self):
        dep = make_comp("upstream", output_schema=["date", "revenue"])
        dep.type = ComponentType.etl
        current = make_comp("downstream", depends_on=[dep.id])
        context = build_context(current, [dep, current])
        assert "date" in context
        assert "revenue" in context
        assert "upstream" in context

    def test_dependency_no_schema_shows_placeholder(self):
        dep = make_comp("dep_without_schema")
        current = make_comp("consumer", depends_on=[dep.id])
        context = build_context(current, [dep, current])
        assert "run the component first" in context

    def test_other_available_components_listed(self):
        other = make_comp("other_comp")
        current = make_comp("current")
        context = build_context(current, [current, other])
        assert "other_comp" in context
        assert "Other available components" in context

    def test_current_component_not_in_other_list(self):
        current = make_comp("self_comp")
        context = build_context(current, [current])
        # Should only appear once (in the "building/editing" section, not in "other")
        assert context.count("self_comp") == 1

    def test_cells_shown_when_present(self):
        comp = Component(
            project_id="p",
            name="nb",
            type=ComponentType.etl,
            cells=[
                {"id": "1", "source": "x = 1"},
                {"id": "2", "source": "x + 1"},
            ],
        )
        context = build_context(comp, [])
        assert "2 cells" in context
        assert "x = 1" in context
