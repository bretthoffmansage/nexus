"""legacy local console/Gateway private deployment posture checks (Package 16).

Read-only warnings for /health — never includes secret values.
"""

from __future__ import annotations

import os
from typing import Any
from urllib.parse import urlparse

from src.nexus_client import get_core_base_url, get_gateway_secret
from src.console_mode import is_console_mode
from src.hermes_runtime import validate_hermes_runtime

_LOOPBACK_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})


def _env_truthy(name: str, default: str = "false") -> bool:
    return os.environ.get(name, default).strip().lower() in ("1", "true", "yes", "on")


def _bind_address() -> str:
    return (os.environ.get("ODYSSEUS_HOST") or os.environ.get("APP_BIND") or "127.0.0.1").strip()


def _is_loopback_host(hostname: str | None) -> bool:
    if not hostname:
        return True
    h = hostname.lower().strip("[]")
    if h in _LOOPBACK_HOSTS:
        return True
    if h.startswith("127."):
        return True
    return False


def _is_private_lan_host(hostname: str | None) -> bool:
    """RFC1918 + Tailscale CGNAT (100.64.0.0/10) — acceptable for private access."""
    if not hostname:
        return True
    h = hostname.lower().strip("[]")
    if _is_loopback_host(h):
        return True
    if h.endswith(".ts.net"):
        return True
    parts = h.split(".")
    if len(parts) != 4:
        return False
    try:
        octets = [int(p) for p in parts]
    except ValueError:
        return False
    if octets[0] == 10:
        return True
    if octets[0] == 172 and 16 <= octets[1] <= 31:
        return True
    if octets[0] == 192 and octets[1] == 168:
        return True
    if octets[0] == 100 and 64 <= octets[1] <= 127:
        return True
    return False


def collect_deployment_warnings() -> list[dict[str, Any]]:
    """Non-secret deployment posture warnings for operators."""
    warnings: list[dict[str, Any]] = []

    if not _env_truthy("AUTH_ENABLED", "true"):
        warnings.append({
            "code": "auth_disabled",
            "severity": "critical",
            "message": (
                "AUTH_ENABLED is false. Keep authentication enabled for legacy local console "
                "on private/mobile access."
            ),
        })

    if _env_truthy("LOCALHOST_BYPASS"):
        warnings.append({
            "code": "localhost_bypass_enabled",
            "severity": "critical",
            "message": (
                "LOCALHOST_BYPASS is enabled. Disable outside local-only development."
            ),
        })

    bind = _bind_address()
    if bind in ("0.0.0.0", "::", "[::]"):
        warnings.append({
            "code": "bind_all_interfaces",
            "severity": "high",
            "message": (
                f"Server bind address is {bind}. Prefer 127.0.0.1 and access via "
                "Tailscale or a reverse proxy with auth — do not expose raw ports publicly."
            ),
        })

    if not is_console_mode():
        warnings.append({
            "code": "console_mode_off",
            "severity": "info",
            "message": (
                "NEXUS_CONSOLE_MODE is off. Dedicated Nexus Mac deployments should "
                "set NEXUS_CONSOLE_MODE=true."
            ),
        })

    core_url = get_core_base_url()
    if core_url:
        if not get_gateway_secret():
            warnings.append({
                "code": "gateway_secret_missing",
                "severity": "high",
                "message": (
                    "NEXUS_CORE_URL is set but NEXUS_GATEWAY_SHARED_SECRET is missing. "
                    "Configure a shared secret for Gateway→Core requests."
                ),
            })
        host = urlparse(core_url).hostname
        if host and not _is_private_lan_host(host):
            warnings.append({
                "code": "core_url_public_or_unknown",
                "severity": "high",
                "message": (
                    "NEXUS_CORE_URL does not appear to be loopback or private LAN/Tailscale. "
                    "Do not expose Nexus Core on the public internet."
                ),
            })

    if _env_truthy("ODYSSEUS_INPROCESS_TASKS", "1") and not is_console_mode():
        warnings.append({
            "code": "inprocess_tasks_enabled",
            "severity": "info",
            "message": (
                "In-process scheduled tasks are enabled. Use NEXUS_CONSOLE_MODE=true "
                "or ODYSSEUS_INPROCESS_TASKS=0 on the legacy local console host."
            ),
        })

    if is_console_mode():
        runtime = validate_hermes_runtime()
        if not runtime.get("validation_ok"):
            warnings.append({
                "code": "embedded_hermes_runtime_invalid",
                "severity": "high",
                "message": (
                    "Embedded Hermes runtime under Nexus System is missing or incomplete. "
                    f"Expected HERMES_HOME at {runtime.get('hermes_home')}. "
                    "Console relays to Nexus Core; Core requires the embedded venv Hermes CLI."
                ),
            })

    return warnings
