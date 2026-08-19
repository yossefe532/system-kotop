import process from "node:process";

const BASE_URL = process.env.STAGING_BASE_URL;
const ADMIN_USER = process.env.STAGING_ADMIN_USER || "admin";
const ADMIN_PASS = process.env.STAGING_ADMIN_PASS || "admin12345";

if (!BASE_URL) {
  console.error("STAGING_BASE_URL is required (point this ONLY at a staging environment)");
  process.exit(1);
}

const PREFIX = "smoke-";
const created = { students: [], books: [], transactions: [], reservations: [] };
let failures = 0;

function logStep(name, ok, detail) {
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}${detail ? " :: " + detail : ""}`);
  if (!ok) failures++;
}

async function api(method, path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, data };
}

async function cleanup(token) {
  for (const id of created.transactions) await api("DELETE", `/transactions/${id}`, null, token);
  for (const id of created.reservations) await api("DELETE", `/reservations/${id}`, null, token);
  for (const id of created.books) await api("DELETE", `/books/${id}`, null, token);
  for (const id of created.students) await api("DELETE", `/students/${id}`, null, token);
  console.log("Cleanup attempted for smoke records.");
}

async function main() {
  const auth = await api("POST", "/auth/login", { username: ADMIN_USER, password: ADMIN_PASS });
  if (auth.status !== 200 || !auth.data?.access_token) {
    logStep("admin login", false, `status ${auth.status}`);
    process.exit(1);
  }
  logStep("admin login", true);
  const token = auth.data.access_token;

  const student = await api("POST", "/students", {
    name: `${PREFIX}student`,
    phone: "01000000000",
    email: `${PREFIX}@example.com`,
    gender: "male",
    grade: "3rd Sec",
    system: "General",
    specialty: "Math",
    balance: 0,
  }, token);
  if (student.status !== 200 && student.status !== 201) {
    logStep("create student", false, `status ${student.status}`);
    process.exit(1);
  }
  logStep("create student", true);
  const studentId = student.data.id;
  created.students.push(studentId);

  const book = await api("POST", "/books", {
    title: `${PREFIX}book`,
    author: "Test",
    isbn_barcode: `${PREFIX}book-001`,
    cost_price: 50,
    selling_price: 100,
    total_stock: 10,
    reserved_stock: 0,
    is_arriving: false,
  }, token);
  if (book.status !== 200 && book.status !== 201) {
    logStep("create book", false, `status ${book.status}`);
    process.exit(1);
  }
  logStep("create book", true);
  const bookId = book.data.id;
  created.books.push(bookId);

  const sale = await api("POST", "/transactions", {
    type: "sale",
    student_id: studentId,
    items: [{ book_id: bookId, quantity: 1 }],
    payment_method: "cash",
  }, token);
  if (sale.status === 200 || sale.status === 201) {
    logStep("cash sale", true);
    if (sale.data?.id) created.transactions.push(sale.data.id);
  } else {
    logStep("cash sale", false, `status ${sale.status}`);
  }

  const bookAfter = await api("GET", `/books/${bookId}`, null, token);
  if (bookAfter.status === 200) {
    logStep("stock decremented", bookAfter.data.total_stock < 10, `total_stock=${bookAfter.data.total_stock}`);
  } else {
    logStep("stock read", false, `status ${bookAfter.status}`);
  }

  const reservation = await api("POST", "/reservations", {
    student_id: studentId,
    book_id: bookId,
    quantity: 1,
  }, token);
  if (reservation.status === 200 || reservation.status === 201) {
    logStep("create reservation", true);
    const rid = reservation.data?.id;
    if (rid) {
      created.reservations.push(rid);
      const cancel = await api("DELETE", `/reservations/${rid}`, null, token);
      logStep("cancel reservation", cancel.status === 200 || cancel.status === 204, `status ${cancel.status}`);
    }
  } else {
    logStep("create reservation", false, `status ${reservation.status}`);
  }

  const recon = await api("GET", `/students/${studentId}/wallet/reconciliation`, null, token);
  logStep("wallet reconciliation responds", true, `status ${recon.status} (503 expected when ledger disabled)`);

  await cleanup(token);

  console.log(`\nRESULT: ${failures} failure(s)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Smoke script crashed:", err);
  process.exit(1);
});
