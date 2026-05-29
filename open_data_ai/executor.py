"""
Executes generated Python component code in a restricted namespace.

SECURITY NOTE: This is MVP-grade sandboxing only (namespace restriction).
For production deployments, run execution in a separate process or container.
"""
from __future__ import annotations
import hashlib
import time
import traceback
from typing import Any, TYPE_CHECKING
from pydantic import BaseModel, field_serializer

from open_data_ai.models import Component, ComponentType

if TYPE_CHECKING:
    from open_data_ai.storage.base import BaseStore


# ── Execution cache ───────────────────────────────────────────────────────────
# Keyed by MD5 of (component code + all dependency codes).
# Only successful results are cached. TTL prevents stale data from external sources.

_cache: dict[str, tuple[float, "ExecutionResult"]] = {}
CACHE_TTL = 60  # seconds


def _sanitize_json(value: Any) -> Any:
    """Recursively make a structure JSON-serializable.

    - Primitives pass through unchanged.
    - numpy scalars/arrays are converted to Python natives.
    - datetime-like objects (pandas Timestamp, date, datetime) become ISO strings.
    - Anything else that can't be JSON-serialized is dropped (replaced with None).
    """
    import json
    import datetime
    if isinstance(value, dict):
        return {k: _sanitize_json(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_sanitize_json(v) for v in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    # datetime types → ISO string (pd.Timestamp is a datetime subclass)
    if isinstance(value, (datetime.datetime, datetime.date)):
        return value.isoformat()
    # numpy scalars / arrays
    try:
        import numpy as np
        if isinstance(value, (np.integer, np.floating)):
            return value.item()
        if isinstance(value, np.ndarray):
            return value.tolist()
    except ImportError:
        pass
    # Anything else: try JSON round-trip; drop on failure
    try:
        json.dumps(value)
        return value
    except (TypeError, ValueError):
        return None


def _cell_sources(component: Component) -> list[str]:
    """Return ordered list of non-empty cell source strings."""
    if component.cells:
        return [c.get("source", "") for c in component.cells if c.get("source", "").strip()]
    if component.code:
        return [component.code]
    return []


async def _cache_key(component: Component, store: "BaseStore") -> str:
    """Hash the component's cells/code and its dependencies' code for cache keying."""
    parts = ["|".join(_cell_sources(component))]
    for dep_id in sorted(component.depends_on):
        dep = await store.get_component(dep_id)
        if dep:
            parts.append("|".join(_cell_sources(dep)))
    return hashlib.md5(":".join(parts).encode()).hexdigest()


def invalidate_cache(component_id: str) -> None:
    """Clear the whole cache when a component's code is saved."""
    _cache.clear()


class ExecutionResult(BaseModel):
    model_config = {"arbitrary_types_allowed": True}

    success: bool
    rows: list[dict[str, Any]] = []        # for connector/pipeline components
    columns: list[str] = []                # column names extracted after successful run
    chart_config: dict[str, Any] | None = None  # for visualisation components
    raw_output: Any = None                 # for components that return arbitrary Python objects (e.g. ML models)
    raw_output_type: str = ""              # human-readable type name for API responses
    error: str = ""
    stdout: str = ""

    @field_serializer("raw_output")
    def _serialize_raw_output(self, value: Any) -> None:
        return None  # never attempt to JSON-serialize arbitrary objects


def _filter_rows(dep_data: list, col: str, fval: Any) -> list:
    """Filter a list-of-dicts by a single column value or [lo, hi] range."""
    if not dep_data or not isinstance(dep_data[0], dict) or col not in dep_data[0]:
        return dep_data
    if isinstance(fval, list) and len(fval) == 2:
        lo, hi = fval
        try:
            return [r for r in dep_data if lo <= r[col] <= hi]
        except TypeError:
            try:
                return [r for r in dep_data if lo <= str(r[col])[:10] <= hi]
            except Exception:
                return dep_data
    elif fval is not None:
        return [r for r in dep_data if str(r.get(col, "")) == str(fval)]
    return dep_data


def _apply_filter_inputs(resolved_inputs: dict[str, Any], filter_inputs: dict[str, Any]) -> dict[str, Any]:
    """
    Apply filter values to dependency data.

    filter_inputs keys:
      - "component_name.column"  → targeted: filter only that component's rows on that column
      - "column"                 → legacy: scan all deps for a matching column key

    filter_inputs values:
      - [lo, hi]  → keep rows where lo <= col <= hi  (numeric or date range)
      - scalar    → keep rows where col == value
    """
    result = dict(resolved_inputs)
    for fkey, fval in filter_inputs.items():
        if "." in fkey:
            comp_name, col = fkey.split(".", 1)
            if comp_name in result and isinstance(result[comp_name], list):
                result[comp_name] = _filter_rows(result[comp_name], col, fval)
        else:
            for dep_name, dep_data in list(result.items()):
                if not isinstance(dep_data, list) or not dep_data:
                    continue
                first = dep_data[0]
                if not isinstance(first, dict) or fkey not in first:
                    continue
                result[dep_name] = _filter_rows(dep_data, fkey, fval)
    return result


async def _build_inputs(
    component: Component,
    store: "BaseStore",
    filter_inputs: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Pre-execute each dependency and return their results keyed by component name.
    This populates the `inputs` dict passed to run(), e.g. inputs['rand_data_generator'].
    """
    inputs: dict[str, Any] = {}
    for dep_id in component.depends_on:
        dep = await store.get_component(dep_id)
        if dep and _cell_sources(dep):
            dep_filters = None if dep.type in ("model", "code") else filter_inputs
            dep_result = await run_component(dep, store=store, filter_inputs=dep_filters)
            if dep_result.success:
                if dep_result.raw_output is not None:
                    inputs[dep.name] = dep_result.raw_output
                elif dep_result.rows:
                    inputs[dep.name] = dep_result.rows
                else:
                    inputs[dep.name] = dep_result.chart_config
            else:
                inputs[dep.name] = []
    return inputs


def _filter_suffix(filter_inputs: dict[str, Any] | None) -> str:
    if not filter_inputs:
        return ""
    serialised = str(sorted((k, str(v)) for k, v in filter_inputs.items()))
    return ":" + hashlib.md5(serialised.encode()).hexdigest()[:8]


async def run_component(
    component: Component,
    *,
    store: "BaseStore",
    inputs: dict[str, Any] | None = None,
    filter_inputs: dict[str, Any] | None = None,
    use_cache: bool = True,
    up_to_cell: int | None = None,
) -> ExecutionResult:
    cacheable = use_cache and not inputs and up_to_cell is None
    if cacheable:
        key = (await _cache_key(component, store)) + _filter_suffix(filter_inputs)
        now = time.time()
        if key in _cache:
            ts, cached = _cache[key]
            if now - ts < CACHE_TTL:
                return cached

    result = await _run_component(component, store=store, inputs=inputs, filter_inputs=filter_inputs, up_to_cell=up_to_cell)

    if cacheable and result.success:
        key = (await _cache_key(component, store)) + _filter_suffix(filter_inputs)
        _cache[key] = (time.time(), result)

    return result


def _exec_cells(sources: list[str], namespace: dict[str, Any], resolved_inputs: dict[str, Any]) -> Any:
    """Run cells sequentially; capture the last expression of the final cell."""
    import ast as _ast

    namespace["inputs"] = resolved_inputs

    for source in sources[:-1]:
        exec(compile(source, "<cell>", "exec"), namespace)  # noqa: S102

    last = sources[-1]
    try:
        tree = _ast.parse(last)
    except SyntaxError:
        exec(last, namespace)  # noqa: S102
        return _namespace_output(namespace, resolved_inputs)

    if tree.body and isinstance(tree.body[-1], _ast.Expr):
        if len(tree.body) > 1:
            preamble = _ast.Module(body=tree.body[:-1], type_ignores=[])
            exec(compile(preamble, "<cell>", "exec"), namespace)  # noqa: S102
        last_expr = _ast.Expression(body=tree.body[-1].value)
        expr_val = eval(compile(last_expr, "<cell>", "eval"), namespace)  # noqa: S307
    else:
        exec(compile(last, "<cell>", "exec"), namespace)  # noqa: S102
        expr_val = None

    if "run" in namespace and callable(namespace["run"]):
        return namespace["run"](resolved_inputs)
    if expr_val is not None:
        return expr_val
    return namespace.get("output", namespace.get("result"))


def _namespace_output(namespace: dict, resolved_inputs: dict) -> Any:
    if "run" in namespace and callable(namespace["run"]):
        return namespace["run"](resolved_inputs)
    return namespace.get("output", namespace.get("result"))


async def _run_component(
    component: Component,
    *,
    store: "BaseStore",
    inputs: dict[str, Any] | None = None,
    filter_inputs: dict[str, Any] | None = None,
    up_to_cell: int | None = None,
) -> ExecutionResult:
    import io
    import sys

    sources = _cell_sources(component)
    if not sources:
        return ExecutionResult(success=False, error="Component has no executable code.")

    if up_to_cell is not None:
        sources = sources[: up_to_cell + 1]

    combined_filters: dict[str, Any] = {**(filter_inputs or {}), **(inputs or {})}

    resolved_inputs = await _build_inputs(component, store=store, filter_inputs=combined_filters or None)
    if combined_filters:
        resolved_inputs = _apply_filter_inputs(resolved_inputs, combined_filters)
    if inputs:
        resolved_inputs.update(inputs)

    namespace: dict[str, Any] = {"__builtins__": __builtins__}

    old_stdout = sys.stdout
    sys.stdout = buf = io.StringIO()

    try:
        result = _exec_cells(sources, namespace, resolved_inputs)

        # Code components expose their entire namespace as a SimpleNamespace so
        # downstream components can call inputs['my_utils'].my_function(...).
        if component.type == ComponentType.code:
            import types as _types
            ns = _types.SimpleNamespace(**{
                k: v for k, v in namespace.items()
                if not k.startswith("_") and k != "inputs"
            })
            if component.last_run_ok is not True:
                component.last_run_ok = True
                component.last_error = ""
                await store.save_component(component)
            t = type(ns)
            return ExecutionResult(
                success=True,
                raw_output=ns,
                raw_output_type=f"{t.__module__}.{t.__qualname__}",
                stdout=buf.getvalue(),
            )

        if result is None and "connect" in namespace:
            namespace["connect"]()
            result = []

        if isinstance(result, dict):
            if component.last_run_ok is not True:
                component.last_run_ok = True
                component.last_error = ""
                await store.save_component(component)
            return ExecutionResult(success=True, chart_config=_sanitize_json(result), stdout=buf.getvalue())

        if hasattr(result, "to_dict"):
            rows = _sanitize_json(result.to_dict(orient="records"))
        elif isinstance(result, list):
            rows = _sanitize_json(result) if result else []
        elif result is not None:
            t = type(result)
            if component.last_run_ok is not True:
                component.last_run_ok = True
                component.last_error = ""
                await store.save_component(component)
            return ExecutionResult(
                success=True,
                raw_output=result,
                raw_output_type=f"{t.__module__}.{t.__qualname__}",
                stdout=buf.getvalue(),
            )
        else:
            rows = []

        columns = list(rows[0].keys()) if rows else []

        changed = False
        if columns and columns != component.output_schema and up_to_cell is None:
            component.output_schema = columns
            changed = True
        if component.last_run_ok is not True or component.last_error:
            component.last_run_ok = True
            component.last_error = ""
            changed = True
        if changed:
            await store.save_component(component)

        return ExecutionResult(success=True, rows=rows, columns=columns, stdout=buf.getvalue())

    except Exception:
        err = traceback.format_exc()
        component.last_run_ok = False
        component.last_error = err[:2000]
        await store.save_component(component)
        return ExecutionResult(success=False, error=err, stdout=buf.getvalue())
    finally:
        sys.stdout = old_stdout
