import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeft, Monitor, Users, Video } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import {
  getProctoringRoom,
  joinProctoringRoom,
  listRoomProducers,
  type ProctoringRoom,
} from "@/components/Proctoring/api"
import {
  consumeProducerTrack,
  createDeviceForRoom,
  createRecvTransportForRoom,
} from "@/components/Proctoring/mediasoup"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import useAuth from "@/hooks/useAuth"

export const Route = createFileRoute("/_layout/monitor/$roomId")({
  component: StaffMonitorPage,
  head: () => ({
    meta: [
      {
        title: "Monitor Room - Live Proctoring",
      },
    ],
  }),
})

type MonitorTile = {
  id: string
  participantId: string
  label: string
  source: "webcam" | "screen"
  stream: MediaStream | null
}

function StaffMonitorPage() {
  const { user: currentUser } = useAuth()
  const { roomId } = Route.useParams()
  const navigate = Route.useNavigate()
  const [monitorStatus, setMonitorStatus] = useState<
    "idle" | "starting" | "active" | "error"
  >("idle")
  const [monitorError, setMonitorError] = useState<string | null>(null)
  const [tiles, setTiles] = useState<MonitorTile[]>([])
  const deviceRef = useRef<Awaited<ReturnType<typeof createDeviceForRoom>> | null>(
    null
  )
  const recvTransportRef = useRef<Awaited<
    ReturnType<typeof createRecvTransportForRoom>
  > | null>(null)
  const consumedProducerIdsRef = useRef<Set<string>>(new Set())
  const tileStreamMapRef = useRef<Map<string, MediaStream>>(new Map())
  const monitorStartedRef = useRef(false)

  const {
    data: room,
    isLoading: isRoomLoading,
    error: roomError,
  } = useQuery({
    queryKey: ["proctoring-room", roomId],
    queryFn: () => getProctoringRoom(roomId),
  })
  const joinRoomMutation = useMutation({
    mutationFn: () => joinProctoringRoom(roomId),
  })

  useEffect(() => {
    if (currentUser && !currentUser.is_superuser && currentUser.role !== "staff") {
      void navigate({ to: "/" })
    }
  }, [currentUser, navigate])

  useEffect(() => {
    if (!currentUser || (!currentUser.is_superuser && currentUser.role !== "staff")) {
      return
    }
    if (!room || joinRoomMutation.isSuccess || joinRoomMutation.isPending) {
      return
    }
    joinRoomMutation.mutate()
  }, [currentUser, joinRoomMutation, room])

  useEffect(() => {
    async function startMonitor() {
      if (!room || !joinRoomMutation.isSuccess || monitorStartedRef.current) {
        return
      }

      monitorStartedRef.current = true
      setMonitorStatus("starting")
      setMonitorError(null)

      try {
        const device = await createDeviceForRoom(room.id)
        const recvTransport = await createRecvTransportForRoom(room.id, device)
        deviceRef.current = device
        recvTransportRef.current = recvTransport
        setMonitorStatus("active")
      } catch (error) {
        monitorStartedRef.current = false
        setMonitorStatus("error")
        setMonitorError(
          error instanceof Error ? error.message : "Failed to start monitor"
        )
      }
    }

    void startMonitor()
  }, [joinRoomMutation.isSuccess, room])

  useEffect(() => {
    if (monitorStatus !== "active" || !room) {
      return
    }

    const activeRoomId = room.id
    let cancelled = false

    async function syncProducers() {
      if (!deviceRef.current || !recvTransportRef.current) {
        return
      }

      try {
        const response = await listRoomProducers(activeRoomId)

        for (const producerRow of response.producers) {
          if (producerRow.webcam_producer_id) {
            await consumeTileProducer({
              producerId: producerRow.webcam_producer_id,
              tileId: `${producerRow.user_id}-webcam`,
              label: `Student ${producerRow.user_id.slice(0, 8)} webcam`,
              participantId: producerRow.user_id,
              source: "webcam",
              cancelled,
            })
          }

          if (producerRow.audio_producer_id && producerRow.webcam_producer_id) {
            await consumeTileProducer({
              producerId: producerRow.audio_producer_id,
              tileId: `${producerRow.user_id}-webcam`,
              label: `Student ${producerRow.user_id.slice(0, 8)} webcam`,
              participantId: producerRow.user_id,
              source: "webcam",
              cancelled,
            })
          }

          if (producerRow.screen_producer_id) {
            await consumeTileProducer({
              producerId: producerRow.screen_producer_id,
              tileId: `${producerRow.user_id}-screen`,
              label: `Student ${producerRow.user_id.slice(0, 8)} screen`,
              participantId: producerRow.user_id,
              source: "screen",
              cancelled,
            })
          }
        }
      } catch (error) {
        if (!cancelled) {
          setMonitorError(
            error instanceof Error ? error.message : "Failed to sync producers"
          )
        }
      }
    }

    async function consumeTileProducer(args: {
      producerId: string
      tileId: string
      label: string
      participantId: string
      source: "webcam" | "screen"
      cancelled: boolean
    }) {
      if (
        args.cancelled ||
        consumedProducerIdsRef.current.has(args.producerId) ||
        !deviceRef.current ||
        !recvTransportRef.current
      ) {
        return
      }

      consumedProducerIdsRef.current.add(args.producerId)

      try {
        const { consumer, stream } = await consumeProducerTrack(
          activeRoomId,
          deviceRef.current,
          recvTransportRef.current,
          args.producerId
        )

        const existingStream = tileStreamMapRef.current.get(args.tileId)
        const nextStream = existingStream
          ? new MediaStream([
              ...existingStream.getTracks(),
              ...stream.getTracks().filter(
                (track) =>
                  !existingStream.getTracks().some(
                    (existingTrack) => existingTrack.kind === track.kind
                  )
              ),
            ])
          : stream

        tileStreamMapRef.current.set(args.tileId, nextStream)
        setTiles((currentTiles) => {
          const existingTileIndex = currentTiles.findIndex(
            (tile) => tile.id === args.tileId
          )
          if (existingTileIndex >= 0) {
            const nextTiles = [...currentTiles]
            nextTiles[existingTileIndex] = {
              ...nextTiles[existingTileIndex],
              stream: nextStream,
            }
            return nextTiles
          }
          return [
            ...currentTiles,
            {
              id: args.tileId,
              label: args.label,
              participantId: args.participantId,
              source: args.source,
              stream: nextStream,
            },
          ]
        })

        consumer.on("transportclose", () => {
          consumedProducerIdsRef.current.delete(args.producerId)
        })
      } catch (error) {
        consumedProducerIdsRef.current.delete(args.producerId)
        throw error
      }
    }

    void syncProducers()
    const intervalId = window.setInterval(() => {
      void syncProducers()
    }, 3000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [monitorStatus, room])

  useEffect(() => {
    return () => {
      recvTransportRef.current?.close()
      for (const stream of tileStreamMapRef.current.values()) {
        stream.getTracks().forEach((track) => track.stop())
      }
    }
  }, [])

  const activeTileCount = useMemo(
    () => tiles.filter((tile) => tile.stream).length,
    [tiles]
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="max-w-2xl truncate text-2xl">
            {room?.name ?? "Monitor Room"}
          </h1>
          <p className="text-muted-foreground">
            View all available student webcam and screen producers for this room.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/">
            <ArrowLeft />
            Back to Rooms
          </Link>
        </Button>
      </div>

      {isRoomLoading ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Loading room...
          </CardContent>
        </Card>
      ) : null}

      {roomError ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-destructive">
            {roomError.message}
          </CardContent>
        </Card>
      ) : null}

      {!isRoomLoading && !roomError && room ? (
        <>
          <Card>
            <CardHeader className="gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="secondary">Staff Monitor</Badge>
                <Badge variant="outline">
                  {monitorStatus === "active"
                    ? "Receiving"
                    : monitorStatus === "starting"
                      ? "Starting"
                      : monitorStatus === "error"
                        ? "Error"
                        : "Pending"}
                </Badge>
              </div>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <CardTitle className="text-3xl">Monitor Live Producers</CardTitle>
                  <CardDescription className="max-w-3xl text-base leading-7">
                    This page creates one mediasoup receive transport and consumes
                    student webcam and screen producers into a monitor grid.
                  </CardDescription>
                </div>
                <div className="grid gap-3 sm:grid-cols-3 lg:w-[420px]">
                  <MonitorStat icon={Users} label="Students" value={String(room.active_student_count)} />
                  <MonitorStat icon={Video} label="Tiles" value={String(activeTileCount)} />
                  <MonitorStat
                    icon={Monitor}
                    label="Status"
                    value={monitorStatus === "active" ? "Live" : monitorStatus}
                  />
                </div>
              </div>
            </CardHeader>
          </Card>

          {monitorError ? (
            <Card>
              <CardContent className="py-4 text-sm text-destructive">
                {monitorError}
              </CardContent>
            </Card>
          ) : null}

          {tiles.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                No producers available yet. Student webcam and screen tiles will
                appear here once they publish.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {tiles.map((tile) => (
                <MonitorTileCard key={tile.id} room={room} tile={tile} />
              ))}
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}

function MonitorStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border bg-muted/30 px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="bg-background flex size-10 items-center justify-center rounded-full border">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="text-muted-foreground text-xs font-medium uppercase">
            {label}
          </div>
          <div className="truncate text-sm">{value}</div>
        </div>
      </div>
    </div>
  )
}

function MonitorTileCard({
  tile,
}: {
  room: ProctoringRoom
  tile: MonitorTile
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    if (videoRef.current && tile.stream) {
      videoRef.current.srcObject = tile.stream
      void videoRef.current.play().catch((error: unknown) => {
        console.error("Failed to start monitor tile playback", error)
      })
    }
  }, [tile.stream])

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg">{tile.label}</CardTitle>
            <CardDescription>
              {tile.source === "webcam" ? "Webcam feed" : "Screen share feed"}
            </CardDescription>
          </div>
          <Badge variant={tile.stream ? "default" : "secondary"}>
            {tile.stream ? "Live" : "Pending"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {tile.stream ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="aspect-video w-full rounded-lg border bg-black object-cover"
          />
        ) : (
          <div className="text-muted-foreground flex aspect-video items-center justify-center rounded-lg border bg-muted/30 text-sm">
            Waiting for producer stream...
          </div>
        )}
      </CardContent>
    </Card>
  )
}
