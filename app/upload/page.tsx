import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import UploadForm from "./UploadForm";

export default async function UploadPage() {
  if (!(await currentUser())) redirect("/");
  return (
    <>
      <h1>Upload a bill</h1>
      <p className="muted">
        Swipers only see the category, the amount, and the due date. There&apos;s no place for
        photos or stories here, so every bill gets the same fair look.
      </p>
      <UploadForm />
    </>
  );
}
