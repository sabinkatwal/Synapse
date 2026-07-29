import { useAuth } from './hooks/useAuth';
import Login from './components/Login';
import Dashboard from './components/Dashboard';

function App() {
  const { isLoggedIn, login, logout, loading, error } = useAuth();

  if (!isLoggedIn) {
    return <Login onLogin={login} loading={loading} error={error} />;
  }

  return <Dashboard onLogout={logout} />;
}

export default App;