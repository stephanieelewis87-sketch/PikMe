"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { dollars, dueLabel } from "@/lib/format";
import type { BillCard } from "@/lib/types";

const SWIPE_THRESHOLD = 110;
const QUICK_AMOUNTS = [500, 1000, 2500];

export default function Deck() {
  const [bills, setBills] = useState<BillCard[] | null>(null);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [paying, setPaying] = useState<BillCard | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const startX = useRef(0);

  const load = useCallback(async () => {
    const res = await fetch("/api/feed", { cache: "no-store" });
    const json = await res.json();
    setBills(json.bills ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const top = bills?.[0] ?? null;

  const next = useCallback(() => {
    setDragX(0);
    setBills((b) => {
      const rest = b?.slice(1) ?? [];
      if (rest.length === 0) load();
      return rest;
    });
  }, [load]);

  const pass = useCallback(async () => {
    if (!top) return;
    setMessage(null);
    await fetch("/api/swipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ billId: top.id, direction: "left" }),
    });
    next();
  }, [top, next]);

  const like = useCallback(() => {
    if (!top) return;
    setMessage(null);
    setDragX(SWIPE_THRESHOLD);
    setPaying(top);
  }, [top]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (paying) return;
      if (e.key === "ArrowLeft") pass();
      if (e.key === "ArrowRight") like();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pass, like, paying]);

  function onPointerDown(e: React.PointerEvent) {
    if (paying) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    startX.current = e.clientX;
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (dragging) setDragX(e.clientX - startX.current);
  }

  function onPointerUp() {
    if (!dragging) return;
    setDragging(false);
    if (dragX > SWIPE_THRESHOLD) like();
    else if (dragX < -SWIPE_THRESHOLD) pass();
    else setDragX(0);
  }

  async function confirmPayment(amountCents: number) {
    if (!paying) return;
    const res = await fetch("/api/swipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ billId: paying.id, direction: "right", amountCents }),
    });
    const json = await res.json();
    setPaying(null);
    if (!res.ok) {
      setMessage(json.error ?? "Something went wrong.");
      setDragX(0);
      load();
      return;
    }
    setMessage(
      json.bill.remainingCents === 0
        ? `You finished paying this bill with ${dollars(amountCents)}. Thank you!`
        : `You chipped in ${dollars(amountCents)}. ${dollars(json.bill.remainingCents)} left to go.`,
    );
    next();
  }

  if (bills === null) return <p className="muted">Loading bills…</p>;

  return (
    <>
      {message && <p className="notice" role="status">{message}</p>}

      {top ? (
        <>
          <div className="deck">
            {bills[1] && <Card bill={bills[1]} className="card behind" />}
            <Card
              bill={top}
              className="card"
              style={{
                transform: `translateX(${dragX}px) rotate(${dragX / 20}deg)`,
                transition: dragging ? "none" : "transform 0.25s ease",
              }}
              stampOpacity={Math.min(Math.abs(dragX) / SWIPE_THRESHOLD, 1)}
              stampSide={dragX >= 0 ? "right" : "left"}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
          </div>

          {paying ? (
            <PaySheet bill={paying} onConfirm={confirmPayment} onCancel={() => { setPaying(null); setDragX(0); }} />
          ) : (
            <div className="row">
              <button className="pass" onClick={pass} aria-label="Pass on this bill">Pass</button>
              <button onClick={like} aria-label="Pay or contribute to this bill">Pay / Chip in</button>
            </div>
          )}
        </>
      ) : (
        <div className="panel">
          <p style={{ margin: 0 }}>You&apos;ve seen every open bill for now. Check back soon.</p>
        </div>
      )}
    </>
  );
}

function Card({
  bill,
  stampOpacity = 0,
  stampSide = "right",
  ...props
}: {
  bill: BillCard;
  stampOpacity?: number;
  stampSide?: "left" | "right";
} & React.HTMLAttributes<HTMLDivElement>) {
  const paidPct = Math.round(((bill.amountCents - bill.remainingCents) / bill.amountCents) * 100);
  return (
    <div {...props}>
      <span className="stamp right" style={{ opacity: stampSide === "right" ? stampOpacity : 0 }}>PAY</span>
      <span className="stamp left" style={{ opacity: stampSide === "left" ? stampOpacity : 0 }}>PASS</span>
      <div>
        <div className="category">{bill.category}</div>
        <div className="amount">{dollars(bill.remainingCents)}</div>
        <div className="muted">
          left of {dollars(bill.amountCents)}
        </div>
      </div>
      <div>
        <div className="progress" aria-label={`${paidPct}% paid`}>
          <div style={{ width: `${paidPct}%` }} />
        </div>
        <p className="muted" style={{ margin: "10px 0 0" }}>
          {dueLabel(bill.dueDate)} ·{" "}
          {bill.contributorCount === 0
            ? "No one has chipped in yet"
            : `${bill.contributorCount} ${bill.contributorCount === 1 ? "person has" : "people have"} chipped in`}
        </p>
      </div>
    </div>
  );
}

function PaySheet({
  bill,
  onConfirm,
  onCancel,
}: {
  bill: BillCard;
  onConfirm: (amountCents: number) => Promise<void>;
  onCancel: () => void;
}) {
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const quick = QUICK_AMOUNTS.filter((c) => c < bill.remainingCents);
  const customCents = Math.round(Number(custom) * 100);
  const customValid = customCents >= 100 && customCents <= bill.remainingCents;

  async function pay(cents: number) {
    setBusy(true);
    await onConfirm(cents);
    setBusy(false);
  }

  return (
    <div className="panel">
      <p style={{ marginTop: 0 }}>
        <strong>How much do you want to give?</strong>
      </p>
      <div className="row">
        <button disabled={busy} onClick={() => pay(bill.remainingCents)}>
          Pay it all ({dollars(bill.remainingCents)})
        </button>
      </div>
      {quick.length > 0 && (
        <div className="row" style={{ marginTop: 10 }}>
          {quick.map((c) => (
            <button key={c} className="secondary" disabled={busy} onClick={() => pay(c)}>
              {dollars(c)}
            </button>
          ))}
        </div>
      )}
      <label htmlFor="custom">Or another amount</label>
      <div className="row">
        <input
          id="custom"
          inputMode="decimal"
          placeholder="$"
          value={custom}
          onChange={(e) => setCustom(e.target.value.replace(/[^0-9.]/g, ""))}
        />
        <button disabled={busy || !customValid} onClick={() => pay(customCents)} style={{ flex: "0 0 auto" }}>
          Give
        </button>
      </div>
      <p className="muted" style={{ fontSize: "0.85rem" }}>
        Test mode: no real money moves yet.
      </p>
      <button className="link" onClick={onCancel} disabled={busy}>
        Cancel
      </button>
    </div>
  );
}
