import { Monitor, Video } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type MediaPermissionDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  roomName?: string | null
  onComplete: (payload: {
    webcamStream: MediaStream
    screenStream: MediaStream
  }) => void
}

type PermissionState = "idle" | "requesting" | "granted" | "error"

export function MediaPermissionDialog({
  open,
  onOpenChange,
  roomName,
  onComplete,
}: MediaPermissionDialogProps) {
  const [webcamState, setWebcamState] = useState<PermissionState>("idle")
  const [screenState, setScreenState] = useState<PermissionState>("idle")
  const [webcamError, setWebcamError] = useState<string | null>(null)
  const [screenError, setScreenError] = useState<string | null>(null)
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null)
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null)
  const completedRef = useRef(false)

  useEffect(() => {
    if (open) {
      completedRef.current = false
      return
    }

    setWebcamState("idle")
    setScreenState("idle")
    setWebcamError(null)
    setScreenError(null)
  }, [open])

  useEffect(() => {
    if (!open || !webcamStream || !screenStream || completedRef.current) {
      return
    }

    completedRef.current = true
    onComplete({ webcamStream, screenStream })
    onOpenChange(false)
  }, [open, webcamStream, screenStream, onComplete, onOpenChange])

  async function handleRequestWebcam() {
    setWebcamState("requesting")
    setWebcamError(null)

    try {
      webcamStream?.getTracks().forEach((track) => track.stop())

      const nextWebcamStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      })

      setWebcamStream(nextWebcamStream)
      setWebcamState("granted")
    } catch (error) {
      setWebcamState("error")
      setWebcamError(
        error instanceof Error
          ? error.message
          : "Unable to access camera and microphone."
      )
    }
  }

  async function handleRequestScreen() {
    setScreenState("requesting")
    setScreenError(null)

    try {
      screenStream?.getTracks().forEach((track) => track.stop())

      const nextScreenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      })

      setScreenStream(nextScreenStream)
      setScreenState("granted")
    } catch (error) {
      setScreenState("error")
      setScreenError(
        error instanceof Error
          ? error.message
          : "Unable to access screen sharing."
      )
    }
  }

  const allGranted = webcamState === "granted" && screenState === "granted"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-6" showCloseButton={false}>
        <DialogHeader className="space-y-3">
          <div className="flex items-center justify-center sm:justify-start">
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              Proctoring Setup
            </Badge>
          </div>
          <DialogTitle className="text-2xl">
            Allow proctoring permissions
          </DialogTitle>
          <DialogDescription className="text-sm leading-6">
            Before you join
            {roomName ? ` ${roomName}` : " this room"}, allow webcam with audio
            and screen sharing. Each permission is requested separately.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <PermissionItem
            description="Used to capture your webcam feed and surrounding audio."
            errorMessage={webcamError}
            icon={Video}
            label="Webcam + Audio"
            onRequest={handleRequestWebcam}
            requestState={webcamState}
          />
          <PermissionItem
            description="Used to monitor the screen during the exam session."
            errorMessage={screenError}
            icon={Monitor}
            label="Screen Share"
            onRequest={handleRequestScreen}
            requestState={screenState}
          />
        </div>
        <p className="text-muted-foreground text-sm">
          {allGranted
            ? "Permissions granted. Continuing to the room."
            : "Grant both permissions to continue."}
        </p>
      </DialogContent>
    </Dialog>
  )
}

function PermissionItem({
  icon: Icon,
  label,
  description,
  requestState,
  errorMessage,
  onRequest,
}: {
  icon: typeof Video
  label: string
  description: string
  requestState: PermissionState
  errorMessage: string | null
  onRequest: () => void
}) {
  const isGranted = requestState === "granted"
  const isRequesting = requestState === "requesting"

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-4">
        <div className="bg-background flex size-10 shrink-0 items-center justify-center rounded-full border">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <div className="font-medium">{label}</div>
            <Badge variant={isGranted ? "default" : "secondary"}>
              {isGranted ? "Allowed" : "Pending"}
            </Badge>
          </div>
          <div className="text-muted-foreground text-sm">{description}</div>
          {errorMessage ? (
            <div className="text-sm text-destructive">{errorMessage}</div>
          ) : null}
        </div>
      </div>

      <Button
        type="button"
        onClick={onRequest}
        disabled={isRequesting || isGranted}
        className="sm:self-center"
      >
        {isGranted ? "Allowed" : isRequesting ? "Requesting..." : "Allow"}
      </Button>
    </div>
  )
}
