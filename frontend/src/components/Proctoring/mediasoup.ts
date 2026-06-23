import { Device } from "mediasoup-client"
import type {
  Producer,
  Transport,
  Consumer,
} from "mediasoup-client/types"

import {
  connectRoomTransport,
  consumeProducer,
  createRoomTransport,
  getRoomRtpCapabilities,
  produceTrack,
} from "@/components/Proctoring/api"

const WEBRTC_ADDITIONAL_SETTINGS = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
}

export type StudentPublishingSession = {
  audioProducer: Producer | null
  screenProducer: Producer | null
  sendTransport: Transport
  videoProducer: Producer | null
}

export async function createDeviceForRoom(roomId: string) {
  const { rtpCapabilities } = await getRoomRtpCapabilities(roomId)
  const device = new Device()
  await device.load({
    routerRtpCapabilities:
      rtpCapabilities as Parameters<typeof device.load>[0]["routerRtpCapabilities"],
  })
  return device
}

export async function createSendTransportForRoom(roomId: string, device: Device) {
  const transportParams = await createRoomTransport(roomId, "send")
  const transport = device.createSendTransport({
    ...(transportParams as any),
    additionalSettings: WEBRTC_ADDITIONAL_SETTINGS,
  })

  transport.on("connect", ({ dtlsParameters }, callback, errback) => {
    connectRoomTransport(roomId, transport.id, dtlsParameters)
      .then(() => callback())
      .catch(errback)
  })

  transport.on("produce", ({ kind, rtpParameters, appData }, callback, errback) => {
    const source =
      appData && typeof appData === "object" && "source" in appData
        ? String(appData.source)
        : "webcam"
    produceTrack(roomId, {
      transportId: transport.id,
      kind,
      rtpParameters,
      source: source === "screen" ? "screen" : "webcam",
    })
      .then(({ producer_id }) => callback({ id: producer_id }))
      .catch(errback)
  })

  transport.on("connectionstatechange", (state) => {
    console.info("Student send transport state", state)
  })

  return transport
}

export async function publishStudentStreams(
  roomId: string,
  device: Device,
  streams: {
    webcamStream: MediaStream | null
    screenStream: MediaStream | null
  }
): Promise<StudentPublishingSession> {
  const sendTransport = await createSendTransportForRoom(roomId, device)

  const webcamVideoTrack = streams.webcamStream?.getVideoTracks()[0] ?? null
  const webcamAudioTrack = streams.webcamStream?.getAudioTracks()[0] ?? null
  const screenVideoTrack = streams.screenStream?.getVideoTracks()[0] ?? null

  const videoProducer = webcamVideoTrack
    ? await sendTransport.produce({
        track: webcamVideoTrack,
        appData: { source: "webcam" },
      })
    : null
  const audioProducer = webcamAudioTrack
    ? await sendTransport.produce({
        track: webcamAudioTrack,
        appData: { source: "webcam" },
      })
    : null
  const screenProducer = screenVideoTrack
    ? await sendTransport.produce({
        track: screenVideoTrack,
        appData: { source: "screen" },
      })
    : null

  return {
    sendTransport,
    videoProducer,
    audioProducer,
    screenProducer,
  }
}

export async function createRecvTransportForRoom(roomId: string, device: Device) {
  const transportParams = await createRoomTransport(roomId, "recv")
  const transport = device.createRecvTransport({
    ...(transportParams as any),
    additionalSettings: WEBRTC_ADDITIONAL_SETTINGS,
  })

  transport.on("connect", ({ dtlsParameters }, callback, errback) => {
    connectRoomTransport(roomId, transport.id, dtlsParameters)
      .then(() => callback())
      .catch(errback)
  })

  transport.on("connectionstatechange", (state) => {
    console.info("Staff recv transport state", state)
  })

  return transport
}

export async function consumeProducerTrack(
  roomId: string,
  device: Device,
  recvTransport: Transport,
  producerId: string
): Promise<{ consumer: Consumer; stream: MediaStream }> {
  const consumerParams = await consumeProducer(roomId, {
    producerId,
    rtpCapabilities: device.rtpCapabilities as object,
  })

  const consumer = await recvTransport.consume({
    id: consumerParams.id,
    producerId: consumerParams.producer_id,
    kind: consumerParams.kind as "audio" | "video",
    rtpParameters: consumerParams.rtpParameters as Parameters<
      typeof recvTransport.consume
    >[0]["rtpParameters"],
  })

  return {
    consumer,
    stream: new MediaStream([consumer.track]),
  }
}
