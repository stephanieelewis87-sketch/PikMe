import type { User } from "./types";

// PikMe staff: the emails listed in ADMIN_EMAILS (comma-separated). They can
// queue Live products and, to keep auctions honest, can't bid.
export function isAdmin(user: User | null) {
  if (!user) return false;
  const list = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase());
  return list.includes(user.email);
}
