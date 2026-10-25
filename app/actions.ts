"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createBill, createUser, saveDocument } from "@/lib/db";
import { currentUser, SESSION_COOKIE } from "@/lib/session";
import { CATEGORIES, type Category } from "@/lib/types";

export async function signIn(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim().slice(0, 40);
  if (!name) redirect("/?error=name");
  const user = createUser(name);
  (await cookies()).set(SESSION_COOKIE, user.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect("/swipe");
}

export async function signOut() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/");
}

export type UploadState = { error: string | null };

const MAX_DOC_BYTES = 10 * 1024 * 1024;
const DOC_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
};

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
  let documentPath: string | null = null;
  const doc = formData.get("document");
  if (doc instanceof File && doc.size > 0) {
    const ext = DOC_TYPES[doc.type];
    if (!ext) return { error: "The bill document must be a PDF, PNG, or JPG." };
    if (doc.size > MAX_DOC_BYTES) return { error: "The bill document must be under 10 MB." };
    documentPath = saveDocument(ext, Buffer.from(await doc.arrayBuffer()));
  }

  createBill({ ownerId: user.id, category, amountCents, dueDate, documentPath });
  redirect("/bills?uploaded=1");
}
