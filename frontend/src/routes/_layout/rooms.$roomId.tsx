import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeft, MessageSquareMore, Monitor, ShieldAlert, Video } from "lucide-react"
import { type RefObject, useEffect, useRef, useState } from "react"

import {
  getProctoringRoom,
  joinProctoringRoom,
} from "@/components/Proctoring/api"
import {
  createDeviceForRoom,
  publishStudentStreams,
  type StudentPublishingSession,
} from "@/components/Proctoring/mediasoup"
import { MediaPermissionDialog } from "@/components/Proctoring/MediaPermissionDialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import useAuth from "@/hooks/useAuth"

export const Route = createFileRoute("/_layout/rooms/$roomId")({
  component: StudentRoomPage,
  head: () => ({
    meta: [
      {
        title: "Room - Live Proctoring",
      },
    ],
  }),
})

function StudentRoomPage() {
  const { user: currentUser } = useAuth()
  const { roomId } = Route.useParams()
  const navigate = Route.useNavigate()
  const [permissionDialogOpen, setPermissionDialogOpen] = useState(true)
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null)
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null)
  const [publishingStatus, setPublishingStatus] = useState<
    "idle" | "starting" | "active" | "error"
  >("idle")
  const [publishingError, setPublishingError] = useState<string | null>(null)
  const [replyText, setReplyText] = useState("")
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "proctor-1",
      sender: "proctor",
      body: "Your session is being monitored. Keep your face visible at all times.",
      timestamp: "10:02 AM",
    },
    {
      id: "proctor-2",
      sender: "proctor",
      body: "If you face a technical issue, reply here before leaving the room.",
      timestamp: "10:03 AM",
    },
  ])
  const webcamVideoRef = useRef<HTMLVideoElement | null>(null)
  const screenVideoRef = useRef<HTMLVideoElement | null>(null)
  const publishingStartedRef = useRef(false)
  const publishingSessionRef = useRef<StudentPublishingSession | null>(null)
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
    if (currentUser?.is_superuser || currentUser?.role === "staff") {
      void navigate({ to: "/" })
    }
  }, [currentUser, navigate])

  useEffect(() => {
    if (!currentUser || currentUser.is_superuser || currentUser.role === "staff") {
      return
    }
    if (!room || joinRoomMutation.isSuccess || joinRoomMutation.isPending) {
      return
    }
    joinRoomMutation.mutate()
  }, [currentUser, joinRoomMutation, room])

  useEffect(() => {
    async function startPublishing() {
      if (
        !room ||
        !webcamStream ||
        !screenStream ||
        !joinRoomMutation.isSuccess ||
        publishingStartedRef.current
      ) {
        return
      }

      publishingStartedRef.current = true
      setPublishingStatus("starting")
      setPublishingError(null)

      try {
        const device = await createDeviceForRoom(room.id)
        const session = await publishStudentStreams(room.id, device, {
          webcamStream,
          screenStream,
        })
        publishingSessionRef.current = session
        setPublishingStatus("active")
      } catch (error) {
        publishingStartedRef.current = false
        setPublishingStatus("error")
        setPublishingError(
          error instanceof Error ? error.message : "Failed to publish media"
        )
      }
    }

    void startPublishing()
  }, [joinRoomMutation.isSuccess, room, screenStream, webcamStream])

  useEffect(() => {
    const webcamVideoTrack = webcamStream?.getVideoTracks()[0]
    const screenVideoTrack = screenStream?.getVideoTracks()[0]

    function handleWebcamEnded() {
      console.log("Webcam video track ended")
    }

    function handleScreenEnded() {
      console.log("Screen share video track ended")
    }

    webcamVideoTrack?.addEventListener("ended", handleWebcamEnded)
    screenVideoTrack?.addEventListener("ended", handleScreenEnded)

    return () => {
      webcamVideoTrack?.removeEventListener("ended", handleWebcamEnded)
      screenVideoTrack?.removeEventListener("ended", handleScreenEnded)
    }
  }, [webcamStream, screenStream])

  useEffect(() => {
    return () => {
      publishingSessionRef.current?.audioProducer?.close()
      publishingSessionRef.current?.videoProducer?.close()
      publishingSessionRef.current?.screenProducer?.close()
      publishingSessionRef.current?.sendTransport.close()
      webcamStream?.getTracks().forEach((track) => track.stop())
      screenStream?.getTracks().forEach((track) => track.stop())
    }
  }, [webcamStream, screenStream])

  useEffect(() => {
    if (webcamVideoRef.current) {
      webcamVideoRef.current.srcObject = webcamStream
    }
  }, [webcamStream])

  useEffect(() => {
    if (screenVideoRef.current) {
      screenVideoRef.current.srcObject = screenStream
    }
  }, [screenStream])

  function handleSendReply() {
    const trimmedReply = replyText.trim()
    if (!trimmedReply) {
      return
    }

    setChatMessages((currentMessages) => [
      ...currentMessages,
      {
        id: `student-${Date.now()}`,
        sender: "student",
        body: trimmedReply,
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
    ])
    setReplyText("")
  }

  return (
    <>
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
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="max-w-2xl truncate text-2xl">{room.name}</h1>
            <p className="text-muted-foreground">
              This room is currently monitoring your webcam feed, audio, and
              screen share for proctoring.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/">
              <ArrowLeft />
              Back to Rooms
            </Link>
          </Button>
        </div>

        <Card>
          <CardHeader className="gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="secondary">Live Proctoring</Badge>
              <Badge variant="outline">Session active</Badge>
            </div>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <CardTitle className="text-3xl">
                  You are being proctored during this session
                </CardTitle>
                <CardDescription className="max-w-3xl text-base leading-7">
                  Keep your webcam with audio and your full screen available
                  throughout the exam. If either video track ends, we currently
                  log that event while we wire the next part of the flow.
                </CardDescription>
              </div>
              <div className="grid gap-3 sm:grid-cols-3 lg:w-[420px]">
                <StatusPill
                  icon={ShieldAlert}
                  label="Monitoring"
                  value="Webcam + screen required"
                />
                <StatusPill
                  icon={Video}
                  label="Webcam"
                  value={webcamStream ? "Connected" : "Awaiting"}
                />
                <StatusPill
                  icon={Monitor}
                  label="Screen"
                  value={screenStream ? "Connected" : "Awaiting"}
                />
                <StatusPill
                  icon={Video}
                  label="Publishing"
                  value={
                    publishingStatus === "active"
                      ? "Live"
                      : publishingStatus === "starting"
                        ? "Starting"
                        : publishingStatus === "error"
                          ? "Error"
                          : "Pending"
                  }
                />
              </div>
            </div>
          </CardHeader>
        </Card>

        {publishingError ? (
          <Card>
            <CardContent className="py-4 text-sm text-destructive">
              {publishingError}
            </CardContent>
          </Card>
        ) : null}

        <div className="grid items-stretch gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="h-full">
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-xl">Candidate Capture Surfaces</CardTitle>
                  <CardDescription>
                    Live previews update here after the required permissions are granted.
                  </CardDescription>
                </div>
                <Badge variant="outline">Student view</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid h-full gap-4 lg:grid-cols-2">
                <PreviewTile
                  label="Webcam + Audio"
                  stream={webcamStream}
                  videoRef={webcamVideoRef}
                  muted
                />
                <PreviewTile
                  label="Screen Share"
                  stream={screenStream}
                  videoRef={screenVideoRef}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="flex h-full min-h-[620px] flex-col">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquareMore className="size-5" />
                    Chat With Proctor
                  </CardTitle>
                  <CardDescription>
                    Messages shown here are specific to you.
                  </CardDescription>
                </div>
                <Badge variant="secondary">Dummy</Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-4">
              <div className="flex min-h-0 flex-1 flex-col gap-4">
                <div className="bg-muted/30 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-xl border p-3">
                  <div className="text-muted-foreground rounded-lg border bg-background px-4 py-3 text-xs leading-6">
                    Replies here are private to this room. Socket wiring comes
                    next; this panel is ready for that flow.
                  </div>
                  {chatMessages.map((message) => (
                    <ChatBubble key={message.id} message={message} />
                  ))}
                </div>
                <div className="rounded-xl border bg-background p-3">
                  <div className="flex gap-2">
                    <Input
                      value={replyText}
                      onChange={(event) => setReplyText(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault()
                          handleSendReply()
                        }
                      }}
                      placeholder="Reply to the proctor"
                    />
                    <Button onClick={handleSendReply} disabled={!replyText.trim()}>
                      Send
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      ) : null}

      <MediaPermissionDialog
        open={permissionDialogOpen}
        onOpenChange={setPermissionDialogOpen}
        roomName={room?.name}
        onComplete={({ webcamStream, screenStream }) => {
          setWebcamStream(webcamStream)
          setScreenStream(screenStream)
          console.log("Student media permissions granted", {
            roomId: room?.id,
            roomName: room?.name,
            webcamTracks: webcamStream.getTracks().map((track) => track.kind),
            screenTracks: screenStream.getTracks().map((track) => track.kind),
          })
        }}
      />
    </>
  )
}

type ChatMessage = {
  id: string
  sender: "proctor" | "student"
  body: string
  timestamp: string
}

function StatusPill({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ShieldAlert
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

function PreviewTile({
  label,
  stream,
  videoRef,
  muted = false,
}: {
  label: string
  stream: MediaStream | null
  videoRef: RefObject<HTMLVideoElement | null>
  muted?: boolean
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-muted/30">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <div className="text-sm font-medium">{label}</div>
          <div className="text-muted-foreground text-xs">
            {stream ? "Live preview feed" : "Waiting for permission grant"}
          </div>
        </div>
        <Badge variant={stream ? "default" : "secondary"}>
          {stream ? "Connected" : "Awaiting permission"}
        </Badge>
      </div>
      {stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          className="aspect-[16/11] w-full bg-black object-cover"
        />
      ) : (
        <div className="flex aspect-[16/11] flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="bg-background rounded-full border border-dashed p-4">
            {label.includes("Screen") ? (
              <Monitor className="text-muted-foreground size-6" />
            ) : (
              <Video className="text-muted-foreground size-6" />
            )}
          </div>
          <div className="space-y-1">
            <div className="text-sm font-medium">Preview unavailable</div>
            <div className="text-muted-foreground text-sm">
              Stream preview appears here after permission is granted.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isStudentMessage = message.sender === "student"

  return (
    <div
      className={`flex ${
        isStudentMessage ? "justify-end" : "justify-start"
      }`}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
          isStudentMessage
            ? "bg-primary text-primary-foreground"
            : "bg-background border"
        }`}
      >
        <div className="mb-1 flex items-center justify-between gap-3 text-[11px] opacity-75">
          <span className="font-medium">
            {isStudentMessage ? "You" : "Proctor"}
          </span>
          <span>{message.timestamp}</span>
        </div>
        <div>{message.body}</div>
      </div>
    </div>
  )
}
