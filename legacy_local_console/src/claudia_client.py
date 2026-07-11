"""Thin HTTP client for Nexus Core — Gateway intake/health forwarding only.

This module must not import agent_loop, task_scheduler, MCP, shell, or any
Odysseus autonomous runtime. It only forwards packets to Nexus Core when configured.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, AsyncGenerator
from urllib.parse import urlparse

import httpx

logger = logging.getLogger(__name__)

ENV_CORE_URL = "NEXUS_CORE_URL"
ENV_GATEWAY_SECRET = "NEXUS_GATEWAY_SHARED_SECRET"
GATEWAY_SECRET_HEADER = "X-Nexus-Gateway-Secret"
DEFAULT_TIMEOUT_S = 5.0


def get_core_base_url() -> str | None:
    """Normalized Nexus Core base URL, or None if unset."""
    raw = os.environ.get(ENV_CORE_URL, "").strip()
    if not raw:
        return None
    return raw.rstrip("/")


def get_gateway_secret() -> str | None:
    raw = os.environ.get(ENV_GATEWAY_SECRET, "").strip()
    return raw or None


def is_core_configured() -> bool:
    return get_core_base_url() is not None


def sanitize_core_url(base: str | None = None) -> str | None:
    """Return host[:port] for Gateway responses; never include credentials."""
    raw = (base or get_core_base_url() or "").strip()
    if not raw:
        return None
    parsed = urlparse(raw)
    host = parsed.hostname or ""
    if not host:
        return raw.rstrip("/")
    if parsed.port:
        return f"{host}:{parsed.port}"
    return host


def _forward_headers() -> dict[str, str]:
    headers: dict[str, str] = {"Content-Type": "application/json"}
    secret = get_gateway_secret()
    if secret:
        headers[GATEWAY_SECRET_HEADER] = secret
    return headers


def gateway_envelope(
    *,
    ok: bool,
    status: str,
    message: str,
    packet_id: str | None = None,
    trace_id: str | None = None,
    core_configured: bool | None = None,
    forwarded: bool = False,
    core_status: str | None = None,
    core_body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Minimum safe Gateway response shape for health and intake."""
    out: dict[str, Any] = {
        "ok": ok,
        "status": status,
        "message": message,
        "packet_id": packet_id,
        "trace_id": trace_id,
        "core_configured": is_core_configured() if core_configured is None else core_configured,
        "forwarded": forwarded,
    }
    if core_status is not None:
        out["core_status"] = core_status
    if core_body is not None:
        out["core"] = core_body
    return out


async def probe_core_health() -> tuple[bool, str | None, dict[str, Any] | None]:
    """GET {NEXUS_CORE_URL}/health. Returns (reachable, error_message, core_json)."""
    base = get_core_base_url()
    if not base:
        return False, "core_not_configured", None
    url = f"{base}/health"
    try:
        async with httpx.AsyncClient(
            timeout=DEFAULT_TIMEOUT_S, follow_redirects=False, trust_env=False
        ) as client:
            resp = await client.get(url, headers=_forward_headers())
        if resp.status_code >= 400:
            return False, f"core_health_http_{resp.status_code}", None
        try:
            body = resp.json()
            if not isinstance(body, dict):
                body = {"raw": body}
        except Exception:
            body = {"raw": resp.text[:500]}
        return True, None, body
    except httpx.TimeoutException:
        logger.info("Nexus Core health probe timed out")
        return False, "core_timeout", None
    except httpx.RequestError as exc:
        logger.info("Nexus Core health probe failed: %s", type(exc).__name__)
        return False, "core_unreachable", None


async def _forward_post_to_core(
    path: str,
    packet: dict[str, Any],
    *,
    success_message: str,
    unconfigured_message: str,
) -> dict[str, Any]:
    """POST normalized packet to ``{NEXUS_CORE_URL}{path}``; never executes locally."""
    trace_id = packet.get("trace_id")
    packet_id = packet.get("packet_id")

    base = get_core_base_url()
    if not base:
        return gateway_envelope(
            ok=False,
            status="core_not_configured",
            message=unconfigured_message,
            packet_id=packet_id,
            trace_id=trace_id,
            core_configured=False,
            forwarded=False,
        )

    url = f"{base}{path}"
    try:
        async with httpx.AsyncClient(
            timeout=DEFAULT_TIMEOUT_S, follow_redirects=False, trust_env=False
        ) as client:
            resp = await client.post(url, json=packet, headers=_forward_headers())
    except httpx.TimeoutException:
        return gateway_envelope(
            ok=False,
            status="core_timeout",
            message="Nexus Core did not respond in time; no local execution occurred.",
            packet_id=packet_id,
            trace_id=trace_id,
            core_configured=True,
            forwarded=False,
        )
    except httpx.RequestError:
        return gateway_envelope(
            ok=False,
            status="core_unreachable",
            message="Nexus Core is unreachable; no local execution occurred.",
            packet_id=packet_id,
            trace_id=trace_id,
            core_configured=True,
            forwarded=False,
        )

    core_body: dict[str, Any] | None
    try:
        parsed = resp.json()
        core_body = parsed if isinstance(parsed, dict) else {"raw": parsed}
    except Exception:
        core_body = {"raw": resp.text[:500]}

    if resp.status_code >= 400:
        return gateway_envelope(
            ok=False,
            status="core_error",
            message=(
                f"Nexus Core returned HTTP {resp.status_code} on {path}; "
                "no local execution occurred."
            ),
            packet_id=packet_id,
            trace_id=trace_id,
            core_configured=True,
            forwarded=True,
            core_status=str(resp.status_code),
            core_body=core_body,
        )

    core_ok = core_body.get("ok") if isinstance(core_body.get("ok"), bool) else True
    return gateway_envelope(
        ok=core_ok,
        status="forwarded",
        message=success_message,
        packet_id=core_body.get("packet_id", packet_id) if core_body else packet_id,
        trace_id=core_body.get("trace_id", trace_id) if core_body else trace_id,
        core_configured=True,
        forwarded=True,
        core_status=str(resp.status_code),
        core_body=core_body,
    )


async def forward_intake(packet: dict[str, Any]) -> dict[str, Any]:
    """POST normalized packet JSON to {NEXUS_CORE_URL}/intake."""
    return await _forward_post_to_core(
        "/intake",
        packet,
        success_message="Intake forwarded to Nexus Core.",
        unconfigured_message=(
            "Nexus Core URL is not configured; intake was accepted by the "
            "Gateway but not forwarded or executed locally."
        ),
    )


async def _forward_with_intake_fallback(
    primary_path: str,
    packet: dict[str, Any],
    *,
    success_message: str,
    unconfigured_message: str,
    forward_path_key: str,
) -> dict[str, Any]:
    """POST to a Core path; on HTTP 404, retry ``/intake`` (documented, non-authoritative)."""
    primary = await _forward_post_to_core(
        primary_path,
        packet,
        success_message=success_message,
        unconfigured_message=unconfigured_message,
    )
    if (
        primary.get("core_configured")
        and primary.get("status") == "core_error"
        and primary.get("core_status") == "404"
    ):
        fallback = await _forward_post_to_core(
            "/intake",
            packet,
            success_message=(
                f"Packet forwarded to Nexus Core via /intake "
                f"(POST {primary_path} returned 404)."
            ),
            unconfigured_message=primary.get("message", ""),
        )
        fallback[forward_path_key] = "intake_fallback"
        return fallback
    primary[forward_path_key] = primary_path.lstrip("/")
    return primary


async def forward_message(packet: dict[str, Any]) -> dict[str, Any]:
    """POST message packet to Core ``/messages``, with documented ``/intake`` fallback on 404."""
    return await _forward_with_intake_fallback(
        "/messages",
        packet,
        success_message="Message forwarded to Nexus Core.",
        unconfigured_message=(
            "Nexus Core URL is not configured; message was accepted by the "
            "Gateway but not forwarded or executed locally."
        ),
        forward_path_key="message_path",
    )


async def forward_source_packet(packet: dict[str, Any]) -> dict[str, Any]:
    """POST source packet to Core ``/source-packets``, with ``/intake`` fallback on 404."""
    return await _forward_with_intake_fallback(
        "/source-packets",
        packet,
        success_message="Source packet forwarded to Nexus Core.",
        unconfigured_message=(
            "Nexus Core URL is not configured; source packet was accepted by the "
            "Gateway but not forwarded or executed locally."
        ),
        forward_path_key="source_path",
    )


async def forward_worker_output(packet: dict[str, Any]) -> dict[str, Any]:
    """POST worker output to Core ``/worker-outputs``, with ``/intake`` fallback on 404."""
    return await _forward_with_intake_fallback(
        "/worker-outputs",
        packet,
        success_message="Worker output forwarded to Nexus Core.",
        unconfigured_message=(
            "Nexus Core URL is not configured; worker output was accepted by the "
            "Gateway but not forwarded or executed locally."
        ),
        forward_path_key="worker_output_path",
    )


def gateway_packets_list_placeholder() -> dict[str, Any]:
    """Safe packet list when Core is not configured (Gateway is not source of truth)."""
    configured = is_core_configured()
    return gateway_envelope(
        ok=True,
        status="core_not_configured" if not configured else "persistence_not_implemented",
        message=(
            "Nexus Core URL is not configured; packet list is a Gateway placeholder."
            if not configured
            else (
                "Nexus Gateway local packet persistence is not implemented. "
                "This listing is not a source of truth."
            )
        ),
        packet_id=None,
        trace_id=None,
        core_configured=configured,
        forwarded=False,
    ) | {
        "packets": [],
        "items": [],
        "persistence": False,
        "count": 0,
        "source": "gateway_placeholder",
    }


def gateway_read_placeholder(
    surface: str,
    *,
    message: str | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Honest read-only placeholder for Console dashboard surfaces (non-canonical)."""
    out: dict[str, Any] = gateway_envelope(
        ok=True,
        status="placeholder",
        message=message
        or (
            f"Nexus Gateway read surface '{surface}' is a placeholder; "
            "not implemented or not connected to Nexus Core yet."
        ),
        packet_id=None,
        trace_id=None,
        core_configured=is_core_configured(),
        forwarded=False,
    )
    out.update(
        {
            "surface": surface,
            "items": [],
            "count": 0,
            "read_only": True,
            "persistence": False,
        }
    )
    if extra:
        out.update(extra)
    return out


def gateway_packet_detail_placeholder(packet_id: str) -> dict[str, Any]:
    """Safe packet detail when Core is not configured."""
    pid = (packet_id or "").strip()
    configured = is_core_configured()
    return gateway_envelope(
        ok=True,
        status="core_not_configured" if not configured else "persistence_not_implemented",
        message=(
            "Nexus Core URL is not configured; packet detail is a Gateway placeholder."
            if not configured
            else (
                "Nexus Gateway does not store packets locally; packet detail is not "
                "available unless Nexus Core exposes it."
            )
        ),
        packet_id=pid or None,
        trace_id=None,
        core_configured=configured,
        forwarded=False,
    ) | {
        "packet": None,
        "persistence": False,
        "source": "gateway_placeholder",
    }


async def list_packets() -> dict[str, Any]:
    """GET Core ``/tasks`` and map to Gateway ``/packets`` list shape."""
    if not is_core_configured():
        return gateway_packets_list_placeholder()

    result = await _forward_get_to_core("/tasks")
    core_url = sanitize_core_url()

    if result.get("status") == "core_unreachable":
        return gateway_envelope(
            ok=False,
            status="core_unreachable",
            message=result.get(
                "message",
                "Nexus Core is unreachable; packet list is unavailable.",
            ),
            packet_id=None,
            trace_id=None,
            core_configured=True,
            forwarded=False,
        ) | {
            "packets": [],
            "items": [],
            "count": 0,
            "source": "nexus_core",
            "core_url": core_url,
        }

    if result.get("status") == "core_timeout":
        return gateway_envelope(
            ok=False,
            status="core_timeout",
            message=result.get(
                "message",
                "Nexus Core did not respond in time; packet list is unavailable.",
            ),
            packet_id=None,
            trace_id=None,
            core_configured=True,
            forwarded=False,
        ) | {
            "packets": [],
            "items": [],
            "count": 0,
            "source": "nexus_core",
            "core_url": core_url,
        }

    if not result.get("forwarded") or not result.get("ok"):
        return gateway_envelope(
            ok=False,
            status=result.get("status", "core_error"),
            message=result.get(
                "message",
                "Nexus Core packet list is unavailable; no local execution occurred.",
            ),
            packet_id=None,
            trace_id=None,
            core_configured=True,
            forwarded=bool(result.get("forwarded")),
            core_status=result.get("core_status"),
        ) | {
            "packets": [],
            "items": [],
            "count": 0,
            "source": "nexus_core",
            "core_url": core_url,
        }

    tasks = result.get("tasks") or []
    if not isinstance(tasks, list):
        tasks = []
    count = result.get("count")
    if not isinstance(count, int):
        count = len(tasks)

    return gateway_envelope(
        ok=True,
        status="ok",
        message="Packet list read from Nexus Core intake ledger.",
        packet_id=None,
        trace_id=None,
        core_configured=True,
        forwarded=True,
        core_status=result.get("core_status"),
    ) | {
        "packets": tasks,
        "items": tasks,
        "count": count,
        "source": "nexus_core",
        "core_url": core_url,
        "read_only": True,
        "persistence": True,
    }


async def get_packet_detail(packet_id: str) -> dict[str, Any]:
    """GET Core ``/tasks/{packet_id}`` and map to Gateway ``/packets/{packet_id}``."""
    pid = (packet_id or "").strip()
    if not pid:
        return gateway_envelope(
            ok=False,
            status="validation_error",
            message="packet_id is required",
            packet_id=None,
            trace_id=None,
            core_configured=is_core_configured(),
            forwarded=False,
        ) | {"packet": None, "source": "gateway"}

    if not is_core_configured():
        return gateway_packet_detail_placeholder(pid)

    result = await _forward_get_to_core(f"/tasks/{pid}")
    core_url = sanitize_core_url()

    if result.get("core_status") == "404":
        return {
            "ok": False,
            "status": "not_found",
            "error": "not_found",
            "message": "Packet not found.",
            "packet_id": pid,
            "packet": None,
            "core_configured": True,
            "forwarded": True,
            "source": "nexus_core",
            "core_url": core_url,
        }

    if result.get("status") in ("core_unreachable", "core_timeout"):
        return gateway_envelope(
            ok=False,
            status=result.get("status", "core_unreachable"),
            message=result.get(
                "message",
                "Nexus Core is unavailable; packet detail is not available locally.",
            ),
            packet_id=pid,
            trace_id=None,
            core_configured=True,
            forwarded=False,
        ) | {
            "packet": None,
            "source": "nexus_core",
            "core_url": core_url,
        }

    if not result.get("forwarded") or not result.get("ok"):
        return gateway_envelope(
            ok=False,
            status=result.get("status", "core_error"),
            message=result.get(
                "message",
                "Nexus Core packet detail is unavailable; no local execution occurred.",
            ),
            packet_id=pid,
            trace_id=None,
            core_configured=True,
            forwarded=bool(result.get("forwarded")),
            core_status=result.get("core_status"),
        ) | {
            "packet": None,
            "source": "nexus_core",
            "core_url": core_url,
        }

    task = result.get("task")
    return gateway_envelope(
        ok=True,
        status="ok",
        message="Packet detail read from Nexus Core intake ledger.",
        packet_id=pid,
        trace_id=task.get("trace_id") if isinstance(task, dict) else None,
        core_configured=True,
        forwarded=True,
        core_status=result.get("core_status"),
    ) | {
        "packet": task,
        "task": task,
        "source": "nexus_core",
        "core_url": core_url,
        "read_only": True,
        "persistence": True,
    }


async def _forward_get_to_core(path: str) -> dict[str, Any]:
    """GET from Nexus Core; never executes locally."""
    base = get_core_base_url()
    if not base:
        return gateway_envelope(
            ok=False,
            status="core_not_configured",
            message="Nexus Core URL is not configured; no local execution occurred.",
            packet_id=None,
            trace_id=None,
            core_configured=False,
            forwarded=False,
        )

    url = f"{base}{path}"
    try:
        async with httpx.AsyncClient(
            timeout=DEFAULT_TIMEOUT_S, follow_redirects=False, trust_env=False
        ) as client:
            resp = await client.get(url, headers=_forward_headers())
    except httpx.TimeoutException:
        return gateway_envelope(
            ok=False,
            status="core_timeout",
            message="Nexus Core did not respond in time; no local execution occurred.",
            packet_id=None,
            trace_id=None,
            core_configured=True,
            forwarded=False,
        )
    except httpx.RequestError:
        return gateway_envelope(
            ok=False,
            status="core_unreachable",
            message="Nexus Core is unreachable; no local execution occurred.",
            packet_id=None,
            trace_id=None,
            core_configured=True,
            forwarded=False,
        )

    core_body: dict[str, Any] | None
    try:
        parsed = resp.json()
        core_body = parsed if isinstance(parsed, dict) else {"raw": parsed}
    except Exception:
        core_body = {"raw": resp.text[:500]}

    if resp.status_code >= 400:
        return gateway_envelope(
            ok=False,
            status="core_error",
            message=(
                f"Nexus Core returned HTTP {resp.status_code} on GET {path}; "
                "no local execution occurred."
            ),
            packet_id=None,
            trace_id=None,
            core_configured=True,
            forwarded=True,
            core_status=str(resp.status_code),
            core_body=core_body,
        )

    out = gateway_envelope(
        ok=True,
        status="forwarded",
        message="Read forwarded from Nexus Core.",
        packet_id=None,
        trace_id=None,
        core_configured=True,
        forwarded=True,
        core_status=str(resp.status_code),
        core_body=core_body,
    )
    if isinstance(core_body, dict):
        out.update({k: v for k, v in core_body.items() if k not in out})
    return out


async def list_approvals() -> dict[str, Any]:
    """GET Core ``/approvals`` when configured; otherwise honest Gateway placeholder."""
    if not is_core_configured():
        return gateway_read_placeholder(
            "approvals",
            message=(
                "Nexus Core is not configured; approval queue is not available "
                "and nothing was executed locally."
            ),
            extra={"pending_count": 0, "approvals": []},
        )

    result = await _forward_get_to_core("/approvals")
    if result.get("forwarded") and result.get("ok"):
        items = result.get("items") or result.get("approvals") or []
        if isinstance(items, list):
            pending = result.get("pending_count")
            if pending is None:
                pending = len(items)
            result.setdefault("surface", "approvals")
            result.setdefault("read_only", True)
            result["items"] = items
            result["approvals"] = items
            result["pending_count"] = pending
            result["count"] = len(items)
        return result

    placeholder = gateway_read_placeholder(
        "approvals",
        message=(
            "Nexus Core approvals list is unavailable; showing Gateway placeholder. "
            "No local execution occurred."
        ),
        extra={"pending_count": 0, "approvals": []},
    )
    placeholder["core_status"] = result.get("status")
    return placeholder


def _merge_core_model_config_payload(result: dict[str, Any]) -> dict[str, Any]:
    """Promote Core ``/model-config`` JSON to top level; Gateway never reads Hermes YAML."""
    core_body = result.get("core_body") or result.get("core")
    if isinstance(core_body, dict):
        out: dict[str, Any] = dict(core_body)
    else:
        out = dict(result)
    out["core_configured"] = result.get("core_configured", is_core_configured())
    out["forwarded"] = result.get("forwarded", False)
    if result.get("core_status") is not None:
        out["core_status"] = result.get("core_status")
    core_url = sanitize_core_url()
    if core_url:
        out["core_url"] = core_url
    out.setdefault("available_models", out.get("available_models") or [])
    return out


async def get_model_config() -> dict[str, Any]:
    """GET Core ``/model-config``; never reads local Hermes config or calls Hermes."""
    if not is_core_configured():
        return {
            "ok": False,
            "status": "core_not_configured",
            "message": (
                "Nexus Core URL is not configured; model config is unavailable from Gateway."
            ),
            "core_configured": False,
            "forwarded": False,
            "model": None,
            "available_models": [],
            "source": "gateway",
        }

    result = await _forward_get_to_core("/model-config")
    if result.get("status") in ("core_unreachable", "core_timeout"):
        return {
            "ok": False,
            "status": result.get("status"),
            "message": result.get(
                "message",
                "Nexus Core model config is unreachable; no local config was read.",
            ),
            "core_configured": True,
            "forwarded": False,
            "model": None,
            "available_models": [],
            "source": "gateway",
            "core_url": sanitize_core_url(),
        }

    if result.get("status") == "core_error" or not result.get("forwarded"):
        return {
            "ok": False,
            "status": result.get("status", "core_error"),
            "message": result.get(
                "message",
                "Nexus Core model config is unavailable; no local config was read.",
            ),
            "core_configured": True,
            "forwarded": bool(result.get("forwarded")),
            "model": None,
            "available_models": [],
            "source": "gateway",
            "core_url": sanitize_core_url(),
            "core_status": result.get("core_status"),
        }

    return _merge_core_model_config_payload(result)


async def update_model_config(model_id: str) -> dict[str, Any]:
    """POST Core ``/model-config``; Gateway does not write Hermes YAML or invoke models."""
    mid = (model_id or "").strip()
    if not mid:
        return gateway_envelope(
            ok=False,
            status="validation_error",
            message="model is required",
            packet_id=None,
            trace_id=None,
            core_configured=is_core_configured(),
            forwarded=False,
        )

    result = await _forward_post_to_core(
        "/model-config",
        {"model": mid},
        success_message="Model configuration forwarded to Nexus Core.",
        unconfigured_message=(
            "Nexus Core URL is not configured; Hermes model was not changed by Gateway."
        ),
    )
    return _merge_core_model_config_payload(result)


async def resolve_approval(approval_id: str, resolution: dict[str, Any]) -> dict[str, Any]:
    """POST human approval resolution to Core; does not perform approved action locally."""
    aid = (approval_id or "").strip()
    path = f"/approvals/{aid}/resolve"
    return await _forward_post_to_core(
        path,
        resolution,
        success_message="Approval resolution forwarded to Nexus Core.",
        unconfigured_message=(
            "Nexus Core URL is not configured; approval was not resolved or "
            "executed locally."
        ),
    )


async def stream_packet_events(packet_id: str) -> AsyncGenerator[str, None]:
    """SSE for ``GET /api/nexus/v1/stream/{packet_id}`` — placeholder until Core streams exist."""
    base = get_core_base_url()
    placeholder = {
        "type": "nexus_stream_placeholder",
        "packet_id": packet_id,
        "status": "pending" if base else "core_not_configured",
        "message": (
            "Nexus Core event stream is not available yet; no local agent output was generated."
            if base
            else "Nexus Core is not configured; no local agent output was generated."
        ),
        "core_configured": bool(base),
        "forwarded": False,
    }
    yield f"data: {json.dumps(placeholder)}\n\n"
    yield "data: [DONE]\n\n"


def _merge_core_cli_response(result: dict[str, Any], *, surface: str) -> dict[str, Any]:
    out = dict(result)
    out["surface"] = surface
    out["core_url"] = sanitize_core_url()
    core_body = result.get("core_body") or result.get("core")
    if isinstance(core_body, dict):
        for key, value in core_body.items():
            if key not in out:
                out[key] = value
    return out


async def cli_list_sessions() -> dict[str, Any]:
    """GET Core ``/hermes/sessions`` for CLI Mirror relay."""
    result = await _forward_get_to_core("/hermes/sessions")
    return _merge_core_cli_response(result, surface="cli_sessions")


async def cli_start_session(body: dict[str, Any]) -> dict[str, Any]:
    """POST Core ``/hermes/sessions`` — start Hermes PTY session."""
    result = await _forward_post_to_core(
        "/hermes/sessions",
        body if isinstance(body, dict) else {},
        success_message="CLI session start forwarded to Nexus Core.",
        unconfigured_message=(
            "Nexus Core URL is not configured; CLI session was not started locally."
        ),
    )
    return _merge_core_cli_response(result, surface="cli_session")


async def cli_get_session(session_id: str) -> dict[str, Any]:
    sid = (session_id or "").strip()
    result = await _forward_get_to_core(f"/hermes/sessions/{sid}")
    return _merge_core_cli_response(result, surface="cli_session")


async def cli_send_input(session_id: str, text: str) -> dict[str, Any]:
    sid = (session_id or "").strip()
    result = await _forward_post_to_core(
        f"/hermes/sessions/{sid}/input",
        {"text": text},
        success_message="CLI input forwarded to Nexus Core.",
        unconfigured_message=(
            "Nexus Core URL is not configured; CLI input was not sent locally."
        ),
    )
    return _merge_core_cli_response(result, surface="cli_input")


async def cli_get_transcript(
    session_id: str,
    *,
    limit: int = 200,
    before_seq: int | None = None,
    after_seq: int | None = None,
) -> dict[str, Any]:
    sid = (session_id or "").strip()
    lim = min(max(limit, 1), 500)
    query = f"limit={lim}"
    if before_seq is not None:
        query += f"&before_seq={max(0, int(before_seq))}"
    if after_seq is not None:
        query += f"&after_seq={max(0, int(after_seq))}"
    result = await _forward_get_to_core(f"/hermes/sessions/{sid}/transcript?{query}")
    return _merge_core_cli_response(result, surface="cli_transcript")


async def cli_stop_session(session_id: str) -> dict[str, Any]:
    sid = (session_id or "").strip()
    result = await _forward_post_to_core(
        f"/hermes/sessions/{sid}/stop",
        {},
        success_message="CLI session stop forwarded to Nexus Core.",
        unconfigured_message=(
            "Nexus Core URL is not configured; CLI session was not stopped locally."
        ),
    )
    return _merge_core_cli_response(result, surface="cli_session")


async def cli_interrupt_session(session_id: str) -> dict[str, Any]:
    sid = (session_id or "").strip()
    result = await _forward_post_to_core(
        f"/hermes/sessions/{sid}/interrupt",
        {},
        success_message="CLI session interrupt forwarded to Nexus Core.",
        unconfigured_message=(
            "Nexus Core URL is not configured; CLI interrupt was not sent locally."
        ),
    )
    return _merge_core_cli_response(result, surface="cli_interrupt")


async def relay_cli_session_stream(
    session_id: str,
    *,
    after_seq: int = 0,
) -> AsyncGenerator[str, None]:
    """Relay Core ``GET /hermes/sessions/{id}/stream`` SSE to Console clients."""
    sid = (session_id or "").strip()
    base = get_core_base_url()
    if not base:
        payload = {
            "type": "error",
            "status": "core_not_configured",
            "message": "Nexus Core is not configured; CLI stream relay unavailable.",
            "session_id": sid,
            "core_configured": False,
            "forwarded": False,
        }
        yield f"event: error\ndata: {json.dumps(payload)}\n\n"
        return

    url = f"{base}/hermes/sessions/{sid}/stream"
    if after_seq > 0:
        url = f"{url}?after_seq={after_seq}"

    headers = _forward_headers()
    # Drop JSON content-type for SSE GET relay.
    headers.pop("Content-Type", None)

    timeout = httpx.Timeout(connect=5.0, read=300.0, write=5.0, pool=5.0)
    try:
        async with httpx.AsyncClient(
            timeout=timeout, follow_redirects=False, trust_env=False
        ) as client:
            async with client.stream("GET", url, headers=headers) as resp:
                if resp.status_code >= 400:
                    try:
                        detail = resp.json()
                    except Exception:
                        detail = {"raw": (await resp.aread())[:500].decode("utf-8", errors="replace")}
                    payload = {
                        "type": "error",
                        "status": "core_error",
                        "core_status": str(resp.status_code),
                        "message": f"Nexus Core stream returned HTTP {resp.status_code}.",
                        "session_id": sid,
                        "detail": detail,
                        "forwarded": True,
                    }
                    yield f"event: error\ndata: {json.dumps(payload)}\n\n"
                    return
                async for chunk in resp.aiter_text():
                    if chunk:
                        yield chunk
    except httpx.TimeoutException:
        payload = {
            "type": "error",
            "status": "core_timeout",
            "message": "Nexus Core stream timed out.",
            "session_id": sid,
        }
        yield f"event: error\ndata: {json.dumps(payload)}\n\n"
    except httpx.RequestError:
        payload = {
            "type": "error",
            "status": "core_unreachable",
            "message": "Nexus Core stream is unreachable.",
            "session_id": sid,
        }
        yield f"event: error\ndata: {json.dumps(payload)}\n\n"
