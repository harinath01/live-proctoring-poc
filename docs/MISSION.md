# Mission

## Objective

Validate that live staff-to-student video monitoring is feasible before committing to a full implementation inside the Testpress proctoring platform.

## Success Criteria

The POC is successful when all of the following are true:

1. A staff member can open a browser page, see a list of rooms, create a room, open a room detail page, view all candidates in that room, select candidates, and preview live video tiles for 4 to 5 connected students.
2. Each student's camera and microphone stream reaches the staff member without manual server configuration for each session.
3. A staff member can send a text message that appears on all connected student pages using Socket.IO, not WebRTC.
4. The system runs on a single server with a public IP and is reachable from outside `localhost`.
5. The frontend uses plain HTML files only, so the WebRTC and mediasoup flow remains easy to read and debug.

## Product Scope

### In Scope

- One-way live monitoring from students to staff
- Staff room listing and room creation
- Staff room detail page with candidate list and live preview tiles
- Student camera and microphone publishing
- Staff broadcast text messaging to students over Socket.IO
- Single-server deployment for external access

### Out of Scope

- Student playback of any staff WebRTC stream
- TURN infrastructure for this demo
- Frontend frameworks, bundlers, or TypeScript on the POC client pages
- Production hardening, scaling, and long-term maintainability concerns beyond what is needed to prove feasibility

## Technical Approach

- Signaling server: FastAPI + `python-socketio` with `asyncio`
- Media server: `mediasoup` running in a Node.js worker process, either spawned separately or through a thin JavaScript bridge
- Browser client: Vanilla JavaScript + `mediasoup-client` from a CDN, with no bundler
- STUN: Google public STUN at `stun:stun.l.google.com:19302`
- Deployment: Single Linux server with a known public IP and `announcedIp` explicitly configured in mediasoup transport settings

## Constraints

- The implementation must stay readable and straightforward because the team has no prior mediasoup production experience
- No React, bundler, or TypeScript in the POC client layer
- Monitoring is one-way only: staff sees students, students do not receive WebRTC media back
- Students receive staff messages over Socket.IO only
