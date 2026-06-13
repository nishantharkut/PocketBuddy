import jwt
import datetime as _dt
from fastapi import Header, HTTPException
from typing import Optional
from app.core.config import settings

def get_current_user(authorization: Optional[str] = Header(None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = authorization.split(" ")[1]
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        return payload["userId"]
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

def _serialize_value(v):
    """Ensure naive datetimes get a Z suffix so frontend interprets them as UTC."""
    if isinstance(v, _dt.datetime):
        s = v.isoformat()
        if v.tzinfo is None and not s.endswith("Z"):
            s += "Z"
        return s
    return v

def map_doc(doc: dict) -> dict:
    if not doc: return None
    doc["id"] = str(doc.pop("_id"))
    for k, v in doc.items():
        doc[k] = _serialize_value(v)
    return doc

def map_docs(docs: list) -> list:
    return [map_doc(d) for d in docs]

