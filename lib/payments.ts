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
