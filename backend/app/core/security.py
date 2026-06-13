import jwt
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

def map_doc(doc: dict) -> dict:
    if not doc: return None
    doc["id"] = str(doc.pop("_id"))
    return doc

def map_docs(docs: list) -> list:
    return [map_doc(d) for d in docs]
