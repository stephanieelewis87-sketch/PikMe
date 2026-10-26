import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin";
import { currentUser } from "@/lib/session";
import LiveAuction from "./LiveAuction";

export default async function LivePage() {
  const user = await currentUser();
  if (!user) redirect("/");
  return (
    <>
      <h1>Live</h1>
      <p className="muted">
        One auction at a time, starting at $1. The winner buys the item from PikMe. If you lose and
        ticked &quot;donate my bid,&quot; your highest bid goes toward real people&apos;s bills.
      </p>
      {isAdmin(user) && (
        <p className="notice">
          You&apos;re PikMe staff, so you can&apos;t bid. <Link href="/live/admin">Add products to the line</Link>.
        </p>
      )}
      <LiveAuction />
    </>
  );
}
