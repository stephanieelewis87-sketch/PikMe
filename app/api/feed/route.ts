import { NextResponse } from "next/server";
import { feedFor } from "@/lib/db";
import { currentUser } from "@/lib/session";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  return NextResponse.json({ bills: feedFor(user.id) });
}
