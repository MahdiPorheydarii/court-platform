"""Domain exceptions and their HTTP mapping.

Routers raise these; a single exception handler (registered in ``main``) turns
them into structured JSON error bodies so the frontend never sees a bare 500
with a stack trace.
"""
from __future__ import annotations

from typing import Any, Dict, Optional


class AppError(Exception):
    status_code: int = 400
    code: str = "bad_request"

    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.message = message
        self.details = details


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"


class ConflictError(AppError):
    status_code = 409
    code = "conflict"


class ValidationError(AppError):
    status_code = 422
    code = "validation_error"


class AuthError(AppError):
    status_code = 401
    code = "unauthorized"


class ForbiddenError(AppError):
    status_code = 403
    code = "forbidden"
