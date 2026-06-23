import { createFileRoute } from "@tanstack/react-router"

import { StaffDashboard } from "@/components/Proctoring/StaffDashboard"
import { StudentDashboard } from "@/components/Proctoring/StudentDashboard"
import { Card, CardContent } from "@/components/ui/card"
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

function Dashboard() {
  const { user: currentUser, error, isPending } = useAuth()
  const isStaff = !!currentUser && (currentUser.is_superuser || currentUser.role === "staff")

  if (isPending) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Loading dashboard...
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-destructive">
          {error.message}
        </CardContent>
      </Card>
    )
  }

  if (!currentUser) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Unable to load your account details.
        </CardContent>
      </Card>
    )
  }

  if (!isStaff) {
    return <StudentDashboard />
  }

  return (
    <StaffDashboard
      displayName={currentUser.full_name || currentUser.email}
    />
  )
}
