"""
JWT authentication middleware for FastAPI.
Verifies Supabase-issued JWT tokens passed as Authorization: Bearer <token>.
"""

import os
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer()

# Supabase JWT secrets are plain UTF-8 strings, NOT base64-encoded
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "").encode()


def verify_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """
    Validates the Supabase JWT and returns the decoded payload.
    The payload contains 'sub' (user_id) and 'email'.
    """
    token = credentials.credentials
    try:
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token abgelaufen",
        )
    except jwt.InvalidTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Ungültiges Token: {e}",
        )


def get_user_id(payload: dict = Depends(verify_token)) -> str:
    """Shortcut dependency – returns just the user_id string."""
    return payload["sub"]
