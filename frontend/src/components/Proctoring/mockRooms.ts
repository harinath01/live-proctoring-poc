export type ProctoringRoom = {
  id: string
  name: string
  status: "active" | "scheduled"
  scheduleLabel: string
  candidateCount: number
}

export const mockRooms: ProctoringRoom[] = [
  {
    id: "1",
    name: "Math Exam - Room A",
    status: "active",
    scheduleLabel: "Starts now",
    candidateCount: 12,
  },
  {
    id: "2",
    name: "Science Quiz - Room B",
    status: "active",
    scheduleLabel: "Starts now",
    candidateCount: 8,
  },
  {
    id: "3",
    name: "History Test - Room C",
    status: "scheduled",
    scheduleLabel: "Starts at 3:00 PM",
    candidateCount: 0,
  },
]

export function getMockRoomById(roomId: string) {
  return mockRooms.find((room) => room.id === roomId) ?? null
}
