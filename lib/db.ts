import crypto from "node:crypto";
import { query, transaction, type Sql } from "./sql";
import type { BillCard, Category, Contribution, User } from "./types";

// All reads and writes go through the functions in this file.

export function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

const iso = (d: Date | string) => new Date(d).toISOString();

// The only bill columns a swiper's view is built from.
const CARD_COLUMNS = `
  b.id,
  b.category,
  b.amount_cents,
  b.amount_cents - coalesce((SELECT sum(c.amount_cents) FROM contributions c WHERE c.bill_id = b.id), 0)::int AS remaining_cents,
  b.due_date::text AS due_date,
  (SELECT count(DISTINCT c.user_id) FROM contributions c WHERE c.bill_id = b.id)::int AS contributor_count
`;

type CardRow = {
  id: string;
  category: Category;
  amount_cents: number;
  remaining_cents: number;
  due_date: string;
  contributor_count: number;
};

function toCard(r: CardRow): BillCard {
  return {
    id: r.id,
    category: r.category,
    amountCents: r.amount_cents,
    remainingCents: r.remaining_cents,
    dueDate: r.due_date,
    contributorCount: r.contributor_count,
  };
}

async function cardById(sql: Sql, billId: string): Promise<BillCard | null> {
  const [row] = await sql.query<CardRow>(`SELECT ${CARD_COLUMNS} FROM bills b WHERE b.id = $1`, [billId]);
  return row ? toCard(row) : null;
}

// Stores a bill document privately and returns its id.
export async function saveDocument(contentType: string, bytes: Buffer): Promise<string> {
  const id = newId("doc");
  await query("INSERT INTO bill_documents (id, content_type, bytes) VALUES ($1, $2, $3)", [id, contentType, bytes]);
  return id;
}

// Users

type UserRow = { id: string; email: string; created_at: Date };
const toUser = (r: UserRow): User => ({ id: r.id, email: r.email, createdAt: iso(r.created_at) });

export class EmailTakenError extends Error {}

export async function createUser(email: string, passwordHash: string): Promise<User> {
  const rows = await query<UserRow>(
    `INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO NOTHING
     RETURNING id, email, created_at`,
    [newId("usr"), email, passwordHash],
  );
  if (rows.length === 0) throw new EmailTakenError();
  return toUser(rows[0]);
}

export async function userWithPassword(email: string): Promise<(User & { passwordHash: string }) | null> {
  const [row] = await query<UserRow & { password_hash: string }>(
    "SELECT id, email, created_at, password_hash FROM users WHERE email = $1",
    [email],
  );
  return row ? { ...toUser(row), passwordHash: row.password_hash } : null;
}

// Sessions

export async function createSession(userId: string, tokenHash: string, expiresAt: Date) {
  await query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)", [
    tokenHash,
    userId,
    expiresAt,
  ]);
}

export async function userForSession(tokenHash: string): Promise<User | null> {
  const [row] = await query<UserRow>(
    `SELECT u.id, u.email, u.created_at FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [tokenHash],
  );
  return row ? toUser(row) : null;
}

export async function deleteSession(tokenHash: string) {
  await query("DELETE FROM sessions WHERE token_hash = $1 OR expires_at <= now()", [tokenHash]);
}

// Bills

export async function createBill(input: {
  ownerId: string;
  category: Category;
  amountCents: number;
  dueDate: string;
  documentId: string | null;
}): Promise<string> {
  const id = newId("bill");
  await query(
    "INSERT INTO bills (id, owner_id, category, amount_cents, due_date, document_id) VALUES ($1, $2, $3, $4, $5, $6)",
    [id, input.ownerId, input.category, input.amountCents, input.dueDate, input.documentId],
  );
  return id;
}

export async function billsOwnedBy(userId: string): Promise<BillCard[]> {
  const rows = await query<CardRow>(
    `SELECT ${CARD_COLUMNS} FROM bills b WHERE b.owner_id = $1 ORDER BY b.created_at DESC`,
    [userId],
  );
  return rows.map(toCard);
}

// The swipe feed: open bills the user doesn't own and hasn't swiped on yet.
// Ordered by due date only, so the most urgent bills come first and nothing
// about the person behind a bill can move it up or down.
export async function feedFor(userId: string, limit = 10): Promise<BillCard[]> {
  const rows = await query<CardRow>(
    `SELECT ${CARD_COLUMNS} FROM bills b
     WHERE b.status = 'open'
       AND b.owner_id <> $1
       AND NOT EXISTS (SELECT 1 FROM passes p WHERE p.bill_id = b.id AND p.user_id = $1)
       AND NOT EXISTS (SELECT 1 FROM contributions c WHERE c.bill_id = b.id AND c.user_id = $1)
     ORDER BY b.due_date, b.created_at
     LIMIT $2`,
    [userId, limit],
  );
  return rows.map(toCard);
}

export async function passBill(userId: string, billId: string) {
  await query(
    `INSERT INTO passes (user_id, bill_id)
     SELECT $1, id FROM bills WHERE id = $2
     ON CONFLICT DO NOTHING`,
    [userId, billId],
  );
}

export class ContributionError extends Error {}

export async function contribute(input: {
  userId: string;
  billId: string;
  amountCents: number;
  paymentRef: string;
}): Promise<{ contribution: Contribution; card: BillCard }> {
  return transaction(async (tx) => {
    // Lock the bill so two people paying at once can't overpay it.
    const [bill] = await tx.query<{ owner_id: string; status: string; amount_cents: number }>(
      "SELECT owner_id, status, amount_cents FROM bills WHERE id = $1 FOR UPDATE",
      [input.billId],
    );
    if (!bill) throw new ContributionError("That bill no longer exists.");
    if (bill.owner_id === input.userId) throw new ContributionError("You can't pay your own bill here.");
    if (bill.status !== "open") throw new ContributionError("This bill is already paid.");

    const [{ paid }] = await tx.query<{ paid: number }>(
      "SELECT coalesce(sum(amount_cents), 0)::int AS paid FROM contributions WHERE bill_id = $1",
      [input.billId],
    );
    const remaining = bill.amount_cents - paid;
    if (!Number.isInteger(input.amountCents) || input.amountCents < 100) {
      throw new ContributionError("Contributions start at $1.");
    }
    if (input.amountCents > remaining) {
      throw new ContributionError("That's more than what's left on this bill.");
    }

    const contribution: Contribution = {
      id: newId("ctb"),
      createdAt: new Date().toISOString(),
      ...input,
    };
    await tx.query(
      "INSERT INTO contributions (id, bill_id, user_id, amount_cents, payment_ref, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
      [contribution.id, input.billId, input.userId, input.amountCents, input.paymentRef, contribution.createdAt],
    );
    if (remaining - input.amountCents === 0) {
      await tx.query("UPDATE bills SET status = 'paid', paid_at = now() WHERE id = $1", [input.billId]);
    }
    return { contribution, card: (await cardById(tx, input.billId))! };
  });
}

export async function contributionsBy(
  userId: string,
): Promise<{ id: string; amountCents: number; createdAt: string; bill: BillCard }[]> {
  const rows = await query<CardRow & { ctb_id: string; ctb_amount: number; ctb_created: Date }>(
    `SELECT c.id AS ctb_id, c.amount_cents AS ctb_amount, c.created_at AS ctb_created, ${CARD_COLUMNS}
     FROM contributions c JOIN bills b ON b.id = c.bill_id
     WHERE c.user_id = $1
     ORDER BY c.created_at DESC`,
    [userId],
  );
  return rows.map((r) => ({ id: r.ctb_id, amountCents: r.ctb_amount, createdAt: iso(r.ctb_created), bill: toCard(r) }));
}
