import { cookies } from "next/headers";
import { getUser } from "./db";
import type { User } from "./types";

// Placeholder sign-in: a display name and a cookie. Replace with real auth
// before handling real money.
export const SESSION_COOKIE = "pikme_uid";

export async function currentUser(): Promise<User | null> {
  const id = (await cookies()).get(SESSION_COOKIE)?.value;
  return id ? getUser(id) : null;
}
