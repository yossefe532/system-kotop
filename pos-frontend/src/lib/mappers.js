export const gradeFromStage = (stage) => {
  if (stage === 'first') return '1st Sec'
  if (stage === 'second') return '2nd Sec'
  if (stage === 'third') return '3rd Sec'
  return null
}

export const stageFromGrade = (grade) => {
  if (grade === '1st Sec') return 'first'
  if (grade === '2nd Sec') return 'second'
  if (grade === '3rd Sec') return 'third'
  return 'first'
}

export const systemToApi = (system) => {
  if (system === 'general') return 'General'
  if (system === 'azhar') return 'Azhar'
  return null
}

export const systemFromApi = (system) => {
  if (system === 'General') return 'general'
  if (system === 'Azhar') return 'azhar'
  return 'general'
}

export const specialtyToApi = (specialty) => {
  if (!specialty) return null
  if (specialty === 'Scientific') return 'Scientific'
  if (specialty === 'Math') return 'Math'
  if (specialty === 'Literary') return 'Literary'
  if (specialty === 'Science') return 'Scientific'
  if (specialty === 'Literature') return 'Literary'
  return null
}

export const specialtyFromApi = (specialty) => {
  if (specialty === 'Scientific') return 'Science'
  if (specialty === 'Math') return 'Math'
  if (specialty === 'Literary') return 'Literature'
  return ''
}

export const mapApiBookToUi = (book) => {
  return {
    id: book.id,
    title: book.title,
    author: book.author,
    sellingPrice: book.selling_price,
    costPrice: book.cost_price,
    estimatedCostPrice: book.estimated_cost_price,
    stock: book.total_stock,
    reservedStock: book.reserved_stock,
    barcode: book.isbn_barcode || '',
    isArriving: Boolean(book.is_arriving),
    estimatedSellingPrice: book.estimated_selling_price,
  }
}

export const mapUiBookToApi = (book) => {
  return {
    title: book.title,
    author: book.author,
    isbn_barcode: book.barcode ? String(book.barcode) : null,
    cost_price: Number(book.costPrice) || 0,
    selling_price: Number(book.sellingPrice) || 0,
    estimated_cost_price: book.estimatedCostPrice === '' || book.estimatedCostPrice == null ? null : Number(book.estimatedCostPrice),
    estimated_selling_price: book.estimatedSellingPrice === '' || book.estimatedSellingPrice == null ? null : Number(book.estimatedSellingPrice),
    total_stock: Number(book.stock) || 0,
    reserved_stock: Number(book.reservedStock) || 0,
    is_arriving: Boolean(book.isArriving),
  }
}

export const mapApiStudentToUi = (student) => {
  return {
    id: student.id,
    name: student.name,
    phone: student.phone || '',
    stage: stageFromGrade(student.grade),
    gender: student.gender || 'male',
    system: systemFromApi(student.system),
    specialty: specialtyFromApi(student.specialty),
    balance: Number(student.balance) || 0,
  }
}

export const mapUiStudentToApi = (student) => {
  const grade = gradeFromStage(student.stage)
  const system = systemToApi(student.system)
  let specialty = specialtyToApi(student.specialty)
  if (grade === '3rd Sec' && !specialty) specialty = 'Scientific'
  return {
    name: student.name,
    phone: student.phone || null,
    gender: student.gender || null,
    grade,
    system,
    specialty,
    balance: Number(student.balance) || 0,
  }
}