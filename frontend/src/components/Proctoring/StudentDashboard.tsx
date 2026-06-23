import { Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { ExternalLink } from "lucide-react"

import { listProctoringRooms } from "@/components/Proctoring/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export function StudentDashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["proctoring-rooms"],
    queryFn: listProctoringRooms,
  })

  const rooms = data?.data ?? []

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="max-w-sm truncate text-2xl">Your Proctored Sessions</h1>
        <p className="text-muted-foreground">
          Choose your assigned room to enter the monitored session.
        </p>
      </div>

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
            No rooms are available yet.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {rooms.map((room) => (
          <Card key={room.id}>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-lg">{room.name}</CardTitle>
                <Badge
                  variant={room.active_student_count > 0 ? "default" : "secondary"}
                >
                  {room.active_student_count > 0 ? "active" : "scheduled"}
                </Badge>
              </div>
              <CardDescription>
                {room.active_student_count > 0
                  ? `${room.active_student_count} student${room.active_student_count === 1 ? "" : "s"} connected`
                  : "No students connected yet"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-muted-foreground text-sm leading-6">
                Joining opens the monitored room and requests the required media
                permissions.
              </p>
              <Button asChild className="w-full" variant="outline">
                <Link to="/rooms/$roomId" params={{ roomId: room.id }}>
                  <ExternalLink />
                  Join Room
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
