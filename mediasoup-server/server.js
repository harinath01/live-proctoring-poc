const crypto = require("crypto");
const express = require("express");
const mediasoup = require("mediasoup");

const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 3000);
const announcedAddress = process.env.ANNOUNCED_IP || "127.0.0.1";
const rtcMinPort = Number(process.env.RTC_MIN_PORT || 40000);
const rtcMaxPort = Number(process.env.RTC_MAX_PORT || 40100);

const ROUTER_MEDIA_CODECS = [
  {
    kind: "audio",
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: "video",
    mimeType: "video/VP8",
    clockRate: 90000,
  },
];

const app = express();
app.use(express.json());

const runtime = {
  worker: null,
  rooms: new Map(),
  routers: new Map(),
  transports: new Map(),
  producers: new Map(),
  consumers: new Map(),
  transportRouterIds: new Map(),
};

function buildListenInfos() {
  const base = { ip: "0.0.0.0" };

  if (announcedAddress) {
    return [
      { ...base, protocol: "udp", announcedAddress },
      { ...base, protocol: "tcp", announcedAddress },
    ];
  }

  return [
    { ...base, protocol: "udp" },
    { ...base, protocol: "tcp" },
  ];
}

async function ensureWorker() {
  if (runtime.worker) {
    return runtime.worker;
  }

  const worker = await mediasoup.createWorker({
    rtcMinPort,
    rtcMaxPort,
  });
  worker.on("died", () => {
    console.error(`mediasoup worker died pid=${worker.pid}`);
    process.exit(1);
  });

  runtime.worker = worker;
  return worker;
}

async function createRouterForRoom(roomName) {
  const worker = await ensureWorker();
  const router = await worker.createRouter({ mediaCodecs: ROUTER_MEDIA_CODECS });
  const roomId = crypto.randomUUID();

  const room = {
    id: roomId,
    name: roomName || `room-${roomId.slice(0, 8)}`,
    routerId: router.id,
    createdAt: new Date().toISOString(),
  };

  runtime.rooms.set(room.id, room);
  runtime.routers.set(router.id, router);

  return { room, router };
}

function getRouterOrThrow(routerId) {
  const router = runtime.routers.get(routerId);
  if (!router) {
    const error = new Error(`Router not found: ${routerId}`);
    error.statusCode = 404;
    throw error;
  }
  return router;
}

function getTransportOrThrow(transportId) {
  const transport = runtime.transports.get(transportId);
  if (!transport) {
    const error = new Error(`Transport not found: ${transportId}`);
    error.statusCode = 404;
    throw error;
  }
  return transport;
}

function getProducerOrThrow(producerId) {
  const producer = runtime.producers.get(producerId);
  if (!producer) {
    const error = new Error(`Producer not found: ${producerId}`);
    error.statusCode = 404;
    throw error;
  }
  return producer;
}

async function createWebRtcTransport(routerId) {
  const router = getRouterOrThrow(routerId);
  const transport = await router.createWebRtcTransport({
    listenInfos: buildListenInfos(),
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
  });

  runtime.transports.set(transport.id, transport);
  runtime.transportRouterIds.set(transport.id, routerId);

  console.log(
    `created WebRTC transport id=${transport.id} routerId=${routerId} ` +
      `iceRole=${transport.iceRole}`
  );

  transport.on("icestatechange", (iceState) => {
    console.log(`transport ${transport.id} iceState=${iceState}`);
  });

  transport.on("dtlsstatechange", (state) => {
    console.log(`transport ${transport.id} dtlsState=${state}`);
    if (state === "closed") {
      runtime.transports.delete(transport.id);
      runtime.transportRouterIds.delete(transport.id);
    }
  });

  transport.on("close", () => {
    runtime.transports.delete(transport.id);
    runtime.transportRouterIds.delete(transport.id);
  });

  return transport;
}

function transportResponse(transport, direction) {
  return {
    id: transport.id,
    direction,
    iceParameters: transport.iceParameters,
    iceCandidates: transport.iceCandidates,
    dtlsParameters: transport.dtlsParameters,
  };
}

app.get("/health", async (_request, response) => {
  const worker = await ensureWorker();
  response.json({ status: "ok", workerPid: worker.pid });
});

app.get("/", (_request, response) => {
  response.json({
    service: "mediasoup-server",
    status: "ready",
    message: "Mediasoup HTTP API for FastAPI orchestration",
  });
});

app.post("/rooms", async (request, response, next) => {
  try {
    const { room, router } = await createRouterForRoom(request.body?.name);
    response.json({
      action: "create-room",
      room: {
        id: room.id,
        name: room.name,
      },
      router_id: router.id,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/routers/:routerId/rtp-capabilities", (request, response, next) => {
  try {
    const router = getRouterOrThrow(request.params.routerId);
    response.json({
      router_id: router.id,
      rtpCapabilities: router.rtpCapabilities,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/transports", async (request, response, next) => {
  try {
    const { router_id: routerId, direction = "send" } = request.body || {};
    if (!routerId) {
      const error = new Error("router_id is required");
      error.statusCode = 400;
      throw error;
    }

    const transport = await createWebRtcTransport(routerId);
    response.json(transportResponse(transport, direction));
  } catch (error) {
    next(error);
  }
});

app.post("/transports/connect", async (request, response, next) => {
  try {
    const { transport_id: transportId, dtls_parameters: dtlsParameters } =
      request.body || {};

    if (!transportId || !dtlsParameters) {
      const error = new Error("transport_id and dtls_parameters are required");
      error.statusCode = 400;
      throw error;
    }

    const transport = getTransportOrThrow(transportId);
    await transport.connect({ dtlsParameters });

    response.json({
      connected: true,
      transport_id: transportId,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/producers", async (request, response, next) => {
  try {
    const {
      transport_id: transportId,
      kind,
      rtp_parameters: rtpParameters,
    } = request.body || {};

    if (!transportId || !kind || !rtpParameters) {
      const error = new Error(
        "transport_id, kind, and rtp_parameters are required"
      );
      error.statusCode = 400;
      throw error;
    }

    const transport = getTransportOrThrow(transportId);
    const producer = await transport.produce({ kind, rtpParameters });
    runtime.producers.set(producer.id, producer);

    producer.on("transportclose", () => {
      runtime.producers.delete(producer.id);
    });

    producer.on("close", () => {
      runtime.producers.delete(producer.id);
    });

    response.json({
      id: producer.id,
      kind: producer.kind,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/consumers", async (request, response, next) => {
  try {
    const {
      transport_id: transportId,
      producer_id: producerId,
      rtp_capabilities: rtpCapabilities,
    } = request.body || {};

    if (!transportId || !producerId || !rtpCapabilities) {
      const error = new Error(
        "transport_id, producer_id, and rtp_capabilities are required"
      );
      error.statusCode = 400;
      throw error;
    }

    const transport = getTransportOrThrow(transportId);
    const producer = getProducerOrThrow(producerId);
    const routerId = runtime.transportRouterIds.get(transportId);

    if (!routerId) {
      const error = new Error(`Router association not found for ${transportId}`);
      error.statusCode = 404;
      throw error;
    }

    const router = getRouterOrThrow(routerId);
    if (!router.canConsume({ producerId, rtpCapabilities })) {
      const error = new Error("Router cannot consume the given producer");
      error.statusCode = 400;
      throw error;
    }

    const consumer = await transport.consume({
      producerId,
      rtpCapabilities,
      paused: false,
    });
    runtime.consumers.set(consumer.id, consumer);

    consumer.on("transportclose", () => {
      runtime.consumers.delete(consumer.id);
    });

    consumer.on("producerclose", () => {
      runtime.consumers.delete(consumer.id);
    });

    response.json({
      id: consumer.id,
      producer_id: producer.id,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
    });
  } catch (error) {
    next(error);
  }
});

app.use((error, _request, response, _next) => {
  const statusCode = error.statusCode || 500;
  response.status(statusCode).json({
    error: error.message || "Internal server error",
  });
});

ensureWorker()
  .then((worker) => {
    app.listen(port, host, () => {
      console.log(
        `mediasoup-server listening on http://${host}:${port} (workerPid=${worker.pid})`
      );
    });
  })
  .catch((error) => {
    console.error("Failed to start mediasoup-server", error);
    process.exit(1);
  });
