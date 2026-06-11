"""
Tests for open_data_ai.agent — response parsing and message formatting.
No actual LLM calls are made.
"""

from open_data_ai.agent import _messages_for_llm, _parse_response
from open_data_ai.models import AgentResponse, ChatMessage, ComponentType

PROJECT_ID = "proj-test"


class TestParseResponse:
    def test_plain_json_reply_only(self):
        raw = '{"reply": "Hello!", "component": null}'
        result = _parse_response(raw, PROJECT_ID)
        assert isinstance(result, AgentResponse)
        assert result.reply == "Hello!"
        assert result.component is None

    def test_json_with_component(self):
        raw = """{
            "reply": "Built your ETL",
            "component": {
                "name": "my_loader",
                "type": "etl",
                "description": "Loads data",
                "code": "import pandas as pd\\npd.read_csv('data.csv')",
                "config": {},
                "depends_on": []
            }
        }"""
        result = _parse_response(raw, PROJECT_ID)
        assert result.reply == "Built your ETL"
        assert result.component is not None
        assert result.component.name == "my_loader"
        assert result.component.type == ComponentType.etl
        assert result.component.project_id == PROJECT_ID

    def test_json_inside_code_fence(self):
        raw = 'Here is the result:\n```json\n{"reply": "Done", "component": null}\n```'
        result = _parse_response(raw, PROJECT_ID)
        assert result.reply == "Done"
        assert result.component is None

    def test_json_with_preamble_text(self):
        raw = 'Sure, here you go: {"reply": "Ready", "component": null} — enjoy!'
        result = _parse_response(raw, PROJECT_ID)
        assert result.reply == "Ready"

    def test_plain_text_fallback(self):
        raw = "I cannot help with that right now."
        result = _parse_response(raw, PROJECT_ID)
        assert result.reply == raw
        assert result.component is None

    def test_component_depends_on(self):
        raw = """{
            "reply": "Built viz",
            "component": {
                "name": "chart",
                "type": "visualisation",
                "description": "A chart",
                "code": "{}",
                "config": {},
                "depends_on": ["sales_data"]
            }
        }"""
        result = _parse_response(raw, PROJECT_ID)
        assert result.component.depends_on == ["sales_data"]

    def test_malformed_json_falls_back_to_plain_text(self):
        raw = '{"reply": "oops", "component": {invalid json'
        result = _parse_response(raw, PROJECT_ID)
        assert result.reply == raw
        assert result.component is None


class TestMessagesForLLM:
    def test_user_message_wrapped(self):
        msgs = [ChatMessage(project_id="p", role="user", content="hello")]
        out = _messages_for_llm(msgs)
        assert out[0]["role"] == "user"
        assert "<user_message>" in out[0]["content"]
        assert "hello" in out[0]["content"]

    def test_assistant_message_not_wrapped(self):
        msgs = [ChatMessage(project_id="p", role="assistant", content="hi back")]
        out = _messages_for_llm(msgs)
        assert out[0]["content"] == "hi back"

    def test_alternating_messages(self):
        msgs = [
            ChatMessage(project_id="p", role="user", content="q1"),
            ChatMessage(project_id="p", role="assistant", content="a1"),
            ChatMessage(project_id="p", role="user", content="q2"),
        ]
        out = _messages_for_llm(msgs)
        assert len(out) == 3
        assert "<user_message>" in out[0]["content"]
        assert out[1]["content"] == "a1"
        assert "<user_message>" in out[2]["content"]
