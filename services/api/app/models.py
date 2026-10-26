from typing import Any

from pydantic import BaseModel, ConfigDict, Field


def to_camel(value: str) -> str:
    first, *rest = value.split("_")
    return first + "".join(part.capitalize() for part in rest)


class ApiModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="ignore",
    )


class IntakeAnchor(ApiModel):
    line: int | None = None
    text: str | None = None
    reason: str | None = None


class IntakeRequest(ApiModel):
    image_base64: str | None = None
    mime_type: str = "image/png"
    text: str | None = None
    spoken_question: str | None = None
    source_url: str | None = None


class IntakeResult(ApiModel):
    provider: str = "gemma"
    model: str | None = None
    title: str | None = None
    problem_statement: str | None = None
    language: str | None = None
    code: str | None = None
    error_text: str | None = None
    spoken_question: str | None = None
    anchor: IntakeAnchor | None = None
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    notes: str | None = None


class HealthResponse(ApiModel):
    ok: bool = True
    service: str = "corrector-api"
    version: str = "0.2.0"
    gemma_configured: bool = False
    model: str = "gemma-4-31b-it"


class ErrorResponse(ApiModel):
    detail: str
    code: str = "error"
    extra: dict[str, Any] | None = None
