"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createBill, createUser, EmailTakenError, saveDocument, userWithPassword } from "@/lib/db";
import { isAdmin } from "@/lib/admin";
import { queueAuction } from "@/lib/live";
import { DUMMY_HASH, hashPassword, verifyPassword } from "@/lib/password";
import { currentUser, endSession, startSession } from "@/lib/session";
import { CATEGORIES, type Category } from "@/lib/types";

export type AuthState = { error: string | null; email: string };

const MIN_PASSWORD = 8;

function readCredentials(formData: FormData) {
  return {
    email: String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 254),
    password: String(formData.get("password") ?? ""),
  };
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const { email, password } = readCredentials(formData);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address.", email };
  if (password.length < MIN_PASSWORD) {
    return { error: `Use a password with at least ${MIN_PASSWORD} characters.`, email };
  }
  if (password.length > 200) return { error: "That password is too long.", email };

  try {
    const user = await createUser(email, await hashPassword(password));
    await startSession(user.id);
  } catch (err) {
    if (err instanceof EmailTakenError) {
      return { error: "There's already an account with that email. Sign in instead.", email };
    }
    throw err;
  }
  redirect("/swipe");
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const { email, password } = readCredentials(formData);
  const user = await userWithPassword(email);
  // Check a password either way so a missing account takes as long as a wrong password.
  const ok = await verifyPassword(password, user?.passwordHash ?? (await DUMMY_HASH));
  if (!user || !ok) return { error: "That email and password don't match.", email };
  await startSession(user.id);
  redirect("/swipe");
}

export async function signOut() {
  await endSession();
  redirect("/");
}

export type UploadState = { error: string | null };

// Hosts like Vercel cap a request at about 4.5 MB, so documents stay under 4 MB.
const MAX_DOC_BYTES = 4 * 1024 * 1024;
const DOC_TYPES = ["application/pdf", "image/png", "image/jpeg"];

export async function uploadBill(_prev: UploadState, formData: FormData): Promise<UploadState> {
  const user = await currentUser();
  if (!user) redirect("/");

  const category = String(formData.get("category") ?? "") as Category;
  if (!CATEGORIES.includes(category)) return { error: "Pick a category." };

  const amount = Number(formData.get("amount"));
  if (!Number.isFinite(amount) || amount < 1 || amount > 100_000) {
    return { error: "Enter an amount between $1 and $100,000." };
  }
  const amountCents = Math.round(amount * 100);

  const dueDate = String(formData.get("dueDate") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || Number.isNaN(Date.parse(dueDate))) {
    return { error: "Enter the bill's due date." };
  }

  // The bill document is kept privately for verification and is never shown
  // to swipers.
  let documentId: string | null = null;
  const doc = formData.get("document");
  if (doc instanceof File && doc.size > 0) {
    if (!DOC_TYPES.includes(doc.type)) return { error: "The bill document must be a PDF, PNG, or JPG." };
    if (doc.size > MAX_DOC_BYTES) return { error: "The bill document must be under 4 MB." };
    documentId = await saveDocument(doc.type, Buffer.from(await doc.arrayBuffer()));
  }

  await createBill({ ownerId: user.id, category, amountCents, dueDate, documentId });
  redirect("/bills?uploaded=1");
}

export type QueueState = { error: string | null; added: string | null };

export async function queueProduct(_prev: QueueState, formData: FormData): Promise<QueueState> {
  const user = await currentUser();
  if (!isAdmin(user)) redirect("/live");

  const title = String(formData.get("title") ?? "").trim().slice(0, 120);
  const description = String(formData.get("description") ?? "").trim().slice(0, 1000);
  const hours = Number(formData.get("hours"));
  if (!title) return { error: "Give the product a name.", added: null };
  if (!Number.isFinite(hours) || hours < 0.05 || hours > 168) {
    return { error: "Auctions run between 3 minutes and 7 days (0.05 to 168 hours).", added: null };
  }
  await queueAuction({ title, description, durationMinutes: Math.round(hours * 60) });
  revalidatePath("/live/admin");
  return { error: null, added: title };
}
