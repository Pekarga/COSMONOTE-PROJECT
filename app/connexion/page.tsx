"use client";
import { useState } from "react";
import { Logo } from "@/components/Logo";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) window.location.href = "/";
    else setError("Mot de passe incorrect.");
  }

  return (
    <form className="card login" onSubmit={submit}>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <Logo size={56} />
      </div>
      <h1 style={{ fontSize: "1.6rem" }}>Le rédacteur</h1>
      <p className="muted">Entre ton mot de passe pour accéder à tes notes.</p>
      <input
        className="input"
        type="password"
        autoFocus
        placeholder="Mot de passe"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error && <div className="error-box">{error}</div>}
      <button className="btn btn-primary">Se connecter</button>
    </form>
  );
}
