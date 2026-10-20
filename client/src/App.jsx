import { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { api } from './api';
import Login from './pages/Login';
import History from './pages/History';
import Dashboard from './pages/Dashboard';

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = still checking
  const navigate = useNavigate();

  useEffect(() => {
    api
      .me()
      .then(({ username }) => setUser(username))
      .catch(() => setUser(null));
  }, []);

  async function logout() {
    try {
      await api.logout();
    } finally {
      setUser(null);
      navigate('/login', { replace: true });
    }
  }

  if (user === undefined) return null;

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login onLogin={setUser} />} />
      </Routes>
    );
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link to="/" className="wordmark">
          Callista
          <small>personal health history</small>
        </Link>
        <nav className="nav" aria-label="Main">
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/history">Consumption</NavLink>
        </nav>
        <div className="who">
          <div className="user">{user}</div>
          <button className="linklike" onClick={logout}>
            Log out
          </button>
        </div>
      </aside>
      <main>
        <Routes>
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/" element={<Dashboard />} />
          <Route path="/history" element={<History />} />
          <Route path="/dashboard" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}