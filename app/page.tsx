import Link from "next/link";
import { signIn } from "./actions";
import { currentUser } from "@/lib/session";

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await currentUser();
  const { error } = await searchParams;

  return (
    <>
      <h1>Swipe right to help pay a bill.</h1>
      <p className="muted">
        People post bills they need help with. You see the bill and nothing else: no photos, no
        videos, no stories, no names. Swipe right to pay it or chip in, or swipe left to pass.
      </p>
      <p className="muted">
        Once a bill is fully paid, the people involved can share their experience and connect.
      </p>

      {user ? (
        <div className="row" style={{ marginTop: 24 }}>
          <Link href="/swipe" className="button">Start swiping</Link>
          <Link href="/upload" className="button" style={{ background: "transparent", color: "inherit", border: "1px solid var(--border)" }}>
            Upload a bill
          </Link>
        </div>
      ) : (
        <form action={signIn} className="panel" style={{ marginTop: 24 }}>
          <label htmlFor="name">
            Pick a display name <small>(never shown on bills)</small>
          </label>
          <input id="name" name="name" maxLength={40} required autoComplete="nickname" />
          {error === "name" && <p className="error">Enter a name to continue.</p>}
          <button style={{ marginTop: 16, width: "100%" }}>Get started</button>
        </form>
      )}
    </>
  );
}
