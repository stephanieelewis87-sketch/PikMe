import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin";
import { queuedAuctions } from "@/lib/live";
import { currentUser } from "@/lib/session";
import QueueForm from "./QueueForm";

export default async function LiveAdminPage() {
  const user = await currentUser();
  if (!isAdmin(user)) redirect("/live");
  const queued = await queuedAuctions();

  return (
    <>
      <h1>Add products to Live</h1>
      <p className="muted">
        Products go live one at a time, in the order you add them, each starting at $1. When one
        ends, the next starts on its own. <Link href="/live">See the live auction</Link>.
      </p>
      <QueueForm />

      <h2>Waiting in line</h2>
      {queued.length === 0 ? (
        <p className="muted">Nothing waiting. The next product you add starts as soon as the current auction ends.</p>
      ) : (
        <ol className="list">
          {queued.map((a, i) => (
            <li key={a.id}>
              {i + 1}. <strong>{a.title}</strong>{" "}
              <span className="muted">· runs {formatHours(a.duration_minutes)}</span>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function formatHours(minutes: number) {
  if (minutes < 60) return `${minutes} minutes`;
  const h = minutes / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} hour${h === 1 ? "" : "s"}`;
}
