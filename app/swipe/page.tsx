import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import Deck from "./Deck";

export default async function SwipePage() {
  if (!(await currentUser())) redirect("/");
  return (
    <>
      <h1>Bills that need help</h1>
      <p className="muted">Swipe right to pay or chip in. Swipe left to pass.</p>
      <Deck />
    </>
  );
}
