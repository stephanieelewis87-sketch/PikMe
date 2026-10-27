import crypto from "node:crypto";

// Payments are simulated in this version: nothing is charged and no money
// moves. A real provider (for example Stripe Connect) plugs in here and must
// return a reference only after the charge succeeds.
export async function chargeContribution(_input: {
  userId: string;
  billId: string;
  amountCents: number;
}): Promise<{ paymentRef: string }> {
  return { paymentRef: `sim_${crypto.randomUUID()}` };
}

// Live auctions: a bid places a hold on the bidder's card, and when the
// auction ends the hold is either charged or released. Simulated too.
export async function holdBid(_input: { userId: string; auctionId: string; amountCents: number }) {
  return { holdRef: `simhold_${crypto.randomUUID()}` };
}

export async function chargeBid(_input: { userId: string; auctionId: string; amountCents: number }) {
  return { paymentRef: `sim_${crypto.randomUUID()}` };
}
