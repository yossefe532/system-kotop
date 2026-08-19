import { describe, it, expect } from 'vitest'
import { isStudentDuplicate } from './studentService'

const students = [
  { id: 1, name: 'Maha El-Sayed', phone: '+20 10 1234 5678', balance: 0 },
  { id: 2, name: 'Yousef Khaled', phone: '+20 12 2222 3344', balance: 50 },
  { id: 3, name: 'Amina Mostafa', phone: '+20 11 4455 6677', balance: -20 },
]

describe('isStudentDuplicate', () => {
  it('detects duplicate by exact phone match', () => {
    expect(isStudentDuplicate(students, { name: 'New Name', phone: '+20 10 1234 5678' })).toBe(true)
  })

  it('detects duplicate by exact name match (case-insensitive)', () => {
    expect(isStudentDuplicate(students, { name: 'maha el-sayed', phone: '+20 10 9999 9999' })).toBe(true)
  })

  it('detects duplicate by uppercase name', () => {
    expect(isStudentDuplicate(students, { name: 'AMINA MOSTAFA', phone: '+20 10 0000 0000' })).toBe(true)
  })

  it('returns false when both phone and name are new', () => {
    expect(isStudentDuplicate(students, { name: 'New Student', phone: '+20 10 0000 0000' })).toBe(false)
  })

  it('returns false for empty collection', () => {
    expect(isStudentDuplicate([], { name: 'Maha El-Sayed', phone: '+20 10 1234 5678' })).toBe(false)
  })

  it('matches name even with different phone', () => {
    expect(isStudentDuplicate(students, { name: 'Yousef Khaled', phone: '+20 15 0000 0000' })).toBe(true)
  })

  it('matches phone even with different name', () => {
    expect(isStudentDuplicate(students, { name: 'Completely Different', phone: '+20 11 4455 6677' })).toBe(true)
  })
})
