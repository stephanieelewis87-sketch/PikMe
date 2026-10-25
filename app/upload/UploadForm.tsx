"use client";

import { useActionState } from "react";
import { uploadBill, type UploadState } from "../actions";
import { CATEGORIES } from "@/lib/types";

export default function UploadForm() {
  const [state, action, pending] = useActionState<UploadState, FormData>(uploadBill, { error: null });
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={action} className="panel">
      <label htmlFor="category">What kind of bill is it?</label>
      <select id="category" name="category" required defaultValue="">
        <option value="" disabled>Choose a category</option>
        {CATEGORIES.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>

      <label htmlFor="amount">Amount due</label>
      <input id="amount" name="amount" type="number" min="1" max="100000" step="0.01" placeholder="$" required />

      <label htmlFor="dueDate">Due date</label>
      <input id="dueDate" name="dueDate" type="date" min={today} required />

      <label htmlFor="document">
        The bill itself <small>(optional PDF or photo, kept private for verification only)</small>
      </label>
      <input id="document" name="document" type="file" accept="application/pdf,image/png,image/jpeg" />

      {state.error && <p className="error">{state.error}</p>}
      <button disabled={pending} style={{ marginTop: 20, width: "100%" }}>
        {pending ? "Posting…" : "Post bill"}
      </button>
    </form>
  );
}
