from __future__ import annotations

import re

from .models import IntakeAnchor, IntakeRequest, IntakeResult


def _detect_language(text: str) -> str:
    if "#include" in text or "class Solution" in text or "vector<" in text:
        return "cpp"
    if re.search(r"^\s*def\s+\w+\s*\(", text, re.MULTILINE):
        return "python"
    if "public class" in text or "System.out" in text:
        return "java"
    if "function " in text or "const " in text or "let " in text:
        return "javascript"
    return "text"


def _anchor(text: str) -> IntakeAnchor | None:
    lines = text.replace("\r\n", "\n").split("\n")
    for index, line in enumerate(lines):
        missing_type = re.search(
            r"\b(?:l|left)\s*=\s*0\s*,\s*(?:r|right)\s*=\s*0\s*,\s*([A-Za-z_]\w*)\s*=\s*0",
            line,
        )
        if missing_type:
            # The type must sit immediately before the first declared name. A
            # line like `int f() { l = 0, ...` starts with `int`, but that int
            # belongs to the return type, not to l/r/MaxLen.
            prefix = line[: missing_type.start()].rstrip()
            if not re.search(
                r"\b(?:int|long|size_t|auto|unsigned|const|static|var|let)\s*$",
                prefix,
            ):
                return IntakeAnchor(
                    line=index + 1,
                    text=missing_type.group(1),
                    reason="the third name is outside the declaration's type",
                )
    for index, line in enumerate(lines):
        if re.search(r"^\s*for\b", line):
            return IntakeAnchor(
                line=index + 1,
                text="for",
                reason="this loop is the first place state changes",
            )
    for index, line in enumerate(lines):
        token = re.search(r"[A-Za-z_]\w{3,}", line)
        if token:
            return IntakeAnchor(
                line=index + 1,
                text=token.group(0),
                reason="first meaningful identifier",
            )
    return None


def local_intake(request: IntakeRequest) -> IntakeResult:
    """No-key fallback for pasted text. It never claims to have read an image."""
    text = (request.text or "").strip()
    if not text:
        raise ValueError("Local intake needs text or code; it cannot read an image.")

    lines = text.splitlines()
    title = lines[0][:80] if lines and len(lines[0]) <= 80 else "Pasted code"
    language = _detect_language(text)
    anchor = _anchor(text)
    return IntakeResult(
        provider="local",
        model=None,
        title=title,
        problem_statement="",
        language=language,
        code=text,
        error_text="",
        spoken_question=request.spoken_question,
        anchor=anchor,
        confidence=0.35 if anchor else 0.2,
        notes=(
            "Local text fallback: Gemma is not configured, so no screenshot was "
            "analyzed. Set GEMINI_API_KEY for multimodal intake."
        ),
    )
