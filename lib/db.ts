import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { Bill, BillCard, Category, Contribution, Pass, User } from "./types";

// A small JSON-file store for the first version. Everything goes through the
// functions in this file, so swapping in a real database later only touches here.

type Data = {
  users: User[];
  bills: Bill[];
  contributions: Contribution[];
  passes: Pass[];
};

const DATA_DIR = process.env.PIKME_DATA_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

function load(): Data {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8")) as Data;
  } catch {
    return { users: [], bills: [], contributions: [], passes: [] };
  }
}

function save(data: Data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${DB_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

export function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

function paidCents(data: Data, billId: string) {
  return data.contributions
    .filter((c) => c.billId === billId)
    .reduce((sum, c) => sum + c.amountCents, 0);
}

function toCard(data: Data, bill: Bill): BillCard {
  const contributions = data.contributions.filter((c) => c.billId === bill.id);
  return {
    id: bill.id,
    category: bill.category,
    amountCents: bill.amountCents,
    remainingCents: bill.amountCents - paidCents(data, bill.id),
    dueDate: bill.dueDate,
    contributorCount: new Set(contributions.map((c) => c.userId)).size,
  };
}

// Stores a bill document privately (outside the web root) and returns its
// path relative to the data folder.
export function saveDocument(ext: string, bytes: Buffer): string {
  const relative = path.join("documents", `${newId("doc")}.${ext}`);
  fs.mkdirSync(path.join(/*turbopackIgnore: true*/ DATA_DIR, "documents"), { recursive: true });
  fs.writeFileSync(path.join(/*turbopackIgnore: true*/ DATA_DIR, relative), bytes);
  return relative;
}

// Users

export function createUser(name: string): User {
  const data = load();
  const user: User = { id: newId("usr"), name, createdAt: new Date().toISOString() };
  data.users.push(user);
  save(data);
  return user;
}

export function getUser(id: string): User | null {
  return load().users.find((u) => u.id === id) ?? null;
}

// Bills

export function createBill(input: {
  ownerId: string;
  category: Category;
  amountCents: number;
  dueDate: string;
  documentPath: string | null;
}): Bill {
  const data = load();
  const bill: Bill = {
    id: newId("bill"),
    status: "open",
    createdAt: new Date().toISOString(),
    paidAt: null,
    ...input,
  };
  data.bills.push(bill);
  save(data);
  return bill;
}

export function billsOwnedBy(userId: string): BillCard[] {
  const data = load();
  return data.bills
    .filter((b) => b.ownerId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((b) => toCard(data, b));
}

// The swipe feed: open bills the user doesn't own and hasn't swiped on yet.
// Ordered by due date only, so the most urgent bills come first and nothing
// about the person behind a bill can move it up or down.
export function feedFor(userId: string, limit = 10): BillCard[] {
  const data = load();
  const seen = new Set([
    ...data.passes.filter((p) => p.userId === userId).map((p) => p.billId),
    ...data.contributions.filter((c) => c.userId === userId).map((c) => c.billId),
  ]);
  return data.bills
    .filter((b) => b.status === "open" && b.ownerId !== userId && !seen.has(b.id))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.createdAt.localeCompare(b.createdAt))
    .slice(0, limit)
    .map((b) => toCard(data, b));
}

export function passBill(userId: string, billId: string) {
  const data = load();
  if (!data.passes.some((p) => p.userId === userId && p.billId === billId)) {
    data.passes.push({ userId, billId, createdAt: new Date().toISOString() });
    save(data);
  }
}

export class ContributionError extends Error {}

export function contribute(input: {
  userId: string;
  billId: string;
  amountCents: number;
  paymentRef: string;
}): { contribution: Contribution; card: BillCard } {
  const data = load();
  const bill = data.bills.find((b) => b.id === input.billId);
  if (!bill) throw new ContributionError("That bill no longer exists.");
  if (bill.ownerId === input.userId) throw new ContributionError("You can't pay your own bill here.");
  if (bill.status !== "open") throw new ContributionError("This bill is already paid.");

  const remaining = bill.amountCents - paidCents(data, bill.id);
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
  data.contributions.push(contribution);
  if (remaining - input.amountCents === 0) {
    bill.status = "paid";
    bill.paidAt = new Date().toISOString();
  }
  save(data);
  return { contribution, card: toCard(data, bill) };
}

export function contributionsBy(userId: string): { amountCents: number; createdAt: string; bill: BillCard }[] {
  const data = load();
  return data.contributions
    .filter((c) => c.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .flatMap((c) => {
      const bill = data.bills.find((b) => b.id === c.billId);
      return bill ? [{ amountCents: c.amountCents, createdAt: c.createdAt, bill: toCard(data, bill) }] : [];
    });
}
