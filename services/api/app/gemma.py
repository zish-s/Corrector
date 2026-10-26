from __future__ import annotations

import base64
import json
import logging
from typing import Any, Protocol

import httpx
from pydantic import ValidationError

from .config import Settings
from .models import IntakeRequest, IntakeResult

logger = logging.getLogger("corrector.gemma")

MAX_DETAIL = 320
ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp"}

INTAKE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "problemStatement": {"type": "string"},
        "language": {"type": "string"},
        "code": {"type": "string"},
        "errorText": {"type": "string"},
        "anchor": {
            "type": "object",
            "properties": {
                "line": {"type": "integer", "nullable": True},
                "text": {"type": "string"},
                "reason": {"type": "string"},
            },
            "required": ["text", "reason"],
        },
        "confidence": {"type": "number"},
        "notes": {"type": "string"},
    },
    "required": [
        "title",
        "problemStatement",
        "language",
        "code",
        "anchor",
        "confidence",
    ],
}


class IntakeInputError(ValueError):
    """The request itself is malformed (not a Gemma failure)."""


class GemmaError(RuntimeError):
    """A provider failure with a safe, user-facing message."""

    def __init__(self, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.status_code = status_code


class IntakeProvider(Protocol):
    async def extract(
        self,
        request: IntakeRequest,
        image_bytes: bytes | None,
    ) -> IntakeResult: ...


def decode_image(request: IntakeRequest, max_bytes: int) -> bytes | None:
    if not request.image_base64:
        return None
    if request.mime_type not in ALLOWED_IMAGE_TYPES:
        raise IntakeInputError(
            f"Unsupported image type {request.mime_type!r}. Use PNG, JPEG, or WebP."
        )
    try:
        data = base64.b64decode(request.image_base64, validate=True)
    except (ValueError, TypeError) as exc:
        raise IntakeInputError("The screenshot is not valid base64 data.") from exc
    if len(data) > max_bytes:
        raise IntakeInputError(
            f"The screenshot is larger than {max_bytes // 1_000_000} MB."
        )
    if len(data) < 32:
        raise IntakeInputError("The screenshot looks empty.")
    return data


def _prompt(request: IntakeRequest) -> str:
    context: list[str] = []
    if request.text:
        context.append(f"Learner-provided text/code:\n{request.text}")
    if request.spoken_question:
        context.append(f"Learner's spoken question: {request.spoken_question}")
    if request.source_url:
        context.append(f"Page URL (metadata only): {request.source_url}")
    extra = "\n\n".join(context) if context else "No extra text was supplied."

    return f"""You are Corrector's intake parser. You are not a tutor.

Read the screenshot and extract only what is visible. Never solve the problem,
never write a fix, never give a hint, and never invent missing code.

Return one JSON object with exactly these fields:
- title: the problem title, or an empty string if there is none
- problemStatement: the visible problem statement in your own compressed words,
  or an empty string if it is not visible
- language: the programming language (cpp, python, java, javascript, or text)
- code: the exact code visible in the editor, preserving line breaks
- errorText: the exact compiler/runtime error visible, or an empty string
- anchor: the one line and token that deserves the first Socratic question.
  line is 1-based. text is the smallest visible token or phrase on that line.
  reason is one short phrase explaining why it is the hinge. If there is no code,
  use an empty text and null line.
- confidence: a number from 0 to 1 for the extraction, not for the answer
- notes: optional short extraction caveat

Do not include markdown fences, prose outside the JSON, or a solution.
{extra}"""


def _extract_json(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1]
        cleaned = cleaned.rsplit("```", 1)[0]
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start < 0 or end <= start:
        raise json.JSONDecodeError("No JSON object found", cleaned, 0)
    return json.loads(cleaned[start : end + 1])


def _error_detail(response: httpx.Response) -> str:
    try:
        body = response.json()
    except Exception:
        return response.text[:MAX_DETAIL] or f"HTTP {response.status_code}"
    if isinstance(body, dict):
        error = body.get("error")
        if isinstance(error, dict) and isinstance(error.get("message"), str):
            return error["message"][:MAX_DETAIL]
        if isinstance(body.get("detail"), str):
            return body["detail"][:MAX_DETAIL]
    return f"HTTP {response.status_code}"


class GemmaIntakeProvider:
    """Gemini API client for Gemma 4 multimodal intake.

    The client is injected in tests. In production each request gets a short-lived
    HTTP client; no screenshot or code is written to disk.
    """

    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None):
        if not settings.gemini_api_key:
            raise GemmaError(
                "Gemma is not configured. Put GEMINI_API_KEY in services/api/.env.",
                503,
            )
        self.settings = settings
        self._client = client

    async def _post(self, payload: dict[str, Any]) -> httpx.Response:
        url = (
            f"{self.settings.gemini_api_base}/models/"
            f"{self.settings.gemma_model}:generateContent"
            f"?key={self.settings.gemini_api_key}"
        )
        if self._client is not None:
            return await self._client.post(url, json=payload)
        async with httpx.AsyncClient(
            timeout=self.settings.gemma_timeout_seconds
        ) as client:
            return await client.post(url, json=payload)

    async def _generate(
        self,
        prompt: str,
        image_bytes: bytes | None,
        mime_type: str,
    ) -> str:
        parts: list[dict[str, Any]] = [{"text": prompt}]
        if image_bytes is not None:
            parts.append(
                {
                    "inline_data": {
                        "mime_type": mime_type,
                        "data": base64.b64encode(image_bytes).decode("ascii"),
                    }
                }
            )
        payload: dict[str, Any] = {
            "contents": [{"role": "user", "parts": parts}],
            "generationConfig": {
                "temperature": 0.1,
                "maxOutputTokens": 2048,
                "responseMimeType": "application/json",
                "responseSchema": INTAKE_SCHEMA,
            },
        }

        response = await self._post(payload)
        if response.status_code == 400 and "schema" in _error_detail(response).lower():
            # Some Gemma 4 endpoints expose structured output behind a flag. Retry
            # with a strict prompt and parse the JSON ourselves.
            payload["generationConfig"].pop("responseSchema", None)
            payload["generationConfig"].pop("responseMimeType", None)
            response = await self._post(payload)

        if response.status_code in (401, 403):
            raise GemmaError(
                "Gemma rejected the server-side API key. Replace GEMINI_API_KEY in "
                "services/api/.env with a fresh key.",
                502,
            )
        if response.status_code == 429:
            raise GemmaError("Gemma is rate-limited right now. Try again in a moment.", 502)
        if response.status_code >= 400:
            raise GemmaError(
                f"Gemma intake failed: {_error_detail(response)}",
                502,
            )

        body = response.json()
        candidates = body.get("candidates") or []
        if not candidates:
            raise GemmaError("Gemma returned no candidates for this screenshot.", 502)
        content = candidates[0].get("content") or {}
        chunks = [
            part.get("text", "")
            for part in (content.get("parts") or [])
            if isinstance(part, dict)
        ]
        text = "".join(chunks).strip()
        if not text:
            raise GemmaError("Gemma returned an empty intake response.", 502)
        return text

    def _parse(self, raw_text: str, request: IntakeRequest) -> IntakeResult:
        raw = _extract_json(raw_text)
        result = IntakeResult.model_validate(raw)
        result.provider = "gemma"
        result.model = self.settings.gemma_model
        if not result.spoken_question and request.spoken_question:
            result.spoken_question = request.spoken_question
        return result

    async def extract(
        self,
        request: IntakeRequest,
        image_bytes: bytes | None,
    ) -> IntakeResult:
        prompt = _prompt(request)
        raw_text = await self._generate(prompt, image_bytes, request.mime_type)
        try:
            return self._parse(raw_text, request)
        except (json.JSONDecodeError, ValidationError, ValueError) as first_error:
            logger.info("Gemma intake validation failed; one repair attempt")
            repair_prompt = (
                f"{prompt}\n\nYour previous answer failed validation: "
                f"{str(first_error)[:400]}. Return only a valid JSON object with "
                "every required field. Do not add prose or fences."
            )
            repaired = await self._generate(repair_prompt, image_bytes, request.mime_type)
            try:
                return self._parse(repaired, request)
            except (json.JSONDecodeError, ValidationError, ValueError) as second_error:
                raise GemmaError(
                    "Gemma returned JSON that could not be validated after one repair. "
                    "Try a clearer screenshot."
                ) from second_error
