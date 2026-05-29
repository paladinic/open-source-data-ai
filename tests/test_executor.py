"""
Tests for open_data_ai.executor — component code execution, caching, dependency resolution.
Uses MemoryStore directly (no mocking needed for the store layer).
"""
import pytest
from unittest.mock import AsyncMock

import open_data_ai.executor as executor_module
from open_data_ai.executor import run_component, invalidate_cache, ExecutionResult, CACHE_TTL
from open_data_ai.models import Component, ComponentType
from open_data_ai.storage.memory import MemoryStore


# ── Helpers ───────────────────────────────────────────────────────────────────

def make_component(code="", name="comp", project_id="proj-1", depends_on=None, type=ComponentType.etl):
    return Component(
        project_id=project_id,
        name=name,
        type=type,
        code=code,
        depends_on=depends_on or [],
    )


@pytest.fixture(autouse=True)
def clear_cache():
    executor_module._cache.clear()
    yield
    executor_module._cache.clear()


@pytest.fixture
def store():
    return MemoryStore()


# ── No-code component ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_no_code_returns_error(store):
    comp = make_component(code="")
    result = await run_component(comp, store=store, use_cache=False)
    assert result.success is False
    assert "no executable code" in result.error.lower()


# ── ETL: tabular output ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_of_dicts_output(store):
    comp = make_component(code="[{'x': 1, 'y': 2}]")
    result = await run_component(comp, store=store, use_cache=False)
    assert result.success is True
    assert result.rows == [{"x": 1, "y": 2}]
    assert result.columns == ["x", "y"]
    assert result.chart_config is None


@pytest.mark.asyncio
async def test_multiple_rows(store):
    comp = make_component(code="[{'a': i} for i in range(3)]")
    result = await run_component(comp, store=store, use_cache=False)
    assert result.success is True
    assert len(result.rows) == 3
    assert result.columns == ["a"]


@pytest.mark.asyncio
async def test_empty_list_output(store):
    comp = make_component(code="[]")
    result = await run_component(comp, store=store, use_cache=False)
    assert result.success is True
    assert result.rows == []
    assert result.columns == []


@pytest.mark.asyncio
async def test_pandas_dataframe_output(store):
    code = "import pandas as pd\npd.DataFrame({'col1': [1, 2], 'col2': ['a', 'b']})"
    comp = make_component(code=code)
    result = await run_component(comp, store=store, use_cache=False)
    assert result.success is True
    assert result.rows == [{"col1": 1, "col2": "a"}, {"col1": 2, "col2": "b"}]
    assert set(result.columns) == {"col1", "col2"}


# ── Visualisation: dict output ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_chart_config_output(store):
    code = "{'type': 'bar', 'data': {}, 'options': {}}"
    comp = make_component(code=code, type=ComponentType.visualisation)
    result = await run_component(comp, store=store, use_cache=False)
    assert result.success is True
    assert result.chart_config == {"type": "bar", "data": {}, "options": {}}
    assert result.rows == []


# ── Model: raw object output ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_raw_object_output(store):
    code = "object()"
    comp = make_component(code=code, type=ComponentType.model)
    result = await run_component(comp, store=store, use_cache=False)
    assert result.success is True
    assert result.raw_output is not None
    assert result.raw_output_type != ""


# ── Error handling ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_syntax_error_returns_failure(store):
    comp = make_component(code="[[[")
    result = await run_component(comp, store=store, use_cache=False)
    assert result.success is False
    assert result.error != ""


@pytest.mark.asyncio
async def test_runtime_error_returns_failure(store):
    comp = make_component(code="raise ValueError('boom')")
    result = await run_component(comp, store=store, use_cache=False)
    assert result.success is False
    assert "ValueError" in result.error
    assert "boom" in result.error


@pytest.mark.asyncio
async def test_stdout_is_captured(store):
    comp = make_component(code="print('hello stdout')\n[]")
    result = await run_component(comp, store=store, use_cache=False)
    assert "hello stdout" in result.stdout


# ── Caching ───────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_successful_result_is_cached(store):
    comp = make_component(code="[{'v': 1}]")
    await store.save_component(comp)
    result1 = await run_component(comp, store=store, use_cache=True)
    result2 = await run_component(comp, store=store, use_cache=True)
    # Second call hits cache — component saved only once
    comp_after = await store.get_component(comp.id)
    assert result1.rows == result2.rows == [{"v": 1}]
    assert comp_after.last_run_ok is True


@pytest.mark.asyncio
async def test_failed_result_not_cached(store):
    comp = make_component(code="raise RuntimeError('fail')")
    await run_component(comp, store=store, use_cache=True)
    assert len(executor_module._cache) == 0


@pytest.mark.asyncio
async def test_cache_bypassed_when_inputs_provided(store):
    comp = make_component(code="inputs.get('val', 0)")
    result1 = await run_component(comp, store=store, inputs={"val": 1}, use_cache=True)
    result2 = await run_component(comp, store=store, inputs={"val": 2}, use_cache=True)
    assert result1.raw_output == 1
    assert result2.raw_output == 2


@pytest.mark.asyncio
async def test_cache_expires_after_ttl(store):
    comp = make_component(code="[{'v': 1}]")
    await store.save_component(comp)
    await run_component(comp, store=store, use_cache=True)

    # Manually expire the cache
    for key in executor_module._cache:
        ts, cached = executor_module._cache[key]
        executor_module._cache[key] = (ts - CACHE_TTL - 1, cached)

    # Reset so save_component triggers again
    comp.output_schema = []
    result = await run_component(comp, store=store, use_cache=True)
    assert result.success is True


def test_invalidate_cache_clears_all():
    executor_module._cache["key1"] = (0, ExecutionResult(success=True))
    executor_module._cache["key2"] = (0, ExecutionResult(success=True))
    invalidate_cache("any-id")
    assert executor_module._cache == {}


# ── Dependency resolution ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_dependency_output_passed_as_inputs(store):
    dep = make_component(code="[{'dep_val': 42}]", name="my_dep")
    await store.save_component(dep)

    current = make_component(
        code="inputs.get('my_dep', [])",
        name="consumer",
        depends_on=[dep.id],
    )
    result = await run_component(current, store=store, use_cache=False)
    assert result.success is True
    assert result.rows == [{"dep_val": 42}]


@pytest.mark.asyncio
async def test_failed_dependency_passes_empty_list(store):
    dep = make_component(code="raise RuntimeError('dep broken')", name="bad_dep")
    await store.save_component(dep)

    current = make_component(
        code="inputs.get('bad_dep', 'missing')",
        name="consumer",
        depends_on=[dep.id],
    )
    result = await run_component(current, store=store, use_cache=False)
    assert result.success is True
    assert result.rows == []


@pytest.mark.asyncio
async def test_filter_applied_to_dependency(store):
    dep = make_component(
        code="[{'month': 'Jan', 'revenue': 100}, {'month': 'Feb', 'revenue': 200}]",
        name="sales",
    )
    await store.save_component(dep)

    current = make_component(
        code="inputs['sales']",
        name="filtered",
        depends_on=[dep.id],
    )
    result = await run_component(
        current,
        store=store,
        filter_inputs={"sales.month": "Jan"},
        use_cache=False,
    )
    assert result.success is True
    assert result.rows == [{"month": "Jan", "revenue": 100}]


# ── Code components ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_code_component_returns_namespace(store):
    code = "def add(a, b):\n    return a + b\n\ndef double(x):\n    return x * 2"
    comp = make_component(code=code, type=ComponentType.code)
    result = await run_component(comp, store=store, use_cache=False)
    assert result.success is True
    assert result.raw_output is not None
    assert callable(result.raw_output.add)
    assert result.raw_output.add(1, 2) == 3
    assert result.raw_output.double(5) == 10


@pytest.mark.asyncio
async def test_code_component_namespace_excludes_inputs(store):
    code = "x = 42"
    comp = make_component(code=code, type=ComponentType.code)
    result = await run_component(comp, store=store, use_cache=False)
    assert result.success is True
    # 'inputs' should not bleed into the exposed namespace
    assert not hasattr(result.raw_output, "inputs")
    assert result.raw_output.x == 42


@pytest.mark.asyncio
async def test_code_component_used_by_downstream(store):
    utils = make_component(
        code="def square(x):\n    return x * x",
        name="utils",
        type=ComponentType.code,
    )
    await store.save_component(utils)

    consumer = make_component(
        code="[{'result': inputs['utils'].square(r['n'])} for r in [{'n': 3}, {'n': 4}]]",
        name="consumer",
        depends_on=[utils.id],
    )
    result = await run_component(consumer, store=store, use_cache=False)
    assert result.success is True
    assert result.rows == [{"result": 9}, {"result": 16}]


@pytest.mark.asyncio
async def test_code_component_not_filtered(store):
    """Code components must never receive filter_inputs (like model type)."""
    utils = make_component(
        code="def greet(name):\n    return f'hello {name}'",
        name="utils",
        type=ComponentType.code,
    )
    await store.save_component(utils)

    consumer = make_component(
        code="[{'msg': inputs['utils'].greet('world')}]",
        name="consumer",
        depends_on=[utils.id],
    )
    # Filter should not propagate to the code component
    result = await run_component(
        consumer,
        store=store,
        filter_inputs={"some_col": "val"},
        use_cache=False,
    )
    assert result.success is True
    assert result.rows == [{"msg": "hello world"}]


# ── Notebook-style cells ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_multi_cell_execution(store):
    comp = Component(
        project_id="p", name="nb", type=ComponentType.etl,
        cells=[
            {"id": "1", "source": "x = 10"},
            {"id": "2", "source": "[{'value': x * 2}]"},
        ],
    )
    result = await run_component(comp, store=store, use_cache=False)
    assert result.success is True
    assert result.rows == [{"value": 20}]
