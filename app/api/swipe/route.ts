import { NextResponse } from "next/server";
import { contribute, ContributionError, passBill } from "@/lib/db";
import { chargeContribution } from "@/lib/payments";
import { currentUser } from "@/lib/session";

// Swipe left: pass on a bill. Swipe right: pay all or part of what's left.
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | { billId?: unknown; direction?: unknown; amountCents?: unknown }
    | null;
  if (!body || typeof body.billId !== "string") {
    return NextResponse.json({ error: "Missing bill." }, { status: 400 });
  }

  if (body.direction === "left") {
    passBill(user.id, body.billId);
    return NextResponse.json({ ok: true });
  }

  if (body.direction === "right") {
    const amountCents = Number(body.amountCents);
    try {
      const { paymentRef } = await chargeContribution({ userId: user.id, billId: body.billId, amountCents });
      const { card } = contribute({ userId: user.id, billId: body.billId, amountCents, paymentRef });
      return NextResponse.json({ ok: true, bill: card });
    } catch (err) {
      if (err instanceof ContributionError) {
        return NextResponse.json({ error: err.message }, { status: 409 });
      }
      throw err;
    }
  }

  return NextResponse.json({ error: "Swipe left or right." }, { status: 400 });
}
