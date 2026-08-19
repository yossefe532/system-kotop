// Pure student-domain logic (Wave 11).
//
// Extracted from App.jsx. This module contains ONLY deterministic,
// side-effect-free student business rules. It owns no state, makes no API
// calls, and touches no storage.
//
// Student search/filter/match lives in ../hooks/useStudentSearch.js (Wave 8).
// Student API mapping lives in ../lib/mappers.js.
// Checkout balance adjustment lives in ../checkout/checkoutService.js (Wave 10).

// Determines whether a student with the same phone number OR the same name
// (case-insensitive) already exists in the collection.
//
// This is the student-identity invariant used by saveStudent to reject
// duplicates before persistence.
export function isStudentDuplicate(students, { name, phone }) {
  return students.some((s) => s.phone === phone || s.name.toLowerCase() === name.toLowerCase())
}
