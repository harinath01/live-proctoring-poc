import { ExternalLink, Users } from "lucide-react"

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

type StaffDashboardProps = {
  displayName: string
}

export function StaffDashboard({ displayName }: StaffDashboardProps) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="max-w-sm truncate text-2xl">Hi, {displayName}</h1>
        <p className="text-muted-foreground">
          Monitor and manage live proctoring sessions
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
                <span className="flex items-center gap-1">
                  <Users className="size-3" />
                  {room.candidateCount} candidates
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" variant="outline" disabled>
                <ExternalLink />
                Monitor Room
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
