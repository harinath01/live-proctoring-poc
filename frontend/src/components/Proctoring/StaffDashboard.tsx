import { Link } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { ExternalLink, Users } from "lucide-react"

import {
  createProctoringRoom,
  listProctoringRooms,
} from "@/components/Proctoring/api"
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
import useCustomToast from "@/hooks/useCustomToast"

type StaffDashboardProps = {
  displayName: string
}

export function StaffDashboard({ displayName }: StaffDashboardProps) {
  const [roomName, setRoomName] = useState("")
  const queryClient = useQueryClient()
  const { showErrorToast, showSuccessToast } = useCustomToast()
  const { data, isLoading, error } = useQuery({
    queryKey: ["proctoring-rooms"],
    queryFn: listProctoringRooms,
  })
  const createRoomMutation = useMutation({
    mutationFn: createProctoringRoom,
    onSuccess: () => {
      setRoomName("")
      showSuccessToast("Room created")
      queryClient.invalidateQueries({ queryKey: ["proctoring-rooms"] })
    },
    onError: (mutationError: Error) => {
      showErrorToast(mutationError.message)
    },
  })

  const rooms = data?.data ?? []

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="max-w-sm truncate text-2xl">Hi, {displayName}</h1>
        <p className="text-muted-foreground">
          Monitor and manage live proctoring sessions
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Create Room</CardTitle>
          <CardDescription>
            Room creation is app-level only. The mediasoup router will be created
            when the first participant or staff media session starts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              const trimmedRoomName = roomName.trim()
              if (!trimmedRoomName) {
                return
              }
              createRoomMutation.mutate(trimmedRoomName)
            }}
          >
            <Input
              value={roomName}
              onChange={(event) => setRoomName(event.target.value)}
              placeholder="Enter room name"
            />
            <Button
              type="submit"
              disabled={createRoomMutation.isPending || !roomName.trim()}
            >
              {createRoomMutation.isPending ? "Creating..." : "Create Room"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {isLoading ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Loading rooms...
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-destructive">
            {error.message}
          </CardContent>
        </Card>
      ) : null}

      {!isLoading && !error && rooms.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No proctoring rooms yet. Create one to start a monitoring session.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {rooms.map((room) => (
          <Card key={room.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{room.name}</CardTitle>
                <Badge
                  variant={room.active_student_count > 0 ? "default" : "secondary"}
                >
                  {room.active_student_count > 0 ? "active" : "scheduled"}
                </Badge>
              </div>
              <CardDescription>
                <span className="flex items-center gap-1">
                  <Users className="size-3" />
                  {room.active_student_count} connected students
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full" variant="outline">
                <Link to="/monitor/$roomId" params={{ roomId: room.id }}>
                  <ExternalLink />
                  Monitor Room
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
