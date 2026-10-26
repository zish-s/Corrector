# services/api — FastAPI backend

**Status: Milestone 2 placeholder.**

The backend is deliberately small and holds every secret. It routes intake to Gemma, hints to the open reasoning model, and code to the sandboxed runner. The extension never calls a model provider directly.

## Planned scope

| Milestone | Responsibility |
| --- | --- |
| M2 | FastAPI skeleton, `/health`, config, Dockerfile, DigitalOcean deployment. |
| M4 | `/v1/intake`: screenshot/voice → Gemma 4 → validated structured JSON. |
| M6 | `/v1/hint`: build the Socratic prompt, call vLLM (OpenAI-compatible), run the policy checks, regenerate. |
| M8 | `/v1/execute`: send code to the runner, capture traceback and timing. |
| M10 | Retrieval of relevant journal entries (no full journal upload). |

## Environment

Copy `.env.example` to `.env`; never commit it.

```text
GEMINI_API_KEY=
GEMMA_MODEL=
REASONING_BASE_URL=
REASONING_MODEL=
REASONING_API_KEY=
OLLAMA_BASE_URL=
OLLAMA_MODEL=
RUNNER_URL=
RUNNER_TOKEN=
```

## Security boundaries

- Keys live here, not in the extension.
- User code never runs on the API host; it goes to the runner.
- Screenshots are not retained by default.
- Logs are metadata-only by default; code/problem text requires explicit consent.
- Rate limits and request size limits are mandatory before public deployment.

## Non-goals

- A general chat API.
- Storing third-party problem statements.
- Training on learner data without consent.

See `docs/ARCHITECTURE.md` and `docs/PRIVACY.md`.
