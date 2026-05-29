"""
open_data_ai — headless Python SDK for component-based data pipelines.

Quick start
-----------
    from open_data_ai import Pipeline

    pipeline = Pipeline()

    @pipeline.component(type="etl")
    def load_data(inputs):
        import pandas as pd
        return pd.read_csv("data.csv")

    @pipeline.component(type="etl", depends_on=["load_data"])
    def summarise(inputs):
        df = __import__("pandas").DataFrame(inputs["load_data"])
        return df.describe().reset_index()

    result = pipeline.run("summarise")

Storage backends
----------------
    from open_data_ai import Pipeline
    from open_data_ai.storage import SQLiteStore

    pipeline = Pipeline(store=SQLiteStore("my_pipeline.db"))

With AI code generation
-----------------------
    pipeline = Pipeline(llm_provider="anthropic", api_key="sk-ant-...")
    reply = pipeline.chat("load_data", "Load the CSV at ./sales.csv")
"""
from open_data_ai.pipeline import Pipeline
from open_data_ai.models import Component, ComponentType, Project, AgentResponse
from open_data_ai.executor import ExecutionResult, run_component, invalidate_cache
from open_data_ai.storage import BaseStore, MemoryStore, SQLiteStore

__all__ = [
    "Pipeline",
    "Component",
    "ComponentType",
    "Project",
    "AgentResponse",
    "ExecutionResult",
    "run_component",
    "invalidate_cache",
    "BaseStore",
    "MemoryStore",
    "SQLiteStore",
]

__version__ = "0.1.0"
