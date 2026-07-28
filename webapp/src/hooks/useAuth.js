import { useState } from 'react';
import { fetchJson, getToken, setToken, clearToken } from '../api/client';

export function useAuth() {
  const [isLoggedIn, setIsLoggedIn] = useState(!!getToken());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const login = async (email, password) => {
    setError('');
    setLoading(true);
    try {
      const response = await fetchJson('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setToken(response.access_token);
      setIsLoggedIn(true);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    clearToken();
    setIsLoggedIn(false);
  };

  return { isLoggedIn, login, logout, loading, error };
}