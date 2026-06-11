"""
High-level Pipeline API for programmatic / headless use.

Example
-------
    from open_data_ai import Pipeline

    pipeline = Pipeline()

    @pipeline.component(type="etl")
    def load_sales(inputs):
        import pandas as pd
        return pd.read_csv("sales.csv")

    @pipeline.component(type="etl", depends_on=["load_sales"])
    def monthly_revenue(inputs):
        df = pd.DataFrame(inputs["load_sales"])
        return df.groupby("month")["revenue"].sum().reset_index()

    result = pipeline.run("monthly_revenue")
    print(result)   # list-of-dicts
"""

from __future__ import annotations

import asyncio
import inspect
import textwrap
from typing import Any, Callable

from open_data_ai.executor import ExecutionResult, invalidate_cache, run_component
from open_data_ai.models import Component, ComponentType
from open_data_ai.storage.base import BaseStore
from open_data_ai.storage.memory import MemoryStore

# Sentinel project ID used by the Pipeline when no explicit project is given.
_DEFAULT_PROJECT_ID = "pipeline-default"


class Pipeline:
    """
    Manages a collection of components and runs them programmatically.

    Parameters
    ----------
    store:
        Storage backend. Defaults to an in-memory store (no persistence).
    project_id:
        Logical grouping for components. Defaults to a built-in sentinel value.
    llm_provider:
        LLM provider for .chat() ("anthropic" | "openai" | "gemini").
    llm_model:
        Model name passed to the LLM provider.
    api_key:
        API key for the chosen provider.
    """

    def __init__(
        self,
        store: BaseStore | None = None,
        project_id: str = _DEFAULT_PROJECT_ID,
        llm_provider: str = "gemini",
        llm_model: str = "gemini-2.5-flash",
        api_key: str = "",
    ) -> None:
        self._store = store or MemoryStore()
        self._project_id = project_id
        self._llm_provider = llm_provider
        self._llm_model = llm_model
        self._api_key = api_key
        # name → component ID (for decorator-based registration)
        self._name_to_id: dict[str, str] = {}

    # ── component decorator ────────────────────────────────────────────────────

    def component(
        self,
        type: str = "etl",
        depends_on: list[str] | None = None,
        description: str = "",
        name: str | None = None,
    ) -> Callable:
        """
        Decorator that registers a Python function as a pipeline component.

        The function body is extracted as source code and stored as component
        code. The `inputs` dict is injected at runtime by the executor.

        Parameters
        ----------
        type:
            "etl" | "visualisation" | "model"
        depends_on:
            List of component *names* this component reads from via `inputs`.
        description:
            Optional human-readable description.
        name:
            Component name. Defaults to the function name.
        """

        def decorator(fn: Callable) -> Callable:
            comp_name = name or fn.__name__
            dep_ids = self._resolve_dep_ids(depends_on or [])
            comp = Component(
                project_id=self._project_id,
                name=comp_name,
                type=ComponentType(type),
                description=description or (fn.__doc__ or "").strip(),
                code=_extract_source(fn, is_code=ComponentType(type) == ComponentType.code),
                depends_on=dep_ids,
            )
            _run_sync(self._store.save_component(comp))
            self._name_to_id[comp_name] = comp.id
            return fn

        return decorator

    # ── component management ───────────────────────────────────────────────────

    def add_component(self, component: Component) -> None:
        """Register a pre-built Component model directly."""
        if component.project_id != self._project_id:
            component = component.model_copy(update={"project_id": self._project_id})
        _run_sync(self._store.save_component(component))
        self._name_to_id[component.name] = component.id

    def list_components(self) -> list[Component]:
        """Return all components in this pipeline."""
        return _run_sync(self._store.get_components(self._project_id))

    def get_component(self, name: str) -> Component | None:
        """Look up a component by name."""
        comp_id = self._name_to_id.get(name)
        if comp_id:
            return _run_sync(self._store.get_component(comp_id))
        # Fallback: scan all components (handles components added via add_component)
        for comp in self.list_components():
            if comp.name == name:
                self._name_to_id[name] = comp.id
                return comp
        return None

    # ── execution ──────────────────────────────────────────────────────────────

    def run(
        self,
        name: str,
        *,
        inputs: dict[str, Any] | None = None,
        filter_inputs: dict[str, Any] | None = None,
        use_cache: bool = True,
    ) -> list[dict] | dict | Any:
        """
        Execute a component by name and return its output.

        Returns
        -------
        list[dict]
            For ETL components — tabular data as list-of-dicts.
        dict
            For visualisation components — renderer config dict.
        Any
            For model components — the raw Python object (e.g. a fitted sklearn estimator).

        Raises
        ------
        ValueError
            If the component is not found or execution fails.
        """
        comp = self.get_component(name)
        if comp is None:
            raise ValueError(f"Component {name!r} not found in pipeline.")

        result: ExecutionResult = _run_sync(
            run_component(
                comp,
                store=self._store,
                inputs=inputs,
                filter_inputs=filter_inputs,
                use_cache=use_cache,
            )
        )

        if not result.success:
            raise RuntimeError(f"Component {name!r} failed:\n{result.error}")

        if result.raw_output is not None:
            return result.raw_output
        if result.chart_config is not None:
            return result.chart_config
        return result.rows

    def run_result(
        self,
        name: str,
        *,
        inputs: dict[str, Any] | None = None,
        filter_inputs: dict[str, Any] | None = None,
        use_cache: bool = True,
    ) -> ExecutionResult:
        """Like run(), but returns the full ExecutionResult (includes stdout, columns, etc.)."""
        comp = self.get_component(name)
        if comp is None:
            raise ValueError(f"Component {name!r} not found in pipeline.")
        return _run_sync(
            run_component(
                comp,
                store=self._store,
                inputs=inputs,
                filter_inputs=filter_inputs,
                use_cache=use_cache,
            )
        )

    def invalidate_cache(self) -> None:
        """Clear the execution cache."""
        invalidate_cache("")

    # ── AI chat ────────────────────────────────────────────────────────────────

    def chat(
        self,
        component_name: str,
        message: str,
        *,
        provider: str = "",
        model: str = "",
        api_key: str = "",
    ) -> str:
        """
        Send a natural-language message to the AI to generate or modify a component.

        Requires an LLM provider to be configured (via constructor or parameters).
        Returns the AI's reply text. If the AI produced a component update, it is
        automatically saved and the component code is updated.

        Parameters
        ----------
        component_name:
            Name of the component to chat about. It will be created if it doesn't exist.
        message:
            The user's natural-language request.
        provider / model / api_key:
            Override the pipeline-level LLM settings for this call.
        """
        from open_data_ai.agent import chat as agent_chat
        from open_data_ai.context_builder import build_context
        from open_data_ai.models import ChatMessage

        comp = self.get_component(component_name)
        if comp is None:
            comp = Component(
                project_id=self._project_id,
                name=component_name,
                type=ComponentType.etl,
            )
            _run_sync(self._store.save_component(comp))
            self._name_to_id[component_name] = comp.id

        all_components = self.list_components()
        system_context = build_context(comp, all_components)

        history = _run_sync(self._store.get_messages(self._project_id, comp.id))
        history.append(
            ChatMessage(
                project_id=self._project_id, component_id=comp.id, role="user", content=message
            )
        )

        eff_provider = provider or self._llm_provider
        eff_model = model or self._llm_model
        eff_key = api_key or self._api_key

        key_kwargs: dict[str, str] = {}
        if eff_provider == "anthropic":
            key_kwargs["anthropic_key"] = eff_key
        elif eff_provider == "openai":
            key_kwargs["openai_key"] = eff_key
        elif eff_provider == "gemini":
            key_kwargs["gemini_key"] = eff_key

        response = agent_chat(
            history,
            system_context,
            self._project_id,
            provider=eff_provider,
            model=eff_model,
            default_provider=eff_provider,
            default_model=eff_model,
            **key_kwargs,
        )

        # Persist user + assistant messages
        _run_sync(self._store.save_message(history[-1]))
        assistant_msg = ChatMessage(
            project_id=self._project_id,
            component_id=comp.id,
            role="assistant",
            content=response.reply,
        )
        _run_sync(self._store.save_message(assistant_msg))

        # Apply component update if the AI produced one
        if response.component:
            updated = response.component.model_copy(
                update={
                    "id": comp.id,
                    "project_id": self._project_id,
                    "name": component_name,
                }
            )
            _run_sync(self._store.save_component(updated))
            invalidate_cache(comp.id)

        return response.reply

    # ── helpers ────────────────────────────────────────────────────────────────

    def _resolve_dep_ids(self, dep_names: list[str]) -> list[str]:
        """Convert dependency *names* to component IDs, looking up the store as needed."""
        ids = []
        for dep_name in dep_names:
            if dep_name in self._name_to_id:
                ids.append(self._name_to_id[dep_name])
            else:
                comp = self.get_component(dep_name)
                if comp:
                    ids.append(comp.id)
                # If not found, silently skip — component may not be registered yet.
        return ids


# ── helpers ────────────────────────────────────────────────────────────────────


def _extract_source(fn: Callable, is_code: bool = False) -> str:
    """
    Extract component code from a decorated function.

    For regular components: keeps the full `def fn(inputs):` block and appends
    `result = fn(inputs)` so the executor captures the return value.

    For code components (is_code=True): extracts only the function body so that
    inner `def` / `class` statements become top-level in the executed namespace,
    making them directly accessible via `inputs['name'].my_function(...)`.
    """
    src = inspect.getsource(fn)
    lines = src.splitlines()
    # Strip decorator lines and locate the `def` line
    body_lines: list[str] = []
    in_fn = False
    for line in lines:
        if not in_fn:
            if line.lstrip().startswith("def "):
                in_fn = True
                if is_code:
                    continue  # skip the `def fn(inputs):` wrapper line
                else:
                    body_lines.append(line)
        else:
            body_lines.append(line)
    source = textwrap.dedent("\n".join(body_lines)).strip()
    if is_code:
        return source
    return f"{source}\nresult = {fn.__name__}(inputs)"


def _run_sync(coro) -> Any:
    """Run an async coroutine from synchronous code."""
    try:
        asyncio.get_running_loop()
        # Already inside an event loop (e.g. Jupyter) — use a thread
        import concurrent.futures

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(asyncio.run, coro)
            return future.result()
    except RuntimeError:
        return asyncio.run(coro)
