import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { BidError, placeBid } from "@/lib/live";
import { currentUser } from "@/lib/session";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (isAdmin(user)) return NextResponse.json({ error: "PikMe staff can't bid." }, { status: 403 });

  const body = (await request.json().catch(() => null)) as
    | { auctionId?: unknown; amountCents?: unknown; donate?: unknown }
    | null;
  if (!body || typeof body.auctionId !== "string") {
    return NextResponse.json({ error: "Missing auction." }, { status: 400 });
  }

  try {
    await placeBid({
      userId: user.id,
      auctionId: body.auctionId,
      amountCents: Number(body.amountCents),
      donate: body.donate === true,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof BidError) return NextResponse.json({ error: err.message }, { status: 409 });
    throw err;
  }
}
