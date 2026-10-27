"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { dollars } from "@/lib/format";
import type { EndedAuction, LiveAuction as Live } from "@/lib/live";

type State = {
  live: Live | null;
  upNext: { id: string; title: string }[];
  ended: EndedAuction[];
  raised: { cents: number; billsHelped: number };
  serverTime: string;
  canBid: boolean;
};

const POLL_MS = 3000;

export default function LiveAuction() {
  const [state, setState] = useState<State | null>(null);
  const [offset, setOffset] = useState(0); // server clock minus this device's clock
  const [now, setNow] = useState(() => Date.now());
  const [amount, setAmount] = useState("");
  const [donate, setDonate] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const liveId = useRef<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/live", { cache: "no-store" });
    if (!res.ok) return;
    const json = (await res.json()) as State;
    setOffset(Date.parse(json.serverTime) - Date.now());
    setState(json);
    // A new auction went up: reset the form for it.
    if (json.live?.id !== liveId.current) {
      liveId.current = json.live?.id ?? null;
      setAmount(json.live ? (json.live.minNextBidCents / 100).toFixed(2) : "");
      setDonate(json.live?.you.donate ?? false);
    }
  }, []);

  useEffect(() => {
    load();
    const poll = setInterval(load, POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [load]);

  const live = state?.live ?? null;
  const msLeft = live ? Date.parse(live.endsAt) - (now + offset) : 0;

  // Reload right when the clock runs out so the result shows up.
  useEffect(() => {
    if (live && msLeft <= 0) load();
  }, [live, msLeft <= 0, load]); // eslint-disable-line react-hooks/exhaustive-deps

  async function bid(e: React.FormEvent) {
    e.preventDefault();
    if (!live) return;
    setPending(true);
    setMessage(null);
    const amountCents = Math.round(Number(amount) * 100);
    const res = await fetch("/api/live/bid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auctionId: live.id, amountCents, donate }),
    });
    const json = await res.json();
    setPending(false);
    if (!res.ok) {
      setMessage({ text: json.error ?? "Something went wrong.", error: true });
    } else {
      setMessage({
        text: donate
          ? `You're bidding ${dollars(amountCents)}. If you lose, it goes to bills.`
          : `You're bidding ${dollars(amountCents)}. If you lose, you pay nothing.`,
        error: false,
      });
    }
    if (res.ok) liveId.current = null; // refill the form with the new minimum bid
    await load();
  }

  if (!state) return <p className="muted">Loading the auction…</p>;

  return (
    <>
      <Ticker cents={state.raised.cents} billsHelped={state.raised.billsHelped} />

      {live ? (
        <section className="panel auction">
          <div className="auction-head">
            <span className="badge live-badge">Live</span>
            <span className="countdown" aria-live="off">{countdown(msLeft)}</span>
          </div>
          <h2 style={{ marginTop: 12 }}>{live.title}</h2>
          {live.description && <p className="muted" style={{ marginTop: 0 }}>{live.description}</p>}

          <div className="auction-stats">
            <div>
              <div className="muted">{live.topBidCents === null ? "Starting bid" : "Top bid"}</div>
              <div className="amount">{dollars(live.topBidCents ?? live.startingBidCents)}</div>
            </div>
            <div>
              <div className="muted">Bids</div>
              <div className="stat">
                {live.bidCount} from {live.bidderCount} {live.bidderCount === 1 ? "person" : "people"}
              </div>
            </div>
          </div>

          {live.you.highestCents !== null && (
            <p className={live.you.isTop ? "notice" : "notice outbid"} role="status">
              {live.you.isTop
                ? `You're the top bidder at ${dollars(live.you.highestCents)}.`
                : `You've been outbid. Your highest bid is ${dollars(live.you.highestCents)}.`}{" "}
              {live.you.donate ? "If you lose, it goes to bills." : "If you lose, you pay nothing."}
            </p>
          )}

          {state.canBid && (
            <form onSubmit={bid}>
              <p className="muted" style={{ fontSize: "0.9rem" }}>
                You&apos;re buying this item from PikMe. If you win, your payment goes to PikMe. If you
                lose, you pay nothing, unless you tick &quot;donate my bid.&quot; Then your highest bid is
                charged and goes toward real people&apos;s bills.
              </p>
              <label htmlFor="bid">Your bid <small>(at least {dollars(live.minNextBidCents)})</small></label>
              <input
                id="bid"
                type="number"
                inputMode="decimal"
                min={live.minNextBidCents / 100}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
              <label className="check">
                <input type="checkbox" checked={donate} onChange={(e) => setDonate(e.target.checked)} />
                <span>
                  If I lose, donate my bid to help pay bills. I&apos;ll be charged my highest bid when the
                  auction ends.
                </span>
              </label>
              {message && <p className={message.error ? "error" : "muted"} role="status">{message.text}</p>}
              <button disabled={pending} style={{ marginTop: 12, width: "100%" }}>
                {pending ? "Placing bid…" : "Place bid"}
              </button>
              <p className="muted" style={{ fontSize: "0.8rem", marginBottom: 0 }}>
                A bid in the last 2 minutes adds 2 minutes to the clock. Payments are simulated for now; no
                money moves. Donations are not tax-deductible.
              </p>
            </form>
          )}
        </section>
      ) : (
        <p className="panel muted">No auction is running right now. Check back soon.</p>
      )}

      {state.upNext.length > 0 && (
        <>
          <h2>Up next</h2>
          <ul className="list">
            {state.upNext.map((a) => (
              <li key={a.id}>{a.title} <span className="muted">· starts at $1</span></li>
            ))}
          </ul>
        </>
      )}

      {state.ended.length > 0 && (
        <>
          <h2>Recently ended</h2>
          <ul className="list">
            {state.ended.map((a) => (
              <li key={a.id}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <strong>{a.title}</strong>
                  <span className="badge">
                    {a.winningBidCents === null ? "No bids" : `Sold for ${dollars(a.winningBidCents)}`}
                  </span>
                </div>
                {a.outcome && <div className="muted">{outcomeText(a)}</div>}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function Ticker({ cents, billsHelped }: { cents: number; billsHelped: number }) {
  // Counts up to the new total whenever more is raised.
  const [shown, setShown] = useState(cents);
  const from = useRef(cents);
  useEffect(() => {
    const start = from.current;
    if (start === cents) return;
    const began = performance.now();
    let frame = 0;
    const step = (t: number) => {
      const p = Math.min((t - began) / 1200, 1);
      setShown(Math.round(start + (cents - start) * (1 - (1 - p) ** 3)));
      if (p < 1) frame = requestAnimationFrame(step);
      else from.current = cents;
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [cents]);

  return (
    <section className="ticker" aria-label="Raised for bills">
      <div className="muted">Raised for people&apos;s bills through Live</div>
      <div className="ticker-amount">{dollars(shown)}</div>
      <div className="muted" style={{ fontSize: "0.9rem" }}>
        {billsHelped === 0
          ? "from donated losing bids"
          : `from donated losing bids, helping ${billsHelped} ${billsHelped === 1 ? "bill" : "bills"} so far`}
      </div>
    </section>
  );
}

function countdown(ms: number) {
  if (ms <= 0) return "Ending…";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}h ${pad(m)}m ${pad(sec)}s left` : `${m}m ${pad(sec)}s left`;
}

function outcomeText(a: EndedAuction) {
  const bid = dollars(a.yourBidCents ?? 0);
  if (a.outcome === "won") return `You won with ${bid}. Payment is simulated for now.`;
  if (a.outcome === "donated") return `You didn't win, and your ${bid} bid went to bills. Thank you.`;
  return `You didn't win. Your ${bid} bid wasn't charged.`;
}
