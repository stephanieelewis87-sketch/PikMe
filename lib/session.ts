import crypto from "node:crypto";
import { cookies } from "next/headers";
import { createSession, deleteSession, userForSession } from "./db";
import type { User } from "./types";

// Sign-in sessions: a random token in an http-only cookie. The database keeps
// only its SHA-256 hash.
export const SESSION_COOKIE = "pikme_session";
const SESSION_DAYS = 30;

const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? userForSession(hashToken(token)) : null;
}

// Only callable from server actions and route handlers, where cookies can be set.
export async function startSession(userId: string) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await createSession(userId, hashToken(token), expires);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(hashToken(token));
  jar.delete(SESSION_COOKIE);
}
