"use client";

import { useActionState } from "react";
import { queueProduct, type QueueState } from "../../actions";

export default function QueueForm() {
  const [state, action, pending] = useActionState<QueueState, FormData>(queueProduct, { error: null, added: null });

  return (
    <form action={action} className="panel" key={state.added ?? "form"}>
      <label htmlFor="title">Product name</label>
      <input id="title" name="title" maxLength={120} required placeholder="Wireless earbuds" />

      <label htmlFor="description">Description <small>(optional)</small></label>
      <textarea id="description" name="description" rows={3} maxLength={1000} />

      <label htmlFor="hours">How long it runs, in hours</label>
      <input id="hours" name="hours" type="number" min="0.05" max="168" step="0.05" defaultValue="24" required />

      {state.error && <p className="error">{state.error}</p>}
      {state.added && <p className="muted" role="status">Added &quot;{state.added}&quot; to the line.</p>}
      <button disabled={pending} style={{ marginTop: 16, width: "100%" }}>
        {pending ? "Adding…" : "Add to the line"}
      </button>
    </form>
  );
}
