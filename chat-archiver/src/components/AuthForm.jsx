import React, { useState } from "react";

export default function AuthForm({ mode, onSubmit, loading, error }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(email, password);
      }}
      style={{ display: "grid", gap: 12 }}
    >
      <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      {error ? <div style={{ color: "#c0392b" }}>{error}</div> : null}
      <button type="submit" disabled={loading}>{loading ? "Working..." : mode === "login" ? "Login" : "Register"}</button>
    </form>
  );
}
