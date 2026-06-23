import { createFileRoute } from "@tanstack/react-router"
import { ExternalLink, Users } from "lucide-react"

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

export const Route = createFileRoute("/_layout/")({
  component: Dashboard,
  head: () => ({
    meta: [
      {
        title: "Dashboard - Live Proctoring",
      },
    ],
  }),
})

const mockRooms = [
  { id: "1", name: "Math Exam - Room A", status: "active", candidateCount: 12 },
  {
    id: "2",
    name: "Science Quiz - Room B",
    status: "active",
    candidateCount: 8,
  },
  {
    id: "3",
    name: "History Test - Room C",
    status: "scheduled",
    candidateCount: 0,
  },
]

function Dashboard() {
  const { user: currentUser } = useAuth()

  if (!currentUser) return null

  const isStaff = currentUser.is_superuser || currentUser.role === "staff"

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl truncate max-w-sm">
          Hi, {currentUser?.full_name || currentUser?.email}
        </h1>
        <p className="text-muted-foreground">
          {isStaff
            ? "Monitor and manage live proctoring sessions"
            : "Join your scheduled proctoring sessions"}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {mockRooms.map((room) => (
          <Card key={room.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{room.name}</CardTitle>
                <Badge
                  variant={room.status === "active" ? "default" : "secondary"}
                >
                  {room.status}
                </Badge>
              </div>
              <CardDescription>
                {isStaff && (
                  <span className="flex items-center gap-1">
                    <Users className="size-3" />
                    {room.candidateCount} candidates
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" variant="outline" disabled>
                <ExternalLink />
                {isStaff ? "Monitor Room" : "Join Room"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
