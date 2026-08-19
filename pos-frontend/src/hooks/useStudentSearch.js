import { useMemo } from 'react'

const identity = (student) => student

export function computeStudentSearch(
  students,
  query,
  {
    minQueryLength = 0,
    emptyResult = 'all',
    bidirectional = false,
    matchPhone = true,
    minPhoneDigits = 0,
    limit,
    mode = 'filter',
    getTarget = identity,
  } = {},
) {
  const term = (query || '').trim().toLowerCase()
  const termDigits = term.replace(/\D/g, '')
  const effectiveTerm = term.length >= minQueryLength ? term : ''
  if (!effectiveTerm) {
    if (mode === 'find') return { filteredStudents: null }
    return { filteredStudents: emptyResult === 'all' ? students : [] }
  }
  const matches = (item) => {
    const target = getTarget(item)
    const name = (target?.name || '').toLowerCase()
    const byName = name.includes(effectiveTerm)
    const byNameReverse = bidirectional && effectiveTerm.includes(name)
    const byPhone =
      matchPhone &&
      termDigits.length >= minPhoneDigits &&
      (target?.phone || '').replace(/\D/g, '').includes(termDigits)
    return Boolean(byName || byNameReverse || byPhone)
  }
  if (mode === 'find') {
    return { filteredStudents: students.find(matches) ?? null }
  }
  const filtered = students.filter(matches)
  return { filteredStudents: limit ? filtered.slice(0, limit) : filtered }
}

export default function useStudentSearch({ students, query, options = {} }) {
  const {
    minQueryLength = 0,
    emptyResult = 'all',
    bidirectional = false,
    matchPhone = true,
    minPhoneDigits = 0,
    limit,
    mode = 'filter',
    getTarget = identity,
  } = options

  return useMemo(
    () =>
      computeStudentSearch(students, query, {
        minQueryLength,
        emptyResult,
        bidirectional,
        matchPhone,
        minPhoneDigits,
        limit,
        mode,
        getTarget,
      }),
    [students, query, minQueryLength, emptyResult, bidirectional, matchPhone, minPhoneDigits, limit, mode, getTarget],
  )
}
