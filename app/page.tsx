import Link from "next/link";
import AuthForm from "./AuthForm";
import { currentUser } from "@/lib/session";

export default async function Home() {
  const user = await currentUser();

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
        <AuthForm />
      )}
    </>
  );
}
