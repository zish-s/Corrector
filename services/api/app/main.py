from __future__ import annotations

import logging

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .gemma import (
    GemmaError,
    GemmaIntakeProvider,
    IntakeInputError,
    decode_image,
)
from .local_intake import local_intake
from .models import HealthResponse, IntakeRequest, IntakeResult

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("corrector.api")

app = FastAPI(
    title="Corrector API",
    version="0.2.0",
    description=(
        "Server-side intake for Corrector. Gemma 4 reads screenshots; the extension "
        "never holds a provider key."
    ),
)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origin_list,
    allow_origin_regex=settings.allowed_origin_regex,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

app.state.intake_provider = None


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(
        gemma_configured=bool(settings.gemini_api_key),
        model=settings.gemma_model,
    )


@app.post("/v1/intake", response_model=IntakeResult)
async def intake(request: IntakeRequest) -> IntakeResult:
    if request.text and len(request.text) > settings.max_text_chars:
        raise HTTPException(status_code=413, detail="The pasted text is too large.")
    if not request.image_base64 and not request.text and not request.spoken_question:
        raise HTTPException(
            status_code=400,
            detail="Add a screenshot, code/text, or a spoken question.",
        )

    try:
        image_bytes = decode_image(request, settings.max_image_bytes)
    except IntakeInputError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    provider = getattr(app.state, "intake_provider", None)
    if provider is None and not settings.gemini_api_key:
        if request.text and settings.allow_local_intake:
            try:
                return local_intake(request)
            except ValueError as error:
                raise HTTPException(status_code=400, detail=str(error)) from error
        raise HTTPException(
            status_code=503,
            detail=(
                "Gemma is not configured. Put a fresh GEMINI_API_KEY in "
                "services/api/.env, or use the local Monaco demo without intake."
            ),
        )
    if provider is None:
        provider = GemmaIntakeProvider(settings)

    try:
        return await provider.extract(request, image_bytes)
    except GemmaError as error:
        logger.warning("Gemma intake failed: %s", error)
        raise HTTPException(status_code=error.status_code, detail=str(error)) from error
    except IntakeInputError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/")
async def root() -> dict[str, str]:
    return {
        "service": "corrector-api",
        "docs": "/docs",
        "health": "/health",
        "intake": "/v1/intake",
    }
