"""legacy local console Mode guards for external connector writes (Package 11).

Blocks direct email send and external calendar writeback when Console Mode is on.
Does not block read/list surfaces or internal date/time metadata parsing.
"""

from __future__ import annotations

from typing import Any

from src.console_mode import is_console_mode

CORE_ROUTING_GUIDANCE = (
    "Route connector write requests through Nexus Core approval and governance. "
    "Use Nexus Gateway packets (intake, messages, source packets) for intake."
)


def connector_write_disabled(
    connector: str,
    operation: str,
    *,
    message: str | None = None,
) -> dict[str, Any]:
    """Structured response when external connector writes are disabled."""
    return {
        "ok": False,
        "success": False,
        "status": "connector_write_disabled",
        "console_mode": True,
        "connector": connector,
        "operation": operation,
        "message": message
        or (
            "legacy local console Mode is active. Direct connector writes are disabled. "
            "Route this request through Nexus Core approval/governance."
        ),
        "guidance": CORE_ROUTING_GUIDANCE,
    }


def block_connector_write(connector: str, operation: str) -> dict[str, Any] | None:
    """Return a blocked-response dict in Console Mode, else None."""
    if not is_console_mode():
        return None
    return connector_write_disabled(connector, operation)
