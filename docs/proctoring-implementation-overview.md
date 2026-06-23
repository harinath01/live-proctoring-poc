# Proctoring Implementation Overview

## Purpose Of This POC

This POC is intended to validate whether live one-way proctoring is feasible in the current product environment before committing to a full production design.

The implementation has been built incrementally. The current slice focuses on the student publish flow, the staff monitor flow, and the service boundaries between application logic and mediasoup control. It does not yet represent a production-ready media architecture.

## Current Architecture

The implementation is split across four parts:

- `frontend`: renders the student and staff flows, requests browser permissions, creates mediasoup-client transports, publishes student media, and attempts to consume student producers on the staff side
- `backend`: FastAPI application that owns rooms, participation, authorization, and orchestration of the mediasoup flow
- `mediasoup-server`: thin Node.js service that exposes mediasoup concepts such as routers, transports, producers, and consumers
- `database`: stores application entities and the mediasoup identifiers that FastAPI needs in order to reconnect later

The key architectural decision so far is that business concepts stay in FastAPI and media concepts stay in `mediasoup-server`.

That means FastAPI owns:

- room creation and room listing
- whether the current user is a student or staff member
- join semantics for students and staff
- mapping between users and mediasoup resources
- recovery behavior when mediasoup restarts and in-memory state is lost

`mediasoup-server` owns:

- creating mediasoup workers and routers
- creating WebRTC transports
- connecting transports with DTLS parameters
- producing tracks into mediasoup
- consuming tracks from mediasoup

This keeps mediasoup endpoints close to mediasoup terminology instead of embedding product-specific behavior in the media service.

## Current Data Flow

The current flow is HTTP-driven. There is no Socket.IO signaling path in the implementation yet.

### Room Listing And Creation

The frontend calls FastAPI to list available rooms for both students and staff.

Staff can create a room by calling FastAPI. At this stage, room creation is only an application-level operation. It does not immediately create a mediasoup router.

### Student Join

When a student opens a room page:

1. The frontend fetches room details from FastAPI.
2. The frontend calls `POST /api/v1/proctoring/rooms/{room_id}/join`.
3. FastAPI creates or reuses a `RoomParticipant` row for that student.
4. The frontend shows a permission dialog and requests:
   - webcam with audio
   - screen share
5. After both permission flows complete, the frontend starts mediasoup-client setup.

### Staff Join

When a staff member opens the monitor page:

1. The frontend fetches room details from FastAPI.
2. The frontend calls `POST /api/v1/proctoring/rooms/{room_id}/join`.
3. FastAPI creates or reuses a `StaffMonitor` row.
4. The frontend creates a mediasoup receive transport and starts polling for available producers.

### RTP Capabilities

Both student and staff mediasoup-client flows start by requesting router RTP capabilities through FastAPI.

1. The frontend calls `GET /api/v1/proctoring/rooms/{room_id}/rtp-capabilities`.
2. FastAPI ensures the room has a valid mediasoup router.
3. If the room has no router yet, FastAPI asks `mediasoup-server` to create one.
4. If the database contains a stale router ID and mediasoup no longer has that router in memory, FastAPI clears stale media state, creates a new router, and stores the new router ID.
5. FastAPI returns the router RTP capabilities to the frontend.

### Transport Creation And Connection

After loading router capabilities:

1. The frontend creates a mediasoup `Device`.
2. The frontend asks FastAPI to create a transport for the current room.
3. FastAPI validates whether the current user is allowed to create that transport type:
   - students can create send transports
   - staff can create receive transports
4. FastAPI ensures the room router exists, then asks `mediasoup-server` to create the transport.
5. FastAPI stores the resulting transport ID against the matching participant or monitor row.
6. The frontend connects the transport by sending DTLS parameters back through FastAPI.
7. FastAPI forwards the transport connect request to `mediasoup-server`.

### Student Produce Flow

After the send transport is connected:

1. The student frontend produces the webcam video track.
2. The student frontend produces the webcam audio track.
3. The student frontend produces the screen video track.
4. Each `produce` call goes to FastAPI first.
5. FastAPI forwards the produce request to `mediasoup-server`.
6. FastAPI stores the returned producer ID in the correct database column based on the declared source:
   - webcam video
   - webcam audio
   - screen video

### Staff Consume Flow

The staff monitor page currently polls FastAPI for available student producers.

1. The frontend calls `GET /api/v1/proctoring/rooms/{room_id}/producers`.
2. FastAPI returns active participant producer IDs for that room.
3. For each unseen producer, the frontend calls `POST /api/v1/proctoring/rooms/{room_id}/consume`.
4. FastAPI validates the staff monitor state and forwards the consume request to `mediasoup-server`.
5. `mediasoup-server` returns consumer parameters.
6. The frontend creates a mediasoup consumer and builds a `MediaStream` from the consumer track.
7. The staff page attaches that stream to a video element in the monitor grid.

## What Has Been Implemented So Far

### Frontend

The frontend currently includes:

- separate student and staff dashboard components
- real room listing for both roles through FastAPI
- staff room creation through FastAPI
- a dedicated student room page
- a dedicated staff monitor page
- a permission dialog that requests webcam with audio and screen share separately
- local webcam and screen previews on the student page
- a placeholder proctoring message on the student page
- a dummy chat panel on the student page for future proctor messaging
- mediasoup-client integration for send and receive transports

Although the original mission document described a plain HTML POC, the current implementation uses the existing React frontend so it can be integrated into the current dashboard quickly.

### Backend

FastAPI currently includes:

- room list and room create endpoints
- room detail endpoint
- room join endpoint for both students and staff
- router RTP capability endpoint
- transport create endpoint
- transport connect endpoint
- produce endpoint
- producer list endpoint
- consume endpoint

FastAPI also contains the recovery logic for stale router IDs when `mediasoup-server` restarts and loses in-memory state.

### mediasoup-server

The Node.js service currently includes:

- mediasoup worker startup
- in-memory room and router tracking
- router creation
- RTP capability lookup
- WebRTC transport creation
- transport connect handling
- producer creation
- consumer creation

It is intentionally thin. It does not know about students, staff, or product-specific room semantics.

## Current Data Model

Three core models have been added for this slice.

### Room

`Room` represents the application-level proctoring room.

It stores:

- `id`
- `name`
- `mediasoup_router_id`
- `created_at`

`mediasoup_router_id` is nullable because the router is created lazily only when the media flow actually starts.

### RoomParticipant

`RoomParticipant` represents a student in a room.

It stores:

- `room_id`
- `user_id`
- `mediasoup_send_transport_id`
- `webcam_producer_id`
- `audio_producer_id`
- `screen_producer_id`
- `joined_at`
- `left_at`

This is the application-side record that ties a student to mediasoup send resources.

### StaffMonitor

`StaffMonitor` represents a staff user monitoring a room.

It stores:

- `room_id`
- `staff_user_id`
- `mediasoup_recv_transport_id`
- `joined_at`
- `left_at`

This is the application-side record that ties a staff monitor to mediasoup receive resources.

## Why The APIs Look This Way

The current API design keeps FastAPI endpoints room-scoped and passes mediasoup-specific details through request payloads.

Examples:

- `POST /api/v1/proctoring/rooms/{room_id}/join`
- `GET /api/v1/proctoring/rooms/{room_id}/rtp-capabilities`
- `POST /api/v1/proctoring/rooms/{room_id}/transports`
- `POST /api/v1/proctoring/rooms/{room_id}/transport-connect`
- `POST /api/v1/proctoring/rooms/{room_id}/produce`
- `GET /api/v1/proctoring/rooms/{room_id}/producers`
- `POST /api/v1/proctoring/rooms/{room_id}/consume`

This reflects the current design choice:

- FastAPI exposes product-facing APIs
- mediasoup-server exposes mediasoup-facing APIs

The frontend does not speak directly to mediasoup-server. FastAPI acts as the orchestrator and persistence layer.

HTTP is acceptable for this current signaling slice because the implemented workflow is request-response oriented:

- join a room
- fetch RTP capabilities
- create a transport
- connect a transport
- produce a track
- request a consumer

That does not remove the need for real-time channels later. Staff messaging, presence, leave notifications, and push-style producer discovery are better fits for WebSocket or Socket.IO once the media path itself is stable.

## Current Limitations And Known Issues

### mediasoup State Is In Memory

The current `mediasoup-server` stores routers, transports, producers, and consumers only in memory.

This means a mediasoup-server restart invalidates all active media state. FastAPI now recovers stale router IDs, but live transports and producers still need to be recreated by rejoining or republishing.

### Producer Discovery Is Polling Based

The staff monitor page currently polls FastAPI for producer IDs instead of receiving push updates. This is acceptable for a first slice but not ideal for a final implementation.

### The Media Path Is Not Stable Yet

The current implementation has ongoing ICE connectivity issues on the staff receive side. The visible result is that the staff page can render monitor tiles while the video elements remain black because the browser never receives usable media packets.

This is an important distinction:

- the UI flow is mostly present
- the FastAPI orchestration layer is mostly present
- mediasoup resources are being created
- the end-to-end receive path is not yet reliable

### The Current Frontend Differs From The Original POC Direction

The mission document describes a plain HTML and minimal-JavaScript POC. The current implementation uses the existing React application and existing UI components instead.

This was a practical choice for integrating quickly with the current dashboard, but it means the implementation does not currently match the original frontend constraint in `MISSION.md`.

## Current Status And Next Slice

At this stage, the project has a clear service boundary, a real room and participant data model, frontend room flows for both students and staff, and end-to-end HTTP orchestration for mediasoup operations through FastAPI.

The main missing piece is not page structure or API scaffolding. It is a stable WebRTC receive path between student publishers and the staff monitor view.

Once that path is working reliably, the next slice can focus on replacing polling with push-style events, adding staff messaging, and tightening the behavior around room presence, leave handling, and monitor lifecycle.
