"""Password hashing + JWT issuance + API key generation."""
from __future__ import annotations
import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt

from bumblebee.config import get_settings

settings = get_settings()

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 1 day


def _truncate_for_bcrypt(s: str) -> bytes:
    """bcrypt has 72-byte input limit; truncate at byte level."""
    return s.encode("utf-8")[:72]


def hash_password(plain: str) -> str:
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(_truncate_for_bcrypt(plain), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(_truncate_for_bcrypt(plain), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(subject: str, extra: dict | None = None) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode = {"sub": subject, "exp": expire, **(extra or {})}
    return jwt.encode(to_encode, settings.api_secret_key, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.api_secret_key, algorithms=[ALGORITHM])
    except JWTError:
        return None


def generate_api_key() -> tuple[str, str]:
    """Generate raw API key + hash. Return raw to user once."""
    raw = "bb_" + secrets.token_urlsafe(32)
    h = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return raw, h


def hash_api_key(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
