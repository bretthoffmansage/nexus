"""Nexus Gateway API — non-authoritative intake/routing layer (/api/nexus/v1).

Does not invoke Odysseus agent_loop, task scheduler, MCP, shell, or local models.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from src.auth_helpers import effective_user
from src.nexus_approvals import ApprovalValidationError, build_approval_resolution
from src.nexus_client import (
    cli_get_session,
    cli_get_transcript,
    cli_interrupt_session,
    cli_list_sessions,
    cli_send_input,
    cli_start_session,
    cli_stop_session,
    forward_intake,
    forward_message,
    forward_source_packet,
    forward_worker_output,
    gateway_envelope,
    get_packet_detail,
    gateway_read_placeholder,
    is_core_configured,
    list_approvals,
    list_packets,
    probe_core_health,
    relay_cli_session_stream,
    resolve_approval,
    stream_packet_events,
    get_model_config,
    update_model_config,
)
from src.nexus_packets import (
    PacketNormalizeError,
    create_chat_message_packet,
    normalize_nexus_packet,
    normalize_source_packet,
    normalize_worker_output_packet,
)
from src.nexus_scopes import (
    authorize_nexus_admin,
    authorize_nexus_intake,
    authorize_nexus_read,
    authorize_nexus_worker,
)
from src.nexus_deployment_posture import collect_deployment_warnings
from src.console_mode import is_console_mode
from src.hermes_runtime import hermes_runtime_status

logger = logging.getLogger(__name__)


def setup_nexus_routes() -> APIRouter:
    router = APIRouter(prefix="/api/nexus/v1", tags=["nexus-gateway"])

    @router.get("/health")
    async def nexus_gateway_health():
        """Gateway liveness; optionally probes Nexus Core /health."""
        console_mode = is_console_mode()

        def _enrich_health(payload: dict) -> dict:
            payload["console_mode"] = console_mode
            payload["deployment_warnings"] = collect_deployment_warnings()
            payload["hermes_runtime"] = hermes_runtime_status()
            return payload

        if not is_core_configured():
            return _enrich_health(gateway_envelope(
                ok=True,
                status="gateway_ok",
                message="Nexus Gateway is operational; Nexus Core is not configured.",
                packet_id=None,
                trace_id=None,
                core_configured=False,
                forwarded=False,
            ))

        reachable, err, core_body = await probe_core_health()
        if reachable:
            return _enrich_health(gateway_envelope(
                ok=True,
                status="gateway_ok",
                message="Nexus Gateway is operational; Nexus Core health check succeeded.",
                packet_id=None,
                trace_id=None,
                core_configured=True,
                forwarded=True,
                core_status="ok",
                core_body=core_body,
            ))

        return _enrich_health(gateway_envelope(
            ok=True,
            status="gateway_ok",
            message=(
                "Nexus Gateway is operational; Nexus Core is configured but "
                f"not reachable ({err})."
            ),
            packet_id=None,
            trace_id=None,
            core_configured=True,
            forwarded=False,
            core_status=err,
            core_body=core_body,
        ))

    @router.post("/intake")
    async def nexus_gateway_intake(request: Request):
        """Accept a packet-like JSON object and forward to Nexus Core when configured."""
        authorize_nexus_intake(request)
        try:
            body = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="Request body must be valid JSON")

        if not isinstance(body, dict):
            raise HTTPException(
                status_code=400,
                detail="Request body must be a JSON object (packet-like payload)",
            )

        try:
            actor = effective_user(request) or None
            packet = normalize_nexus_packet(body, created_by=actor)
        except PacketNormalizeError as exc:
            detail: dict[str, str] = {
                "status": "validation_error",
                "message": str(exc),
            }
            if exc.field:
                detail["field"] = exc.field
            raise HTTPException(status_code=422, detail=detail) from exc

        result = await forward_intake(packet)
        # Gateway never executes locally; 200 for accepted/handled-by-gateway paths.
        return result

    @router.post("/messages")
    async def nexus_gateway_messages(request: Request):
        """Accept a message packet and forward to Nexus Core ``/messages``."""
        authorize_nexus_intake(request)
        try:
            body = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="Request body must be valid JSON")
        if not isinstance(body, dict):
            raise HTTPException(
                status_code=400,
                detail="Request body must be a JSON object",
            )
        try:
            actor = effective_user(request) or None
            if body.get("type") == "message" or "message" in (
                body.get("payload") or {}
                if isinstance(body.get("payload"), dict)
                else {}
            ):
                msg_text = None
                if isinstance(body.get("payload"), dict):
                    msg_text = body["payload"].get("message")
                if msg_text is None and isinstance(body.get("message"), str):
                    msg_text = body["message"]
                session_id = None
                if isinstance(body.get("reply_channel"), dict):
                    session_id = body["reply_channel"].get("session_id")
                if session_id is None and isinstance(body.get("payload"), dict):
                    session_id = body["payload"].get("session_id")
                if msg_text is not None:
                    packet = create_chat_message_packet(
                        str(msg_text),
                        session_id=str(session_id) if session_id else None,
                        created_by=actor,
                        packet_id=body.get("packet_id"),
                        trace_id=body.get("trace_id"),
                    )
                else:
                    body.setdefault("type", "message")
                    packet = normalize_nexus_packet(body, created_by=actor)
            else:
                body["type"] = body.get("type") or "message"
                packet = normalize_nexus_packet(body, created_by=actor)
        except PacketNormalizeError as exc:
            detail: dict[str, str] = {"status": "validation_error", "message": str(exc)}
            if exc.field:
                detail["field"] = exc.field
            raise HTTPException(status_code=422, detail=detail) from exc

        return await forward_message(packet)

    @router.get("/stream/{packet_id}")
    async def nexus_gateway_stream(packet_id: str, request: Request):
        """SSE placeholder/relay for a Nexus message packet (no local agent execution)."""
        authorize_nexus_read(request)
        pid = (packet_id or "").strip()
        if not pid:
            raise HTTPException(status_code=400, detail="packet_id is required")
        return StreamingResponse(
            stream_packet_events(pid),
            media_type="text/event-stream",
        )

    @router.post("/sources")
    async def nexus_gateway_sources(request: Request):
        """Accept a source packet and forward to Nexus Core ``/source-packets``."""
        authorize_nexus_intake(request)
        try:
            body = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="Request body must be valid JSON")
        if not isinstance(body, dict):
            raise HTTPException(status_code=400, detail="Request body must be a JSON object")
        try:
            actor = effective_user(request) or None
            packet = normalize_source_packet(body, created_by=actor)
        except PacketNormalizeError as exc:
            detail: dict[str, str] = {"status": "validation_error", "message": str(exc)}
            if exc.field:
                detail["field"] = exc.field
            raise HTTPException(status_code=422, detail=detail) from exc
        return await forward_source_packet(packet)

    @router.post("/worker-output")
    async def nexus_gateway_worker_output(request: Request):
        """Accept worker output and forward to Nexus Core ``/worker-outputs``."""
        authorize_nexus_worker(request)
        try:
            body = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="Request body must be valid JSON")
        if not isinstance(body, dict):
            raise HTTPException(status_code=400, detail="Request body must be a JSON object")
        try:
            actor = effective_user(request) or None
            packet = normalize_worker_output_packet(body, created_by=actor)
        except PacketNormalizeError as exc:
            detail: dict[str, str] = {"status": "validation_error", "message": str(exc)}
            if exc.field:
                detail["field"] = exc.field
            raise HTTPException(status_code=422, detail=detail) from exc
        return await forward_worker_output(packet)

    @router.get("/packets")
    async def nexus_gateway_packets_list(request: Request):
        """List packets from Nexus Core ``/tasks`` when configured; else placeholder."""
        authorize_nexus_read(request)
        return await list_packets()

    @router.get("/packets/{packet_id}")
    async def nexus_gateway_packet_detail(packet_id: str, request: Request):
        """Packet detail from Nexus Core ``/tasks/{packet_id}`` when configured."""
        authorize_nexus_read(request)
        pid = (packet_id or "").strip()
        if not pid:
            raise HTTPException(status_code=400, detail="packet_id is required")
        result = await get_packet_detail(pid)
        if result.get("error") == "not_found" or result.get("status") == "not_found":
            raise HTTPException(
                status_code=404,
                detail={
                    "ok": False,
                    "error": "not_found",
                    "message": "Packet not found.",
                    "packet_id": pid,
                },
            )
        return result

    @router.get("/workers")
    async def nexus_gateway_workers(request: Request):
        """Read-only worker registry placeholder for Console dashboard."""
        authorize_nexus_read(request)
        return gateway_read_placeholder(
            "workers",
            message="Worker registry is not exposed by Nexus Gateway yet.",
        )

    @router.get("/tools")
    async def nexus_gateway_tools(request: Request):
        """Read-only Tool Factory placeholder for Console dashboard."""
        authorize_nexus_read(request)
        return gateway_read_placeholder(
            "tools",
            message="Nexus Tool Factory status is not exposed by Nexus Gateway yet.",
        )

    @router.get("/connectors")
    async def nexus_gateway_connectors(request: Request):
        """Read-only connector status placeholder for Console dashboard."""
        authorize_nexus_read(request)
        return gateway_read_placeholder(
            "connectors",
            message="Connector status is not exposed by Nexus Gateway yet.",
        )

    @router.get("/housekeeping")
    async def nexus_gateway_housekeeping(request: Request):
        """Read-only housekeeping placeholder for Console dashboard."""
        authorize_nexus_read(request)
        return gateway_read_placeholder(
            "housekeeping",
            message="Housekeeping status is not exposed by Nexus Gateway yet.",
        )

    @router.get("/approvals")
    async def nexus_gateway_approvals(request: Request):
        """List approvals from Core when configured; otherwise honest placeholder."""
        authorize_nexus_read(request)
        return await list_approvals()

    @router.post("/approvals/{approval_id}/resolve")
    async def nexus_gateway_resolve_approval(approval_id: str, request: Request):
        """Forward human approval decision to Nexus Core; never executes locally."""
        authorize_nexus_admin(request)
        try:
            body = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="Request body must be valid JSON")
        if not isinstance(body, dict):
            raise HTTPException(status_code=400, detail="Request body must be a JSON object")
        try:
            actor = effective_user(request) or None
            resolution = build_approval_resolution(
                body,
                approval_id=approval_id,
                resolved_by=actor,
            )
        except ApprovalValidationError as exc:
            detail: dict[str, str] = {"status": "validation_error", "message": str(exc)}
            if exc.field:
                detail["field"] = exc.field
            raise HTTPException(status_code=422, detail=detail) from exc
        result = await resolve_approval(approval_id, resolution)
        result["approval_id"] = resolution.get("approval_id")
        result["decision"] = resolution.get("decision")
        return result

    @router.get("/model-config")
    async def nexus_gateway_model_config_get(request: Request):
        """Read Hermes model config from Nexus Core; never reads local Hermes YAML."""
        authorize_nexus_read(request)
        return await get_model_config()

    @router.post("/model-config")
    async def nexus_gateway_model_config_post(request: Request):
        """Forward model selection to Nexus Core; Gateway does not write Hermes config."""
        authorize_nexus_admin(request)
        try:
            body = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="Request body must be valid JSON")
        if not isinstance(body, dict):
            raise HTTPException(status_code=400, detail="Request body must be a JSON object")
        model = body.get("model")
        if not isinstance(model, str) or not model.strip():
            raise HTTPException(
                status_code=422,
                detail={"status": "validation_error", "message": "model is required", "field": "model"},
            )
        return await update_model_config(model.strip())

    @router.get("/cli/sessions")
    async def nexus_gateway_cli_sessions_list(request: Request):
        """List Hermes PTY sessions from Nexus Core (CLI Mirror relay)."""
        authorize_nexus_admin(request)
        return await cli_list_sessions()

    @router.post("/cli/sessions")
    async def nexus_gateway_cli_sessions_start(request: Request):
        """Start a Hermes PTY session via Nexus Core (admin/operator only)."""
        authorize_nexus_admin(request)
        try:
            body = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="Request body must be valid JSON")
        if body is None:
            body = {}
        if not isinstance(body, dict):
            raise HTTPException(status_code=400, detail="Request body must be a JSON object")
        result = await cli_start_session(body)
        if result.get("core_status") == "409":
            raise HTTPException(status_code=409, detail=result.get("core_body") or result)
        return result

    @router.get("/cli/sessions/{session_id}")
    async def nexus_gateway_cli_session_get(session_id: str, request: Request):
        authorize_nexus_admin(request)
        sid = (session_id or "").strip()
        if not sid:
            raise HTTPException(status_code=400, detail="session_id is required")
        result = await cli_get_session(sid)
        if result.get("core_status") == "404":
            raise HTTPException(status_code=404, detail=result.get("core_body") or result)
        return result

    @router.post("/cli/sessions/{session_id}/input")
    async def nexus_gateway_cli_session_input(session_id: str, request: Request):
        authorize_nexus_admin(request)
        sid = (session_id or "").strip()
        if not sid:
            raise HTTPException(status_code=400, detail="session_id is required")
        try:
            body = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="Request body must be valid JSON")
        if not isinstance(body, dict):
            raise HTTPException(status_code=400, detail="Request body must be a JSON object")
        text = body.get("text", "")
        result = await cli_send_input(sid, str(text))
        if result.get("core_status") == "404":
            raise HTTPException(status_code=404, detail=result.get("core_body") or result)
        if result.get("core_status") == "400":
            raise HTTPException(status_code=400, detail=result.get("core_body") or result)
        return result

    @router.get("/cli/sessions/{session_id}/transcript")
    async def nexus_gateway_cli_session_transcript(
        session_id: str,
        request: Request,
        limit: int = 200,
        before_seq: int | None = None,
        after_seq: int | None = None,
    ):
        authorize_nexus_admin(request)
        sid = (session_id or "").strip()
        if not sid:
            raise HTTPException(status_code=400, detail="session_id is required")
        result = await cli_get_transcript(
            sid,
            limit=limit,
            before_seq=before_seq,
            after_seq=after_seq,
        )
        if result.get("core_status") == "404":
            raise HTTPException(status_code=404, detail=result.get("core_body") or result)
        return result

    @router.get("/cli/sessions/{session_id}/stream")
    async def nexus_gateway_cli_session_stream(
        session_id: str,
        request: Request,
        after_seq: int = 0,
    ):
        """Relay Core Hermes PTY SSE stream (CLI Mirror foundation)."""
        authorize_nexus_admin(request)
        sid = (session_id or "").strip()
        if not sid:
            raise HTTPException(status_code=400, detail="session_id is required")
        return StreamingResponse(
            relay_cli_session_stream(sid, after_seq=max(0, after_seq)),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    @router.post("/cli/sessions/{session_id}/stop")
    async def nexus_gateway_cli_session_stop(session_id: str, request: Request):
        authorize_nexus_admin(request)
        sid = (session_id or "").strip()
        if not sid:
            raise HTTPException(status_code=400, detail="session_id is required")
        result = await cli_stop_session(sid)
        if result.get("core_status") == "404":
            raise HTTPException(status_code=404, detail=result.get("core_body") or result)
        return result

    @router.post("/cli/sessions/{session_id}/interrupt")
    async def nexus_gateway_cli_session_interrupt(session_id: str, request: Request):
        authorize_nexus_admin(request)
        sid = (session_id or "").strip()
        if not sid:
            raise HTTPException(status_code=400, detail="session_id is required")
        result = await cli_interrupt_session(sid)
        if result.get("core_status") == "404":
            raise HTTPException(status_code=404, detail=result.get("core_body") or result)
        if result.get("core_status") == "400":
            raise HTTPException(status_code=400, detail=result.get("core_body") or result)
        return result

    return router
