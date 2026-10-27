import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { liveState } from "@/lib/live";
import { currentUser } from "@/lib/session";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  return NextResponse.json({ ...(await liveState(user.id)), canBid: !isAdmin(user) });
}
