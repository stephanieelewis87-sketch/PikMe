"use client";

import { useActionState, useState } from "react";
import { signIn, signUp, type AuthState } from "./actions";

export default function AuthForm() {
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  return mode === "signup" ? (
    <Form key="signup" mode="signup" onSwitch={() => setMode("signin")} />
  ) : (
    <Form key="signin" mode="signin" onSwitch={() => setMode("signup")} />
  );
}

function Form({ mode, onSwitch }: { mode: "signup" | "signin"; onSwitch: () => void }) {
  const signup = mode === "signup";
  const [state, action, pending] = useActionState<AuthState, FormData>(signup ? signUp : signIn, {
    error: null,
    email: "",
  });

  return (
    <form action={action} className="panel" style={{ marginTop: 24 }}>
      <h2 style={{ margin: 0 }}>{signup ? "Create your account" : "Welcome back"}</h2>
      <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.9rem" }}>
        Your email stays private. It&apos;s never shown on bills or to swipers.
      </p>

      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" required autoComplete="email" defaultValue={state.email} />

      <label htmlFor="password">
        Password {signup && <small>(at least 8 characters)</small>}
      </label>
      <input
        id="password"
        name="password"
        type="password"
        required
        minLength={signup ? 8 : undefined}
        autoComplete={signup ? "new-password" : "current-password"}
      />

      {state.error && <p className="error" role="alert">{state.error}</p>}
      <button disabled={pending} style={{ marginTop: 16, width: "100%" }}>
        {pending ? "One moment…" : signup ? "Create account" : "Sign in"}
      </button>
      <p className="muted" style={{ margin: "12px 0 0", textAlign: "center" }}>
        {signup ? "Already have an account? " : "New here? "}
        <button type="button" className="link" onClick={onSwitch} style={{ color: "var(--text)", textDecoration: "underline" }}>
          {signup ? "Sign in" : "Create an account"}
        </button>
      </p>
    </form>
  );
}
