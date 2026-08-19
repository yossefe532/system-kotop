export function findReservationsBySearch(search, students, pendingReservations, salesHistory) {
  const term = (search || '').trim().toLowerCase()
  if (!term) return { student: null, reservations: [], candidates: [] }

  // 1. Try Transaction ID first
  const txMatch = term.match(/^ed-?(\d+)$/i)
  if (txMatch) {
    const txId = `ED-${String(parseInt(txMatch[1], 10)).padStart(4, '0')}`
    const sale = salesHistory.find((s) => s.id === txId)
    if (sale?.student) {
      const res = pendingReservations.filter((r) => r.studentId === sale.student.id)
      return { student: sale.student, reservations: res, candidates: [] }
    }
  }

  // 2. Find ALL matching students
  const termDigits = term.replace(/\D/g, '')
  const matchedStudents = students.filter((s) => {
    const name = (s.name || '').toLowerCase()
    const phoneDigits = (s.phone || '').replace(/\D/g, '')
    const phoneExact = termDigits.length >= 7 && phoneDigits === termDigits
    const phonePartial = termDigits.length >= 7 && phoneDigits.includes(termDigits)
    const nameExact = name === term
    const nameStarts = term.length >= 2 && name.startsWith(term)
    const nameContains = term.length >= 3 && name.includes(term)
    return phoneExact || phonePartial || nameExact || nameStarts || nameContains
  })

  if (matchedStudents.length === 0) return { student: null, reservations: [], candidates: [] }

  const rank = (s) => {
    const name = (s.name || '').toLowerCase()
    const phoneDigits = (s.phone || '').replace(/\D/g, '')
    const hasRes = pendingReservations.some((r) => r.studentId === s.id) ? 1 : 0
    const phoneExact = termDigits.length >= 7 && phoneDigits === termDigits ? 1 : 0
    const nameExact = name === term ? 1 : 0
    const starts = name.startsWith(term) ? 1 : 0
    return hasRes * 100 + phoneExact * 40 + nameExact * 30 + starts * 10
  }
  const sorted = [...matchedStudents].sort((a, b) => rank(b) - rank(a))
  const candidates = sorted.filter((s) => pendingReservations.some((r) => r.studentId === s.id))
  const exact = sorted.find((s) => {
    const name = (s.name || '').toLowerCase()
    const phoneDigits = (s.phone || '').replace(/\D/g, '')
    return name === term || (termDigits.length >= 7 && phoneDigits === termDigits)
  })
  if (!exact && candidates.length > 1) {
    return { student: null, reservations: [], candidates }
  }
  const bestMatch = exact || sorted[0]
  const res = pendingReservations.filter((r) => r.studentId === bestMatch.id)
  
  return { student: bestMatch, reservations: res, candidates: [] }
}
