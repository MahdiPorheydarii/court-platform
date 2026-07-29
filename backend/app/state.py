"""Tiny shared startup-state holder.

Lets ``/health`` report whether the database initialised, and surface the exact
error if it didn't, instead of the process crash-looping with no visibility.
"""
from __future__ import annotations

from typing import Optional, TypedDict


class StartupState(TypedDict):
    db_ready: bool
    error: Optional[str]


STARTUP: StartupState = {"db_ready": False, "error": None}
