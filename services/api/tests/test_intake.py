from __future__ import annotations

import base64
import json
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from app import main
from app.config import Settings
from app.gemma import GemmaError, GemmaIntakeProvider
from app.models import IntakeAnchor, IntakeRequest, IntakeResult

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"0" * 80
PNG_B64 = base64.b64encode(PNG_BYTES).decode("ascii")

GOOD_RAW = {
    "title": "Longest Substring",
    "problemStatement": "Find the longest substring without a repeated character.",
    "language": "cpp",
    "code": "int l = 0, r = 0, MaxLen = 0;",
    "errorText": "",
    "anchor": {"line": 1, "text": "MaxLen", "reason": "missing type"},
    "confidence": 0.91,
    "notes": "code visible",
}


class FakeProvider:
    def __init__(self, result: IntakeResult | None = None, error: Exception | None = None):
        self.result = result
        self.error = error
        self.seen_image = b""

    async def extract(
        self, request: IntakeRequest, image_bytes: bytes | None
    ) -> IntakeResult:
        self.seen_image = image_bytes or b""
        if self.error:
            raise self.error
        return self.result or IntakeResult(
            provider="gemma",
            model="fake",
            title="Two Sum",
            code="def two_sum(nums, target): ...",
            anchor=IntakeAnchor(line=3, text="for", reason="loop hinge"),
            confidence=0.8,
        )


@pytest.fixture
def client() -> TestClient:
    main.app.state.intake_provider = None
    main.settings.gemini_api_key = None
    main.settings.allow_local_intake = True
    return TestClient(main.app)


def test_health_reports_configuration(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["gemmaConfigured"] is False


def test_intake_uses_injected_provider(client: TestClient) -> None:
    fake = FakeProvider()
    main.app.state.intake_provider = fake

    response = client.post(
        "/v1/intake",
        json={
            "imageBase64": PNG_B64,
            "mimeType": "image/png",
            "spokenQuestion": "What should I fix?",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["provider"] == "gemma"
    assert body["title"] == "Two Sum"
    assert body["anchor"]["text"] == "for"
    assert fake.seen_image == PNG_BYTES


def test_intake_rejects_empty_request(client: TestClient) -> None:
    response = client.post("/v1/intake", json={})
    assert response.status_code == 400
    assert "screenshot" in response.json()["detail"].lower()


def test_intake_rejects_bad_base64(client: TestClient) -> None:
    main.app.state.intake_provider = FakeProvider()
    response = client.post(
        "/v1/intake",
        json={"imageBase64": "not-base64!", "mimeType": "image/png"},
    )
    assert response.status_code == 400


def test_text_fallback_is_labelled_local(client: TestClient) -> None:
    code = "\n".join(
        [
            "class Solution {",
            "public:",
            "    int lengthOfLongestSubstring(string s) {",
            "        int arr[256] = {0};",
            "        l = 0, r = 0, MaxLen = 0;",
            "        return MaxLen;",
            "    }",
            "};",
        ]
    )
    response = client.post("/v1/intake", json={"text": code})
    assert response.status_code == 200
    body = response.json()
    assert body["provider"] == "local"
    assert body["language"] == "cpp"
    assert body["anchor"]["line"] == 5
    assert body["anchor"]["text"] == "MaxLen"


def test_image_without_key_is_blocked_with_a_clear_message(client: TestClient) -> None:
    response = client.post(
        "/v1/intake",
        json={"imageBase64": PNG_B64, "mimeType": "image/png"},
    )
    assert response.status_code == 503
    assert "GEMINI_API_KEY" in response.json()["detail"]


def test_provider_failure_maps_to_502(client: TestClient) -> None:
    main.app.state.intake_provider = FakeProvider(error=GemmaError("Gemma timed out.", 502))
    response = client.post(
        "/v1/intake",
        json={"imageBase64": PNG_B64, "mimeType": "image/png"},
    )
    assert response.status_code == 502
    assert "timed out" in response.json()["detail"]


def gemini_response(raw: dict[str, Any]) -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "candidates": [
                {
                    "content": {
                        "parts": [{"text": json.dumps(raw)}],
                    }
                }
            ]
        },
    )


@pytest.mark.asyncio
async def test_gemma_provider_parses_structured_json() -> None:
    requests: list[dict[str, Any]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        requests.append(payload)
        return gemini_response(GOOD_RAW)

    settings = Settings(gemini_api_key="test-key", gemma_model="gemma-4-test")
    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as http:
        provider = GemmaIntakeProvider(settings, client=http)
        result = await provider.extract(
            IntakeRequest(
                image_base64=PNG_B64,
                mime_type="image/png",
                spoken_question="Where should I look?",
            ),
            PNG_BYTES,
        )

    assert result.provider == "gemma"
    assert result.model == "gemma-4-test"
    assert result.anchor is not None
    assert result.anchor.text == "MaxLen"
    assert result.spoken_question == "Where should I look?"
    assert len(requests) == 1
    parts = requests[0]["contents"][0]["parts"]
    assert parts[0]["text"].startswith("You are Corrector's intake parser")
    assert parts[1]["inline_data"]["mime_type"] == "image/png"


@pytest.mark.asyncio
async def test_gemma_provider_repairs_one_invalid_response() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(
                200,
                json={
                    "candidates": [
                        {"content": {"parts": [{"text": "not json at all"}]}}
                    ]
                },
            )
        return gemini_response(GOOD_RAW)

    settings = Settings(gemini_api_key="test-key", gemma_model="gemma-4-test")
    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as http:
        provider = GemmaIntakeProvider(settings, client=http)
        result = await provider.extract(IntakeRequest(), PNG_BYTES)

    assert calls == 2
    assert result.anchor is not None
    assert result.anchor.line == 1


@pytest.mark.asyncio
async def test_gemma_provider_maps_auth_failure() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(403, json={"error": {"message": "API key not valid"}})

    settings = Settings(gemini_api_key="bad-key", gemma_model="gemma-4-test")
    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as http:
        provider = GemmaIntakeProvider(settings, client=http)
        with pytest.raises(GemmaError) as caught:
            await provider.extract(IntakeRequest(), PNG_BYTES)
    assert "API key" in str(caught.value)
