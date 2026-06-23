import { OpenAPI } from "@/client"

export type ProctoringRoom = {
  id: string
  name: string
  mediasoup_router_id: string | null
  created_at: string | null
  active_student_count: number
}

type RoomsResponse = {
  data: ProctoringRoom[]
  count: number
}

export type TransportResponse = {
  id: string
  direction: string
  iceParameters: object
  iceCandidates: object[]
  dtlsParameters: object
}

export type ProducersResponse = {
  room_id: string
  producers: Array<{
    user_id: string
    webcam_producer_id: string | null
    audio_producer_id: string | null
    screen_producer_id: string | null
  }>
}

function buildApiUrl(path: string) {
  return `${OpenAPI.BASE}${path}`
}

async function proctoringRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("access_token")
  const response = await fetch(buildApiUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    let detail = "Request failed"
    try {
      const body = (await response.json()) as { detail?: string | { message?: string } }
      if (typeof body.detail === "string") {
        detail = body.detail
      } else if (body.detail && typeof body.detail === "object" && "message" in body.detail) {
        detail = body.detail.message || detail
      }
    } catch {
      detail = response.statusText || detail
    }
    throw new Error(detail)
  }

  return (await response.json()) as T
}

export function listProctoringRooms() {
  return proctoringRequest<RoomsResponse>("/api/v1/proctoring/rooms")
}

export function getProctoringRoom(roomId: string) {
  return proctoringRequest<ProctoringRoom>(`/api/v1/proctoring/rooms/${roomId}`)
}

export function createProctoringRoom(name: string) {
  return proctoringRequest<ProctoringRoom>("/api/v1/proctoring/rooms", {
    method: "POST",
    body: JSON.stringify({ name }),
  })
}

export function joinProctoringRoom(roomId: string) {
  return proctoringRequest(`/api/v1/proctoring/rooms/${roomId}/join`, {
    method: "POST",
    body: JSON.stringify({ metadata: {} }),
  })
}

export function getRoomRtpCapabilities(roomId: string) {
  return proctoringRequest<{
    room_id: string
    router_id: string
    rtpCapabilities: object
  }>(`/api/v1/proctoring/rooms/${roomId}/rtp-capabilities`)
}

export function createRoomTransport(roomId: string, direction: "send" | "recv") {
  return proctoringRequest<TransportResponse>(
    `/api/v1/proctoring/rooms/${roomId}/transports`,
    {
      method: "POST",
      body: JSON.stringify({ direction, metadata: {} }),
    }
  )
}

export function connectRoomTransport(
  roomId: string,
  transportId: string,
  dtlsParameters: object
) {
  return proctoringRequest(`/api/v1/proctoring/rooms/${roomId}/transport-connect`, {
    method: "POST",
    body: JSON.stringify({
      transport_id: transportId,
      dtls_parameters: dtlsParameters,
      metadata: {},
    }),
  })
}

export function produceTrack(
  roomId: string,
  payload: {
    transportId: string
    kind: string
    rtpParameters: object
    source: "webcam" | "screen"
  }
) {
  return proctoringRequest<{
    producer_id: string
    kind: string
    source: string
  }>(`/api/v1/proctoring/rooms/${roomId}/produce`, {
    method: "POST",
    body: JSON.stringify({
      transport_id: payload.transportId,
      kind: payload.kind,
      rtp_parameters: payload.rtpParameters,
      app_data: { source: payload.source },
      metadata: {},
    }),
  })
}

export function listRoomProducers(roomId: string) {
  return proctoringRequest<ProducersResponse>(
    `/api/v1/proctoring/rooms/${roomId}/producers`
  )
}

export function consumeProducer(
  roomId: string,
  payload: {
    producerId: string
    rtpCapabilities: object
  }
) {
  return proctoringRequest<{
    id: string
    producer_id: string
    kind: string
    rtpParameters: object
  }>(`/api/v1/proctoring/rooms/${roomId}/consume`, {
    method: "POST",
    body: JSON.stringify({
      producer_id: payload.producerId,
      rtp_capabilities: payload.rtpCapabilities,
      metadata: {},
    }),
  })
}
