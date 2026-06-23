import { createFileRoute } from "@tanstack/react-router"

import { StaffDashboard } from "@/components/Proctoring/StaffDashboard"
import { StudentDashboard } from "@/components/Proctoring/StudentDashboard"
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
  const { user: currentUser } = useAuth()
  const isStaff = !!currentUser && (currentUser.is_superuser || currentUser.role === "staff")

  if (!currentUser) return null

  if (!isStaff) {
    return <StudentDashboard />
  }

  return (
    <StaffDashboard
      displayName={currentUser.full_name || currentUser.email}
    />
  )
}
