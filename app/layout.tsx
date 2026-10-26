import type { Metadata } from "next";
import Link from "next/link";
import { signOut } from "./actions";
import { currentUser } from "@/lib/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "PikMe",
  description: "Swipe right to help pay a bill. No photos, no stories, no bias.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <html lang="en">
      <body>
        <header className="nav">
          <Link href="/" className="brand">
            Pik<span>Me</span>
          </Link>
          {user && (
            <nav>
              <Link href="/swipe">Swipe</Link>
              <Link href="/live">Live</Link>
              <Link href="/upload">Upload a bill</Link>
              <Link href="/bills">My bills</Link>
              <form action={signOut}>
                <button className="link">Sign out</button>
              </form>
            </nav>
          )}
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
