import React from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "./contexts/AuthContext";
import AuthPage from "./pages/AuthPage";
import MainPage from "./pages/MainPage";
import { useAuth } from "./contexts/AuthContext";

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div>Loading…</div>;
  }

  return user ? <MainPage /> : <AuthPage />;
}

const container = document.getElementById("root");
const root = createRoot(container);
root.render(
  <AuthProvider>
    <App />
  </AuthProvider>
);
