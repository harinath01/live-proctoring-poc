from __future__ import annotations

import uuid
from typing import Any, cast

import httpx
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import and_, col, func, select

from app.api.deps import CurrentUser, SessionDep
from app.core.config import settings
from app.models import (
    Room,
    RoomCreate,
    RoomParticipant,
    RoomPublic,
    RoomsPublic,
    StaffMonitor,
)


router = APIRouter(prefix="/proctoring", tags=["proctoring"])
MEDIASOUP_SERVER_URL = getattr(settings, "MEDIASOUP_SERVER_URL", "http://localhost:3000")


class JoinRoomPayload(BaseModel):
    metadata: dict[str, Any] = Field(default_factory=dict)


class CreateTransportPayload(BaseModel):
    direction: str = "send"
    metadata: dict[str, Any] = Field(default_factory=dict)


class ConnectTransportPayload(BaseModel):
    transport_id: str
    dtls_parameters: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)


class ProducePayload(BaseModel):
    transport_id: str
    kind: str
    rtp_parameters: dict[str, Any] = Field(default_factory=dict)
    app_data: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)


class ConsumePayload(BaseModel):
    producer_id: str
    rtp_capabilities: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)


def mediasoup_request(method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    url = f"{MEDIASOUP_SERVER_URL.rstrip('/')}{path}"
    with httpx.Client(timeout=10.0) as client:
        response = client.request(method, url, json=payload)

    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        detail: Any
        try:
          detail = exc.response.json()
        except ValueError:
          detail = exc.response.text
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "message": "mediasoup-server request failed",
                "path": path,
                "upstream_status": exc.response.status_code,
                "upstream_detail": detail,
            },
        ) from exc

    return cast(dict[str, Any], response.json())


def is_router_not_found_error(error: HTTPException) -> bool:
    detail = error.detail
    if not isinstance(detail, dict):
        return False
    if detail.get("upstream_status") != 404:
        return False

    upstream_detail = detail.get("upstream_detail")
    if not isinstance(upstream_detail, dict):
        return False

    upstream_error = upstream_detail.get("error")
    return isinstance(upstream_error, str) and upstream_error.startswith("Router not found:")


def get_room_or_404(session: SessionDep, room_id: uuid.UUID) -> Room:
    room = session.get(Room, room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    return room


def build_room_public(session: SessionDep, room: Room) -> RoomPublic:
    active_student_count = session.exec(
        select(func.count())
        .select_from(RoomParticipant)
        .where(
            and_(
                RoomParticipant.room_id == room.id,
                RoomParticipant.left_at.is_(None),
            )
        )
    ).one()
    return RoomPublic.model_validate(
        room,
        update={"active_student_count": active_student_count},
    )


def clear_room_media_state(session: SessionDep, room: Room) -> None:
    participants = session.exec(
        select(RoomParticipant).where(RoomParticipant.room_id == room.id)
    ).all()
    for participant in participants:
        participant.mediasoup_send_transport_id = None
        participant.webcam_producer_id = None
        participant.audio_producer_id = None
        participant.screen_producer_id = None
        session.add(participant)

    monitors = session.exec(
        select(StaffMonitor).where(StaffMonitor.room_id == room.id)
    ).all()
    for monitor in monitors:
        monitor.mediasoup_recv_transport_id = None
        session.add(monitor)

    session.commit()


def create_room_router(session: SessionDep, room: Room) -> str:
    mediasoup_response = mediasoup_request("POST", "/rooms", {"name": room.name})
    router_id = mediasoup_response.get("router_id")
    if not isinstance(router_id, str) or not router_id:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="mediasoup-server did not return a router_id",
        )

    room.mediasoup_router_id = router_id
    session.add(room)
    session.commit()
    session.refresh(room)
    return router_id


def ensure_room_router(session: SessionDep, room: Room, *, validate: bool = False) -> str:
    if not room.mediasoup_router_id:
        return create_room_router(session, room)

    if not validate:
        return room.mediasoup_router_id

    try:
        mediasoup_request("GET", f"/routers/{room.mediasoup_router_id}/rtp-capabilities")
        return room.mediasoup_router_id
    except HTTPException as error:
        if not is_router_not_found_error(error):
            raise

    clear_room_media_state(session, room)
    room.mediasoup_router_id = None
    session.add(room)
    session.commit()
    session.refresh(room)
    return create_room_router(session, room)


def get_active_student_participant(
    session: SessionDep, room_id: uuid.UUID, user_id: uuid.UUID
) -> RoomParticipant | None:
    return session.exec(
        select(RoomParticipant).where(
            and_(
                RoomParticipant.room_id == room_id,
                RoomParticipant.user_id == user_id,
                RoomParticipant.left_at.is_(None),
            )
        )
    ).first()


def get_active_staff_monitor(
    session: SessionDep, room_id: uuid.UUID, staff_user_id: uuid.UUID
) -> StaffMonitor | None:
    return session.exec(
        select(StaffMonitor).where(
            and_(
                StaffMonitor.room_id == room_id,
                StaffMonitor.staff_user_id == staff_user_id,
                StaffMonitor.left_at.is_(None),
            )
        )
    ).first()


@router.get("/rooms", response_model=RoomsPublic)
def list_rooms(session: SessionDep, current_user: CurrentUser) -> RoomsPublic:
    _ = current_user
    rooms = session.exec(select(Room).order_by(col(Room.created_at).desc())).all()
    rooms_public = [build_room_public(session, room) for room in rooms]
    return RoomsPublic(data=rooms_public, count=len(rooms_public))


@router.post("/rooms", response_model=RoomPublic)
def create_room(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    payload: RoomCreate,
) -> RoomPublic:
    if not current_user.is_superuser and current_user.role != "staff":
        raise HTTPException(status_code=403, detail="Only staff can create rooms")

    room = Room.model_validate(payload)
    session.add(room)
    session.commit()
    session.refresh(room)
    return build_room_public(session, room)


@router.get("/rooms/{room_id}", response_model=RoomPublic)
def get_room(
    room_id: uuid.UUID, session: SessionDep, current_user: CurrentUser
) -> RoomPublic:
    _ = current_user
    room = get_room_or_404(session, room_id)
    return build_room_public(session, room)


@router.get("/rooms/{room_id}/rtp-capabilities")
def get_rtp_capabilities(
    room_id: uuid.UUID, session: SessionDep, current_user: CurrentUser
) -> dict[str, Any]:
    _ = current_user
    room = get_room_or_404(session, room_id)
    router_id = ensure_room_router(session, room, validate=True)
    mediasoup_response = mediasoup_request(
        "GET", f"/routers/{router_id}/rtp-capabilities"
    )
    return {
        "room_id": str(room.id),
        "router_id": router_id,
        "rtpCapabilities": mediasoup_response.get("rtpCapabilities", {}),
    }


@router.post("/rooms/{room_id}/join")
def join_room(
    room_id: uuid.UUID,
    payload: JoinRoomPayload,
    session: SessionDep,
    current_user: CurrentUser,
) -> dict[str, Any]:
    room = get_room_or_404(session, room_id)

    if current_user.is_superuser or current_user.role == "staff":
        monitor = get_active_staff_monitor(session, room.id, current_user.id)
        if not monitor:
            monitor = StaffMonitor(room_id=room.id, staff_user_id=current_user.id)
            session.add(monitor)
            session.commit()
            session.refresh(monitor)
        return {
            "room_id": str(room.id),
            "role": "staff",
            "staff_monitor_id": str(monitor.id),
            "metadata": payload.metadata,
        }

    participant = get_active_student_participant(session, room.id, current_user.id)
    if not participant:
        participant = RoomParticipant(room_id=room.id, user_id=current_user.id)
        session.add(participant)
        session.commit()
        session.refresh(participant)

    return {
        "room_id": str(room.id),
        "role": "student",
        "participant_id": str(participant.id),
        "metadata": payload.metadata,
    }


@router.post("/rooms/{room_id}/transports")
def create_transport(
    room_id: uuid.UUID,
    payload: CreateTransportPayload,
    session: SessionDep,
    current_user: CurrentUser,
) -> dict[str, Any]:
    room = get_room_or_404(session, room_id)
    router_id = ensure_room_router(session, room, validate=True)

    direction = payload.direction
    if direction not in {"send", "recv"}:
        raise HTTPException(status_code=400, detail="direction must be send or recv")

    if direction == "send":
        if current_user.is_superuser or current_user.role == "staff":
            raise HTTPException(status_code=403, detail="Staff cannot create send transports")
        participant = get_active_student_participant(session, room.id, current_user.id)
        if not participant:
            raise HTTPException(status_code=400, detail="Join room before creating a send transport")
        peer_id = str(current_user.id)
    else:
        if not (current_user.is_superuser or current_user.role == "staff"):
            raise HTTPException(status_code=403, detail="Students cannot create recv transports")
        monitor = get_active_staff_monitor(session, room.id, current_user.id)
        if not monitor:
            monitor = StaffMonitor(room_id=room.id, staff_user_id=current_user.id)
            session.add(monitor)
            session.commit()
            session.refresh(monitor)
        peer_id = str(current_user.id)

    mediasoup_response = mediasoup_request(
        "POST",
        "/transports",
        {
            "router_id": router_id,
            "direction": direction,
            "peer_id": peer_id,
        },
    )

    transport_id = mediasoup_response.get("id")
    if not isinstance(transport_id, str) or not transport_id:
        raise HTTPException(status_code=502, detail="mediasoup-server did not return a transport id")

    if direction == "send":
        participant.mediasoup_send_transport_id = transport_id
        session.add(participant)
    else:
        monitor.mediasoup_recv_transport_id = transport_id
        session.add(monitor)

    session.commit()

    return mediasoup_response


@router.post("/rooms/{room_id}/transport-connect")
def connect_transport(
    room_id: uuid.UUID,
    payload: ConnectTransportPayload,
    session: SessionDep,
    current_user: CurrentUser,
) -> dict[str, Any]:
    room = get_room_or_404(session, room_id)

    owns_transport = False
    participant = get_active_student_participant(session, room.id, current_user.id)
    if participant and participant.mediasoup_send_transport_id == payload.transport_id:
        owns_transport = True

    monitor = get_active_staff_monitor(session, room.id, current_user.id)
    if monitor and monitor.mediasoup_recv_transport_id == payload.transport_id:
        owns_transport = True

    if not owns_transport:
        raise HTTPException(status_code=403, detail="Transport does not belong to the current user")

    return mediasoup_request(
        "POST",
        "/transports/connect",
        {
            "transport_id": payload.transport_id,
            "dtls_parameters": payload.dtls_parameters,
        },
    )


@router.post("/rooms/{room_id}/produce")
def produce(
    room_id: uuid.UUID,
    payload: ProducePayload,
    session: SessionDep,
    current_user: CurrentUser,
) -> dict[str, Any]:
    room = get_room_or_404(session, room_id)
    participant = get_active_student_participant(session, room.id, current_user.id)
    if not participant:
        raise HTTPException(status_code=400, detail="Join room before producing")
    if participant.mediasoup_send_transport_id != payload.transport_id:
        raise HTTPException(status_code=403, detail="Transport does not belong to the current student")

    mediasoup_response = mediasoup_request(
        "POST",
        "/producers",
        {
            "transport_id": payload.transport_id,
            "kind": payload.kind,
            "rtp_parameters": payload.rtp_parameters,
        },
    )

    producer_id = mediasoup_response.get("id")
    if not isinstance(producer_id, str) or not producer_id:
        raise HTTPException(status_code=502, detail="mediasoup-server did not return a producer id")

    source = payload.app_data.get("source")
    if source == "webcam" and payload.kind == "video":
        participant.webcam_producer_id = producer_id
    elif source == "webcam" and payload.kind == "audio":
        participant.audio_producer_id = producer_id
    elif source == "screen":
        participant.screen_producer_id = producer_id
    else:
        raise HTTPException(status_code=400, detail="Unsupported app_data.source or kind combination")

    session.add(participant)
    session.commit()

    return {
        "producer_id": producer_id,
        "kind": payload.kind,
        "source": source,
    }


@router.get("/rooms/{room_id}/producers")
def list_producers(
    room_id: uuid.UUID, session: SessionDep, current_user: CurrentUser
) -> dict[str, Any]:
    if not (current_user.is_superuser or current_user.role == "staff"):
        raise HTTPException(status_code=403, detail="Only staff can list room producers")

    room = get_room_or_404(session, room_id)
    participants = session.exec(
        select(RoomParticipant).where(
            and_(
                RoomParticipant.room_id == room.id,
                RoomParticipant.left_at.is_(None),
            )
        )
    ).all()

    return {
        "room_id": str(room.id),
        "producers": [
            {
                "user_id": str(participant.user_id),
                "webcam_producer_id": participant.webcam_producer_id,
                "audio_producer_id": participant.audio_producer_id,
                "screen_producer_id": participant.screen_producer_id,
            }
            for participant in participants
            if participant.webcam_producer_id
            or participant.audio_producer_id
            or participant.screen_producer_id
        ],
    }


@router.post("/rooms/{room_id}/consume")
def consume(
    room_id: uuid.UUID,
    payload: ConsumePayload,
    session: SessionDep,
    current_user: CurrentUser,
) -> dict[str, Any]:
    if not (current_user.is_superuser or current_user.role == "staff"):
        raise HTTPException(status_code=403, detail="Only staff can consume room producers")

    room = get_room_or_404(session, room_id)
    monitor = get_active_staff_monitor(session, room.id, current_user.id)
    if not monitor or not monitor.mediasoup_recv_transport_id:
        raise HTTPException(status_code=400, detail="Create a recv transport before consuming")

    return mediasoup_request(
        "POST",
        "/consumers",
        {
            "transport_id": monitor.mediasoup_recv_transport_id,
            "producer_id": payload.producer_id,
            "rtp_capabilities": payload.rtp_capabilities,
        },
    )
