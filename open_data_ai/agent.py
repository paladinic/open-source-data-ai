"""
Central AI agent. All LLM calls route through here.
Input:  list of chat messages + system context string
Output: AgentResponse (reply text + optional Component)
"""
from __future__ import annotations
import json
import re
from typing import Any

from open_data_ai.models import AgentResponse, Component, ChatMessage


def _parse_response(raw: str, project_id: str) -> AgentResponse:
    """
    Extract JSON from the LLM response robustly.
    Models often add preamble/postamble text around the JSON block.
    """
    text = raw.strip()
    candidates = []

    candidates.append(text)

    fence = re.search(r'```(?:json)?\s*([\s\S]+?)\s*```', text)
    if fence:
        candidates.append(fence.group(1).strip())

    start = text.find('{')
    end = text.rfind('}')
    if start != -1 and end > start:
        candidates.append(text[start:end + 1])

    for candidate in candidates:
        try:
            data = json.loads(candidate)
            if isinstance(data, dict) and 'reply' in data:
                return _build_agent_response(data, project_id)
        except json.JSONDecodeError:
            continue

    return AgentResponse(reply=raw, component=None)


def _build_agent_response(data: dict[str, Any], project_id: str) -> AgentResponse:
    reply = data.get("reply", "")
    comp_data = data.get("component")

    component = None
    if comp_data and isinstance(comp_data, dict):
        component = Component(
            project_id=project_id,
            name=comp_data.get("name", "unnamed"),
            type=comp_data.get("type", "etl"),
            description=comp_data.get("description", ""),
            code=comp_data.get("code", ""),
            config=comp_data.get("config", {}),
            depends_on=comp_data.get("depends_on", []),
        )

    return AgentResponse(reply=reply, component=component)


def _messages_for_llm(history: list[ChatMessage]) -> list[dict]:
    """Wrap user messages in XML delimiters to resist prompt injection."""
    out = []
    for m in history:
        if m.role == "user":
            out.append({"role": "user", "content": f"<user_message>\n{m.content}\n</user_message>"})
        else:
            out.append({"role": m.role, "content": m.content})
    return out


def chat(
    history: list[ChatMessage],
    system_context: str,
    project_id: str,
    *,
    provider: str = "",
    model: str = "",
    anthropic_key: str = "",
    openai_key: str = "",
    gemini_key: str = "",
    system_instructions: str = "",
    default_provider: str = "gemini",
    default_model: str = "gemini-2.5-flash",
) -> AgentResponse:
    if system_instructions:
        system_context = f"{system_instructions}\n\n---\n\n{system_context}"

    eff_provider = provider or default_provider
    eff_model = model or default_model

    if eff_provider == "anthropic":
        return _chat_anthropic(history, system_context, project_id, anthropic_key, eff_model)
    elif eff_provider == "openai":
        return _chat_openai(history, system_context, project_id, openai_key, eff_model)
    elif eff_provider == "gemini":
        return _chat_gemini(history, system_context, project_id, gemini_key, eff_model)
    else:
        raise ValueError(f"Unknown LLM provider: {eff_provider!r}")


def _chat_anthropic(history, system_context, project_id, api_key, model) -> AgentResponse:
    import anthropic

    client = anthropic.Anthropic(api_key=api_key)
    response = client.messages.create(
        model=model,
        max_tokens=4096,
        system=system_context,
        messages=_messages_for_llm(history),
    )
    raw = response.content[0].text
    return _parse_response(raw, project_id)


def _chat_openai(history, system_context, project_id, api_key, model) -> AgentResponse:
    from openai import OpenAI

    client = OpenAI(api_key=api_key)
    messages = [{"role": "system", "content": system_context}] + _messages_for_llm(history)
    response = client.chat.completions.create(
        model=model,
        messages=messages,
        max_tokens=4096,
    )
    raw = response.choices[0].message.content
    return _parse_response(raw, project_id)


def _chat_gemini(history, system_context, project_id, api_key, model) -> AgentResponse:
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)

    gemini_history = [
        types.Content(
            role="model" if m["role"] == "assistant" else "user",
            parts=[types.Part(text=m["content"])],
        )
        for m in _messages_for_llm(history)[:-1]
    ]
    last_message = _messages_for_llm(history)[-1]["content"]

    chat_session = client.chats.create(
        model=model,
        history=gemini_history,
        config=types.GenerateContentConfig(system_instruction=system_context),
    )
    response = chat_session.send_message(last_message)
    return _parse_response(response.text, project_id)
