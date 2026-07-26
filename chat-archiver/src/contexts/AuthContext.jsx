import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getStoredValue, setStoredValue } from "../utils/storage";
import { api } from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const bootstrap = useCallback(async () => {
    try {
      const storedToken = await getStoredValue("authToken", null);
      if (!storedToken) {
        setUser(null);
        setToken(null);
        setLoading(false);
        return;
      }

      setToken(storedToken);
      const me = await api.me();
      setUser(me);
    } catch (err) {
      setUser(null);
      setToken(null);
      await setStoredValue("authToken", null);
      setError(err.message || "Session expired.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const login = useCallback(async (email, password) => {
    const data = await api.login(email, password);
    await setStoredValue("authToken", data.access_token);
    setToken(data.access_token);
    const me = await api.me();
    setUser(me);
    setError("");
  }, []);

  const register = useCallback(async (email, password) => {
    const data = await api.register(email, password);
    await setStoredValue("authToken", data.access_token);
    setToken(data.access_token);
    const me = await api.me();
    setUser(me);
    setError("");
  }, []);

  const logout = useCallback(async () => {
    await setStoredValue("authToken", null);
    setToken(null);
    setUser(null);
    setError("");
  }, []);

  const value = useMemo(
    () => ({ user, token, loading, error, setError, login, register, logout }),
    [user, token, loading, error, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
