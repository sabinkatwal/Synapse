import React from "react";
import AuthForm from "../components/AuthForm";
import { useAuth } from "../contexts/AuthContext";

export default function AuthPage() {
  const { login, register, loading, error, setError } = useAuth();

  const handleSubmit = async (mode, email, password) => {
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(email, password);
      }
    } catch (err) {
      setError(err.message || "Authentication failed");
    }
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h2>Welcome to Synapse</h2>
      <AuthForm mode="login" onSubmit={(email, password) => handleSubmit("login", email, password)} loading={loading} error={error} />
      <AuthForm mode="register" onSubmit={(email, password) => handleSubmit("register", email, password)} loading={loading} error={error} />
    </div>
  );
}
