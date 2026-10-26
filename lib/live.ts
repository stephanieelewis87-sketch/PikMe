import { distributePool, newId } from "./db";
import { chargeBid, holdBid } from "./payments";
import { query, transaction, type Sql } from "./sql";

// Live: one product auction at a time. PikMe sells the product and keeps the
// winning bid. A loser who ticked "donate" is charged their highest bid, and
// that money goes to the bill pool. Everyone else's hold is released.

export const ANTI_SNIPE_MS = 2 * 60_000;

// Each bid must beat the top bid by at least $1.
export const MIN_RAISE_CENTS = 100;

export function minNextBidCents(topCents: number | null, startingCents: number) {
  return topCents === null ? startingCents : topCents + MIN_RAISE_CENTS;
}

type AuctionRow = {
  id: string;
  title: string;
  description: string;
  starting_bid_cents: number;
  duration_minutes: number;
  status: "queued" | "live" | "ended";
  starts_at: Date | null;
  ends_at: Date | null;
  winner_id: string | null;
  winning_bid_cents: number | null;
};

const iso = (d: Date | string) => new Date(d).toISOString();

// Auctions move on whenever someone looks: an auction past its end time is
// settled, and the next one in line starts. No background job needed.
export async function advanceAuctions() {
  await transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('pikme_live'))");
    const [live] = await tx.query<AuctionRow>("SELECT * FROM auctions WHERE status = 'live' FOR UPDATE");
    if (live && new Date(live.ends_at!).getTime() <= Date.now()) await settle(tx, live);
    if (!live || new Date(live.ends_at!).getTime() <= Date.now()) {
      await tx.query(
        `UPDATE auctions SET status = 'live', starts_at = now(), ends_at = now() + duration_minutes * interval '1 minute'
         WHERE id = (SELECT id FROM auctions WHERE status = 'queued' ORDER BY created_at, id LIMIT 1)`,
      );
    }
  });
}

async function settle(tx: Sql, auction: AuctionRow) {
  // Each bidder's highest bid. Earlier bids are never charged.
  const top = await tx.query<{ user_id: string; amount_cents: number; donate: boolean }>(
    `SELECT DISTINCT ON (user_id) user_id, amount_cents, donate FROM bids
     WHERE auction_id = $1 ORDER BY user_id, amount_cents DESC, created_at`,
    [auction.id],
  );
  top.sort((a, b) => b.amount_cents - a.amount_cents);
  const [winner, ...losers] = top;

  let winnerRef: string | null = null;
  if (winner) {
    ({ paymentRef: winnerRef } = await chargeBid({
      userId: winner.user_id,
      auctionId: auction.id,
      amountCents: winner.amount_cents,
    }));
  }
  for (const loser of losers.filter((l) => l.donate)) {
    const { paymentRef } = await chargeBid({ userId: loser.user_id, auctionId: auction.id, amountCents: loser.amount_cents });
    await tx.query(
      "INSERT INTO pool_credits (id, auction_id, user_id, amount_cents, payment_ref) VALUES ($1, $2, $3, $4, $5)",
      [newId("pool"), auction.id, loser.user_id, loser.amount_cents, paymentRef],
    );
  }
  // Holds on everyone else are released here once payments are real.

  await tx.query(
    "UPDATE auctions SET status = 'ended', winner_id = $2, winning_bid_cents = $3, payment_ref = $4 WHERE id = $1",
    [auction.id, winner?.user_id ?? null, winner?.amount_cents ?? null, winnerRef],
  );
  await distributePool(tx);
}

export class BidError extends Error {}

export async function placeBid(input: { userId: string; auctionId: string; amountCents: number; donate: boolean }) {
  await advanceAuctions();
  return transaction(async (tx) => {
    const [auction] = await tx.query<AuctionRow>("SELECT * FROM auctions WHERE id = $1 FOR UPDATE", [input.auctionId]);
    if (!auction || auction.status !== "live" || new Date(auction.ends_at!).getTime() <= Date.now()) {
      throw new BidError("This auction has ended.");
    }
    const [{ top }] = await tx.query<{ top: number | null }>(
      "SELECT max(amount_cents) AS top FROM bids WHERE auction_id = $1",
      [auction.id],
    );
    const min = minNextBidCents(top, auction.starting_bid_cents);
    if (!Number.isInteger(input.amountCents) || input.amountCents < min) {
      throw new BidError(`The lowest bid you can place now is $${(min / 100).toFixed(2)}.`);
    }
    if (input.amountCents > 10_000_000) throw new BidError("That bid is too high.");

    await holdBid(input);
    await tx.query(
      "INSERT INTO bids (id, auction_id, user_id, amount_cents, donate) VALUES ($1, $2, $3, $4, $5)",
      [newId("bid"), auction.id, input.userId, input.amountCents, input.donate],
    );
    // A bid in the last 2 minutes pushes the end back so others can answer.
    await tx.query(
      `UPDATE auctions SET ends_at = greatest(ends_at, now() + interval '${ANTI_SNIPE_MS / 1000} seconds') WHERE id = $1`,
      [auction.id],
    );
  });
}

export type LiveAuction = {
  id: string;
  title: string;
  description: string;
  endsAt: string;
  startingBidCents: number;
  topBidCents: number | null;
  bidCount: number;
  bidderCount: number;
  minNextBidCents: number;
  you: { highestCents: number | null; donate: boolean; isTop: boolean };
};

export type EndedAuction = {
  id: string;
  title: string;
  endedAt: string;
  winningBidCents: number | null;
  // What happened to the viewer's bid, if they bid.
  outcome: "won" | "donated" | "released" | null;
  yourBidCents: number | null;
};

export async function liveState(userId: string): Promise<{
  live: LiveAuction | null;
  upNext: { id: string; title: string }[];
  ended: EndedAuction[];
  raised: { cents: number; billsHelped: number };
  serverTime: string;
}> {
  await advanceAuctions();
  const [live] = await query<AuctionRow & { top: number | null; bid_count: number; bidder_count: number }>(
    `SELECT a.*, (SELECT max(amount_cents) FROM bids WHERE auction_id = a.id) AS top,
            (SELECT count(*) FROM bids WHERE auction_id = a.id)::int AS bid_count,
            (SELECT count(DISTINCT user_id) FROM bids WHERE auction_id = a.id)::int AS bidder_count
     FROM auctions a WHERE a.status = 'live'`,
  );
  let liveAuction: LiveAuction | null = null;
  if (live) {
    const [mine] = await query<{ amount_cents: number; donate: boolean }>(
      "SELECT amount_cents, donate FROM bids WHERE auction_id = $1 AND user_id = $2 ORDER BY amount_cents DESC LIMIT 1",
      [live.id, userId],
    );
    liveAuction = {
      id: live.id,
      title: live.title,
      description: live.description,
      endsAt: iso(live.ends_at!),
      startingBidCents: live.starting_bid_cents,
      topBidCents: live.top,
      bidCount: live.bid_count,
      bidderCount: live.bidder_count,
      minNextBidCents: minNextBidCents(live.top, live.starting_bid_cents),
      you: {
        highestCents: mine?.amount_cents ?? null,
        donate: mine?.donate ?? false,
        isTop: !!mine && mine.amount_cents === live.top,
      },
    };
  }

  const upNext = await query<{ id: string; title: string }>(
    "SELECT id, title FROM auctions WHERE status = 'queued' ORDER BY created_at, id LIMIT 5",
  );
  const ended = await query<{
    id: string;
    title: string;
    ends_at: Date;
    winner_id: string | null;
    winning_bid_cents: number | null;
    your_bid: number | null;
    donated: boolean;
  }>(
    `SELECT a.id, a.title, a.ends_at, a.winner_id, a.winning_bid_cents,
            (SELECT max(amount_cents) FROM bids WHERE auction_id = a.id AND user_id = $1) AS your_bid,
            EXISTS (SELECT 1 FROM pool_credits WHERE auction_id = a.id AND user_id = $1) AS donated
     FROM auctions a WHERE a.status = 'ended' ORDER BY a.ends_at DESC LIMIT 5`,
    [userId],
  );

  // The ticker: everything losing bidders have donated, and how many bills it reached.
  const [raised] = await query<{ cents: number; bills_helped: number }>(
    `SELECT coalesce((SELECT sum(amount_cents) FROM pool_credits), 0)::int AS cents,
            (SELECT count(DISTINCT bill_id) FROM contributions WHERE pool_credit_id IS NOT NULL)::int AS bills_helped`,
  );

  return {
    live: liveAuction,
    raised: { cents: raised.cents, billsHelped: raised.bills_helped },
    upNext,
    ended: ended.map((e) => ({
      id: e.id,
      title: e.title,
      endedAt: iso(e.ends_at),
      winningBidCents: e.winning_bid_cents,
      outcome: e.your_bid === null ? null : e.winner_id === userId ? "won" : e.donated ? "donated" : "released",
      yourBidCents: e.your_bid,
    })),
    serverTime: new Date().toISOString(),
  };
}

// Adds a product to the end of the line. It goes live when the one before it ends.
export async function queueAuction(input: { title: string; description: string; durationMinutes: number }) {
  await query("INSERT INTO auctions (id, title, description, duration_minutes) VALUES ($1, $2, $3, $4)", [
    newId("auc"),
    input.title,
    input.description,
    input.durationMinutes,
  ]);
  await advanceAuctions();
}

export async function queuedAuctions() {
  return query<{ id: string; title: string; duration_minutes: number }>(
    "SELECT id, title, duration_minutes FROM auctions WHERE status = 'queued' ORDER BY created_at, id",
  );
}
