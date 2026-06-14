import json
from typing import Any

from botocore.config import Config

from app.core.config import settings


def _bedrock_client():
    import boto3

    client_kwargs: dict[str, Any] = {
        "region_name": settings.BEDROCK_REGION or settings.AWS_REGION,
        "config": Config(
            connect_timeout=30,
            read_timeout=3600,
            retries={"max_attempts": 1},
        ),
    }

    if settings.AWS_ACCESS_KEY_ID and settings.AWS_SECRET_ACCESS_KEY:
        client_kwargs["aws_access_key_id"] = settings.AWS_ACCESS_KEY_ID
        client_kwargs["aws_secret_access_key"] = settings.AWS_SECRET_ACCESS_KEY
        if settings.AWS_SESSION_TOKEN:
            client_kwargs["aws_session_token"] = settings.AWS_SESSION_TOKEN

    return boto3.client("bedrock-runtime", **client_kwargs)


def _extract_text(response: dict[str, Any]) -> str:
    message = response.get("output", {}).get("message", {})
    content = message.get("content", [])
    parts = [block.get("text", "") for block in content if isinstance(block, dict)]
    return "\n".join(part for part in parts if part).strip()


def _strip_json_fence(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    elif cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    return cleaned.strip()


def _load_json_object(text: str) -> dict[str, Any]:
    cleaned = _strip_json_fence(text)
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise
        data = json.loads(cleaned[start : end + 1])

    if not isinstance(data, dict):
        raise ValueError("Bedrock response was not a JSON object")
    return data


def generate_text(prompt: str, *, max_tokens: int = 300, temperature: float = 0.2) -> str:
    response = _bedrock_client().converse(
        modelId=settings.BEDROCK_MODEL_ID,
        messages=[{"role": "user", "content": [{"text": prompt}]}],
        inferenceConfig={
            "maxTokens": max_tokens,
            "temperature": temperature,
        },
    )
    text = _extract_text(response)
    if not text:
        raise ValueError("Bedrock response did not contain text")
    return text


def generate_json(prompt: str, *, max_tokens: int = 500, temperature: float = 0.2) -> dict[str, Any]:
    return _load_json_object(generate_text(prompt, max_tokens=max_tokens, temperature=temperature))
