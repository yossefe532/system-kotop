import { isStudentDuplicate } from '../pos-frontend/src/modules/students/studentService.js'

// Parity harness for Wave 11 — studentService.js.
// Compares the extracted function against the original inline implementation
// that lived in App.jsx saveStudent:
//   students.some(s => s.phone === phone || s.name.toLowerCase() === name.toLowerCase())

function originalIsStudentDuplicate(students, { name, phone }) {
  return students.some((s) => s.phone === phone || s.name.toLowerCase() === name.toLowerCase())
}

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)
let failures = 0
let total = 0

function check(name, students, candidate) {
  total += 1
  const expected = originalIsStudentDuplicate(students, candidate)
  const actual = isStudentDuplicate(students, candidate)
  if (expected !== actual) {
    failures += 1
    console.log(`FAIL ${name} expected=${expected} actual=${actual}`)
  }
}

const students = [
  { id: 1, name: 'Maha El-Sayed', phone: '+20 10 1234 5678', balance: 0 },
  { id: 2, name: 'Yousef Khaled', phone: '+20 12 2222 3344', balance: 50 },
  { id: 3, name: 'Amina Mostafa', phone: '+20 11 4455 6677', balance: -20 },
]

// 1. normal — new student
check('normal new student', students, { name: 'New Student', phone: '+20 10 0000 0000' })
// 2. duplicate by phone
check('duplicate by phone', students, { name: 'New Name', phone: '+20 10 1234 5678' })
// 3. duplicate by name (exact case)
check('duplicate by name exact', students, { name: 'Maha El-Sayed', phone: '+20 10 0000 0000' })
// 4. duplicate by name (lowercase)
check('duplicate by name lowercase', students, { name: 'maha el-sayed', phone: '+20 10 0000 0000' })
// 5. duplicate by name (uppercase)
check('duplicate by name uppercase', students, { name: 'AMINA MOSTAFA', phone: '+20 10 0000 0000' })
// 6. empty collection
check('empty collection', [], { name: 'Maha El-Sayed', phone: '+20 10 1234 5678' })
// 7. name match with different phone
check('name match different phone', students, { name: 'Yousef Khaled', phone: '+20 15 0000 0000' })
// 8. phone match with different name
check('phone match different name', students, { name: 'Completely Different', phone: '+20 11 4455 6677' })
// 9. student with zero balance (identity independent of balance)
check('zero balance identity', students, { name: 'Amina Mostafa', phone: '+20 10 0000 0000' })
// 10. student with negative balance (identity independent of balance)
check('negative balance identity', students, { name: 'New Person', phone: '+20 11 4455 6677' })
// 11. both match
check('both match', students, { name: 'Maha El-Sayed', phone: '+20 10 1234 5678' })
// 12. single-student collection, match
check('single student match', [students[0]], { name: 'Maha El-Sayed', phone: '+20 15 0000 0000' })

console.log(failures === 0 ? `PARITY OK (${total} cases)` : `PARITY FAILURES: ${failures}/${total}`)
process.exit(failures ? 1 : 0)
