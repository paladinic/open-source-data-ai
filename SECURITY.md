# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |

## Reporting a Vulnerability

**Do not report security vulnerabilities through public GitHub issues.**

Please email **[INSERT EMAIL]** with:

- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes (optional)

You should receive an acknowledgement within 72 hours. We will keep you informed as we work toward a fix and will credit you in the release notes unless you prefer to remain anonymous.

---

## Security Considerations

### Code Execution

`open_data_ai/executor.py` executes LLM-generated Python code using `exec()` in a
restricted namespace. This is **MVP-level sandboxing** — it prevents access to
variables outside the component's scope but does **not** provide process-level
isolation.

**Consequences:**

- Do not run Open BI Studio with untrusted users in a publicly exposed environment
  without wrapping the executor in a separate subprocess or container.
- Lite mode is designed for **single-user local use only**.
- For multi-user or hosted deployments, run the executor in an isolated process or
  container (e.g. Docker with seccomp/AppArmor, Firecracker microVM).

### Network Exposure

Lite mode binds to `127.0.0.1` (localhost) by default. Do not change the bind
address to `0.0.0.0` or expose the server on a public network without adding
authentication and the process isolation described above.

### API Keys

API keys (Anthropic, OpenAI, Gemini, Supabase) are stored in:

- `.env` — excluded from git via `.gitignore`; never commit this file
- In-memory `UserSettings` object during a session

In full mode (Supabase), user-provided API keys are persisted to the database
as plaintext rows, protected by Supabase Row-Level Security and service-role-only
backend access. A migration to Supabase Vault for encryption at rest is planned.

### Dependencies

This project uses third-party LLM SDKs (`anthropic`, `openai`, `google-genai`).
Keep dependencies up to date to pick up upstream security fixes:

```bash
pip install --upgrade open-data-ai[lite]
```
