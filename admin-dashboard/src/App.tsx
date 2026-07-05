import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import ProtectedRoute from './components/Layout/ProtectedRoute';
import Sidebar from './components/Layout/Sidebar';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ApiKeysPage from './pages/ApiKeysPage';
import UsersPage from './pages/UsersPage';
import LogsPage from './pages/LogsPage';
import ToolsPage from './pages/ToolsPage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  const { user, loading, error, isAuthenticated, login, logout } = useAuth();

  if (!isAuthenticated) {
    return (
      <LoginPage
        onLogin={login}
        error={error}
        loading={loading}
      />
    );
  }

  return (
    <BrowserRouter>
      <div style={{ display: 'flex' }}>
        <Sidebar username={user?.username || ''} onLogout={logout} />
        <main style={{ marginLeft: 240, flex: 1, padding: 32, minHeight: '100vh' }}>
          <Routes>
            <Route path="/" element={<ProtectedRoute isAuthenticated={isAuthenticated}><DashboardPage /></ProtectedRoute>} />
            <Route path="/keys" element={<ProtectedRoute isAuthenticated={isAuthenticated}><ApiKeysPage /></ProtectedRoute>} />
            <Route path="/users" element={<ProtectedRoute isAuthenticated={isAuthenticated}><UsersPage /></ProtectedRoute>} />
            <Route path="/tools" element={<ProtectedRoute isAuthenticated={isAuthenticated}><ToolsPage /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute isAuthenticated={isAuthenticated}><SettingsPage /></ProtectedRoute>} />
            <Route path="/logs" element={<ProtectedRoute isAuthenticated={isAuthenticated}><LogsPage /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
