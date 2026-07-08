import hashlib
import hmac
import secrets
from typing import Optional

from app.core.config import settings


def _pepper() -> bytes:
    return settings.JWT_SECRET.encode("utf-8")


def hash_sensitive_value(value: Optional[str], namespace: str) -> Optional[str]:
    cleaned = (value or "").strip()
    if not cleaned:
        return None
    payload = f"{namespace}:{cleaned}".encode("utf-8")
    return hmac.new(_pepper(), payload, hashlib.sha256).hexdigest()


def mask_sensitive_value(value: Optional[str], visible_start: int = 4, visible_end: int = 4) -> Optional[str]:
    cleaned = (value or "").strip()
    if not cleaned:
        return None
    if len(cleaned) <= visible_start + visible_end:
        return "****"
    return f"{cleaned[:visible_start]}****{cleaned[-visible_end:]}"


def generate_connector_pairing_token() -> str:
    return f"pb_{secrets.token_urlsafe(24)}"


def connector_token_hash(token: Optional[str]) -> Optional[str]:
    return hash_sensitive_value(token, "connector-pairing-token")


def connector_token_preview(token: Optional[str]) -> Optional[str]:
    return mask_sensitive_value(token, 5, 4)


def connector_pairing_present(profile: dict) -> bool:
    return bool(profile.get("pairing_code_hash") or profile.get("pairing_code"))


def verify_connector_pairing_token(profile: dict, supplied_token: Optional[str]) -> bool:
    supplied = (supplied_token or "").strip()
    if not supplied:
        return False

    stored_hash = profile.get("pairing_code_hash")
    if stored_hash:
        supplied_hash = connector_token_hash(supplied)
        return bool(supplied_hash and hmac.compare_digest(stored_hash, supplied_hash))

    # Migration path for previously issued raw pairing codes. New tokens are
    # server-generated and stored only as hashes.
    legacy_code = profile.get("pairing_code")
    return bool(legacy_code and hmac.compare_digest(str(legacy_code), supplied))


def device_fingerprint(device_id: Optional[str]) -> Optional[str]:
    return hash_sensitive_value(device_id, "android-device-id")


def masked_device_id(device_id: Optional[str]) -> Optional[str]:
    return mask_sensitive_value(device_id, 4, 4)
