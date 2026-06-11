"""
Tests for open_data_ai.pipeline.Pipeline — decorator API, run(), and programmatic usage.
"""

import pytest

from open_data_ai.models import Component, ComponentType
from open_data_ai.pipeline import Pipeline
from open_data_ai.storage.memory import MemoryStore

# ── Basic decorator usage ─────────────────────────────────────────────────────


def test_component_decorator_registers():
    pipeline = Pipeline()

    @pipeline.component(type="etl")
    def my_data(inputs):
        return [{"x": 1}]

    assert pipeline.get_component("my_data") is not None


def test_run_returns_list_of_dicts():
    pipeline = Pipeline()

    @pipeline.component(type="etl")
    def rows(inputs):
        return [{"a": 1}, {"a": 2}]

    result = pipeline.run("rows")
    assert result == [{"a": 1}, {"a": 2}]


def test_run_returns_dict_for_viz():
    pipeline = Pipeline()

    @pipeline.component(type="visualisation")
    def chart(inputs):
        return {"type": "bar", "data": {}}

    result = pipeline.run("chart")
    assert result == {"type": "bar", "data": {}}


def test_run_returns_raw_for_model():
    pipeline = Pipeline()

    @pipeline.component(type="model")
    def trained(inputs):
        return object()

    result = pipeline.run("trained")
    assert result is not None


# ── Dependency chaining ───────────────────────────────────────────────────────


def test_depends_on_passes_output():
    pipeline = Pipeline()

    @pipeline.component(type="etl")
    def source(inputs):
        return [{"v": 10}]

    @pipeline.component(type="etl", depends_on=["source"])
    def doubled(inputs):
        return [{"v": r["v"] * 2} for r in inputs["source"]]

    result = pipeline.run("doubled")
    assert result == [{"v": 20}]


def test_three_level_chain():
    pipeline = Pipeline()

    @pipeline.component(type="etl")
    def raw(inputs):
        return [{"n": 1}, {"n": 2}, {"n": 3}]

    @pipeline.component(type="etl", depends_on=["raw"])
    def filtered(inputs):
        return [r for r in inputs["raw"] if r["n"] > 1]

    @pipeline.component(type="etl", depends_on=["filtered"])
    def total(inputs):
        return [{"sum": sum(r["n"] for r in inputs["filtered"])}]

    result = pipeline.run("total")
    assert result == [{"sum": 5}]


# ── Error handling ────────────────────────────────────────────────────────────


def test_run_raises_on_missing_component():
    pipeline = Pipeline()
    with pytest.raises(ValueError, match="not found"):
        pipeline.run("nonexistent")


def test_run_raises_on_execution_failure():
    pipeline = Pipeline()

    @pipeline.component(type="etl")
    def broken(inputs):
        raise RuntimeError("intentional failure")

    with pytest.raises(RuntimeError, match="intentional failure"):
        pipeline.run("broken")


# ── run_result: full ExecutionResult ─────────────────────────────────────────


def test_run_result_returns_execution_result():
    pipeline = Pipeline()

    @pipeline.component(type="etl")
    def data(inputs):
        print("captured")
        return [{"x": 1}]

    result = pipeline.run_result("data")
    assert result.success is True
    assert result.rows == [{"x": 1}]
    assert result.columns == ["x"]
    assert "captured" in result.stdout


# ── add_component (programmatic, no decorator) ────────────────────────────────


def test_add_component_programmatic():
    pipeline = Pipeline()
    comp = Component(
        project_id=pipeline._project_id,
        name="manual",
        type=ComponentType.etl,
        code="[{'val': 99}]",
    )
    pipeline.add_component(comp)
    result = pipeline.run("manual")
    assert result == [{"val": 99}]


def test_list_components_returns_all():
    pipeline = Pipeline()

    @pipeline.component()
    def a(inputs):
        return []

    @pipeline.component()
    def b(inputs):
        return []

    comps = pipeline.list_components()
    names = {c.name for c in comps}
    assert {"a", "b"} == names


# ── Custom store ──────────────────────────────────────────────────────────────


def test_pipeline_with_custom_memory_store():
    store = MemoryStore()
    pipeline = Pipeline(store=store)

    @pipeline.component(type="etl")
    def data(inputs):
        return [{"k": "v"}]

    result = pipeline.run("data")
    assert result == [{"k": "v"}]
    # Component was persisted in the store
    comps = pipeline.list_components()
    assert len(comps) == 1


# ── Filter inputs ─────────────────────────────────────────────────────────────


def test_filter_inputs_applied():
    pipeline = Pipeline()

    @pipeline.component(type="etl")
    def sales(inputs):
        return [
            {"month": "Jan", "revenue": 100},
            {"month": "Feb", "revenue": 200},
        ]

    @pipeline.component(type="etl", depends_on=["sales"])
    def total(inputs):
        return [{"sum": sum(r["revenue"] for r in inputs["sales"])}]

    result = pipeline.run("total", filter_inputs={"sales.month": "Jan"})
    assert result == [{"sum": 100}]


# ── Code components ──────────────────────────────────────────────────────────


def test_code_component_exposes_functions():
    pipeline = Pipeline()

    @pipeline.component(type="code")
    def utils(inputs):
        def normalise(values):
            lo, hi = min(values), max(values)
            return [(v - lo) / (hi - lo) for v in values]

        def clamp(v, lo, hi):
            return max(lo, min(hi, v))

    comp = pipeline.get_component("utils")
    assert comp is not None
    assert comp.type.value == "code"


def test_code_component_used_by_etl():
    pipeline = Pipeline()

    @pipeline.component(type="code")
    def math_utils(inputs):
        def square(x):
            return x * x

    @pipeline.component(type="etl", depends_on=["math_utils"])
    def results(inputs):
        sq = inputs["math_utils"].square
        return [{"v": sq(n)} for n in [2, 3, 4]]

    result = pipeline.run("results")
    assert result == [{"v": 4}, {"v": 9}, {"v": 16}]


# ── Cache invalidation ────────────────────────────────────────────────────────


def test_invalidate_cache():
    pipeline = Pipeline()

    @pipeline.component(type="etl")
    def data(inputs):
        return [{"x": 1}]

    pipeline.run("data")
    pipeline.invalidate_cache()
    # Should run again without error after cache clear
    result = pipeline.run("data")
    assert result == [{"x": 1}]
