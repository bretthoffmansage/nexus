"""Claudia Gateway API token scopes — machine client authorization only.

Claudia scopes authorize Gateway intake/read surfaces. They do not grant shell,
MCP, legacy chat-agent, admin, or connector-write privileges.
"""

from __future__ import annotations

from fastapi import HTTPException, Request

# Legacy Odysseus API token scopes (existing behavior).
SCOPE_CHAT = "chat"
SCOPE_RESEARCH = "research"

# Claudia Gateway machine scopes (Package 3+).
SCOPE_CLAUDIA_INTAKE = "claudia_intake"
SCOPE_CLAUDIA_WORKER = "claudia_worker"
SCOPE_CLAUDIA_READ = "claudia_read"
SCOPE_CLAUDIA_ADMIN = "claudia_admin"

CLAUDIA_SCOPES = frozenset({
    SCOPE_CLAUDIA_INTAKE,
    SCOPE_CLAUDIA_WORKER,
    SCOPE_CLAUDIA_READ,
    SCOPE_CLAUDIA_ADMIN,
})

LEGACY_SCOPES = frozenset({SCOPE_CHAT, SCOPE_RESEARCH})

ALL_KNOWN_API_TOKEN_SCOPES = CLAUDIA_SCOPES | LEGACY_SCOPES

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
    """Legacy ``POST /api/v1/chat`` — requires ``chat`` scope, not Claudia scopes."""
    require_api_token_scope(request, SCOPE_CHAT, label="chat")


def authorize_claudia_intake(request: Request) -> None:
    """``POST /api/claudia/v1/intake`` — session auth or ``claudia_intake`` bearer token."""
    if getattr(request.state, "api_token", False):
        require_api_token_scope(request, SCOPE_CLAUDIA_INTAKE, label="Claudia intake")
        return

    from src.auth_helpers import _auth_disabled, get_current_user, require_user

    if _auth_disabled():
        return
    if get_current_user(request):
        return
    require_user(request)


def authorize_claudia_read(request: Request) -> None:
    """Gateway read routes — session auth or ``claudia_read`` bearer token."""
    if getattr(request.state, "api_token", False):
        require_api_token_scope(request, SCOPE_CLAUDIA_READ, label="Claudia read")
        return
    from src.auth_helpers import _auth_disabled, get_current_user, require_user

    if _auth_disabled():
        return
    if get_current_user(request):
        return
    require_user(request)


def authorize_claudia_admin(request: Request) -> None:
    """Approval resolution and other privileged Gateway writes — ``claudia_admin`` bearer."""
    if getattr(request.state, "api_token", False):
        require_api_token_scope(request, SCOPE_CLAUDIA_ADMIN, label="Claudia admin")
        return
    from src.auth_helpers import _auth_disabled, get_current_user, require_user

    if _auth_disabled():
        return
    if get_current_user(request):
        return
    require_user(request)


def authorize_claudia_worker(request: Request) -> None:
    """``POST /api/claudia/v1/worker-output`` — session auth or ``claudia_worker`` bearer."""
    if getattr(request.state, "api_token", False):
        require_api_token_scope(request, SCOPE_CLAUDIA_WORKER, label="Claudia worker")
        return
    from src.auth_helpers import _auth_disabled, get_current_user, require_user

    if _auth_disabled():
        return
    if get_current_user(request):
        return
    require_user(request)
