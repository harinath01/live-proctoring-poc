import { Link } from "@tanstack/react-router"
import { ExternalLink } from "lucide-react"

import { mockRooms } from "@/components/Proctoring/mockRooms"
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
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="max-w-sm truncate text-2xl">Your Proctored Sessions</h1>
        <p className="text-muted-foreground">
          Choose your assigned room to enter the monitored session.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {mockRooms.map((room) => (
          <Card key={room.id}>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-lg">{room.name}</CardTitle>
                <Badge
                  variant={room.status === "active" ? "default" : "secondary"}
                >
                  {room.status}
                </Badge>
              </div>
              <CardDescription>{room.scheduleLabel}</CardDescription>
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
