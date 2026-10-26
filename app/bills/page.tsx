import Link from "next/link";
import { redirect } from "next/navigation";
import { billsOwnedBy, contributionsBy } from "@/lib/db";
import { dollars, dueLabel } from "@/lib/format";
import { currentUser } from "@/lib/session";

export default async function BillsPage({ searchParams }: { searchParams: Promise<{ uploaded?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/");
  const { uploaded } = await searchParams;
  const [mine, given] = await Promise.all([billsOwnedBy(user.id), contributionsBy(user.id)]);

  return (
    <>
      <h1>My bills</h1>
      {uploaded && <p className="notice" role="status">Your bill is live in the swipe portal.</p>}

      <h2>Bills I posted</h2>
      {mine.length === 0 ? (
        <p className="muted">
          None yet. <Link href="/upload">Upload a bill</Link>.
        </p>
      ) : (
        <ul className="list">
          {mine.map((b) => (
            <li key={b.id}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <strong>{b.category}</strong>
                <span className={b.remainingCents === 0 ? "badge paid" : "badge"}>
                  {b.remainingCents === 0 ? "Paid" : dueLabel(b.dueDate)}
                </span>
              </div>
              <div className="muted">
                {dollars(b.amountCents - b.remainingCents)} of {dollars(b.amountCents)} covered by{" "}
                {b.contributorCount} {b.contributorCount === 1 ? "person" : "people"}
              </div>
              {b.remainingCents === 0 && <SocialTeaser />}
            </li>
          ))}
        </ul>
      )}

      <h2>Bills I helped pay</h2>
      {given.length === 0 ? (
        <p className="muted">
          None yet. <Link href="/swipe">Start swiping</Link>.
        </p>
      ) : (
        <ul className="list">
          {given.map((g) => (
            <li key={g.id}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <strong>{g.bill.category}</strong>
                <span className={g.bill.remainingCents === 0 ? "badge paid" : "badge"}>
                  {g.bill.remainingCents === 0 ? "Paid" : `${dollars(g.bill.remainingCents)} left`}
                </span>
              </div>
              <div className="muted">You gave {dollars(g.amountCents)}</div>
              {g.bill.remainingCents === 0 && <SocialTeaser />}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// The social layer (videos, connecting) opens only after a bill is paid.
// It's not built yet; this marks where it will live.
function SocialTeaser() {
  return (
    <p className="muted" style={{ margin: "8px 0 0", fontSize: "0.9rem" }}>
      This bill is paid. Sharing your story and connecting with the people involved is coming soon.
    </p>
  );
}
