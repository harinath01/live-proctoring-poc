import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { type RefObject, useEffect, useRef, useState } from "react"

import { MediaPermissionDialog } from "@/components/Proctoring/MediaPermissionDialog"
import { getMockRoomById } from "@/components/Proctoring/mockRooms"
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

export const Route = createFileRoute("/_layout/rooms/$roomId")({
  loader: ({ params }) => {
    const room = getMockRoomById(params.roomId)

    if (!room) {
      throw redirect({ to: "/" })
    }

    return { room }
  },
  component: StudentRoomPage,
  head: ({ loaderData }) => ({
    meta: [
      {
        title: `${loaderData?.room.name ?? "Room"} - Live Proctoring`,
      },
    ],
  }),
})

function StudentRoomPage() {
  const { user: currentUser } = useAuth()
  const { room } = Route.useLoaderData()
  const navigate = Route.useNavigate()
  const [permissionDialogOpen, setPermissionDialogOpen] = useState(true)
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null)
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null)
  const webcamVideoRef = useRef<HTMLVideoElement | null>(null)
  const screenVideoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    if (currentUser?.is_superuser || currentUser?.role === "staff") {
      void navigate({ to: "/" })
    }
  }, [currentUser, navigate])

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

  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="max-w-2xl truncate text-2xl">{room.name}</h1>
            <p className="text-muted-foreground">
              This room is currently monitoring your webcam feed and screen
              share for proctoring.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/">
              <ArrowLeft />
              Back to Rooms
            </Link>
          </Button>
        </div>

        <Card className="border-2">
          <CardHeader className="gap-4 text-center">
            <div className="flex justify-center">
              <Badge className="rounded-full px-3 py-1" variant="secondary">
                Live Proctoring Active
              </Badge>
            </div>
            <CardTitle className="text-3xl">
              You are being proctored during this session
            </CardTitle>
            <CardDescription className="mx-auto max-w-2xl text-base leading-7">
              Keep your webcam with audio and your full screen available while
              you remain in this room. If either video track ends, we currently
              log that event so we can wire the next step of the flow.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <div className="grid w-full gap-4 lg:grid-cols-2">
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
      </div>

      <MediaPermissionDialog
        open={permissionDialogOpen}
        onOpenChange={setPermissionDialogOpen}
        roomName={room.name}
        onComplete={({ webcamStream, screenStream }) => {
          setWebcamStream(webcamStream)
          setScreenStream(screenStream)
          console.log("Student media permissions granted", {
            roomId: room.id,
            roomName: room.name,
            webcamTracks: webcamStream.getTracks().map((track) => track.kind),
            screenTracks: screenStream.getTracks().map((track) => track.kind),
          })
        }}
      />
    </>
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
        <div className="text-sm font-medium">{label}</div>
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
          className="aspect-video w-full bg-black object-cover"
        />
      ) : (
        <div className="text-muted-foreground flex aspect-video items-center justify-center px-6 text-sm">
          Stream preview appears here after permission is granted.
        </div>
      )}
    </div>
  )
}
