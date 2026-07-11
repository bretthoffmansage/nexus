"""Nexus Gateway API token scopes — machine client authorization only.

Nexus scopes authorize Gateway intake/read surfaces. They do not grant shell,
MCP, legacy chat-agent, admin, or connector-write privileges.
"""

from __future__ import annotations

from fastapi import HTTPException, Request

# Legacy Odysseus API token scopes (existing behavior).
SCOPE_CHAT = "chat"
SCOPE_RESEARCH = "research"

# Nexus Gateway machine scopes (Package 3+).
SCOPE_NEXUS_INTAKE = "nexus_intake"
SCOPE_NEXUS_WORKER = "nexus_worker"
SCOPE_NEXUS_READ = "nexus_read"
SCOPE_NEXUS_ADMIN = "nexus_admin"

NEXUS_SCOPES = frozenset({
    SCOPE_NEXUS_INTAKE,
    SCOPE_NEXUS_WORKER,
    SCOPE_NEXUS_READ,
    SCOPE_NEXUS_ADMIN,
})

LEGACY_SCOPES = frozenset({SCOPE_CHAT, SCOPE_RESEARCH})

ALL_KNOWN_API_TOKEN_SCOPES = NEXUS_SCOPES | LEGACY_SCOPES

DEFAULT_API_TOKEN_SCOPES = SCOPE_CHAT


def parse_scopes_csv(scopes_csv: str) -> list[str]:
    """Split a comma-separated scope string into normalized unique names."""
    parts = [s.strip() for s in (scopes_csv or "").split(",") if s.strip()]
    return list(dict.fromkeys(parts))


def validate_scopes_csv(scopes_csv: str) -> str:
    """Validate scope names; return normalized comma-separated string."""
    scopes = parse_scopes_csv(scopes_csv)
    if not scopes:
        scopes = [DEFAULT_API_TOKEN_SCOPES]
    unknown = [s for s in scopes if s not in ALL_KNOWN_API_TOKEN_SCOPES]
    if unknown:
        raise ValueError(
            f"Unknown API token scope(s): {', '.join(unknown)}. "
            f"Allowed: {', '.join(sorted(ALL_KNOWN_API_TOKEN_SCOPES))}"
        )
    return ",".join(scopes)


def get_api_token_scopes(request: Request) -> set[str]:
    return set(getattr(request.state, "api_token_scopes", []) or [])


def api_token_has_scope(request: Request, scope: str) -> bool:
    return scope in get_api_token_scopes(request)


def require_api_token_scope(request: Request, scope: str, *, label: str | None = None) -> None:
    """Bearer token must be present and include ``scope``."""
    if not getattr(request.state, "api_token", False):
        raise HTTPException(status_code=403, detail="This endpoint requires an API token")
    if not api_token_has_scope(request, scope):
        name = label or scope
        raise HTTPException(status_code=403, detail=f"API token is not scoped for {name}")


def require_legacy_chat_api_token(request: Request) -> None:
    """Legacy ``POST /api/v1/chat`` — requires ``chat`` scope, not Nexus scopes."""
    require_api_token_scope(request, SCOPE_CHAT, label="chat")


def authorize_nexus_intake(request: Request) -> None:
    """``POST /api/nexus/v1/intake`` — session auth or ``nexus_intake`` bearer token."""
    if getattr(request.state, "api_token", False):
        require_api_token_scope(request, SCOPE_NEXUS_INTAKE, label="Nexus intake")
        return

    from src.auth_helpers import _auth_disabled, get_current_user, require_user

    if _auth_disabled():
        return
    if get_current_user(request):
        return
    require_user(request)


def authorize_nexus_read(request: Request) -> None:
    """Gateway read routes — session auth or ``nexus_read`` bearer token."""
    if getattr(request.state, "api_token", False):
        require_api_token_scope(request, SCOPE_NEXUS_READ, label="Nexus read")
        return
    from src.auth_helpers import _auth_disabled, get_current_user, require_user

    if _auth_disabled():
        return
    if get_current_user(request):
        return
    require_user(request)


def authorize_nexus_admin(request: Request) -> None:
    """Approval resolution and other privileged Gateway writes — ``nexus_admin`` bearer."""
    if getattr(request.state, "api_token", False):
        require_api_token_scope(request, SCOPE_NEXUS_ADMIN, label="Nexus admin")
        return
    from src.auth_helpers import _auth_disabled, get_current_user, require_user

    if _auth_disabled():
        return
    if get_current_user(request):
        return
    require_user(request)


def authorize_nexus_worker(request: Request) -> None:
    """``POST /api/nexus/v1/worker-output`` — session auth or ``nexus_worker`` bearer."""
    if getattr(request.state, "api_token", False):
        require_api_token_scope(request, SCOPE_NEXUS_WORKER, label="Nexus worker")
        return
    from src.auth_helpers import _auth_disabled, get_current_user, require_user

    if _auth_disabled():
        return
    if get_current_user(request):
        return
    require_user(request)
