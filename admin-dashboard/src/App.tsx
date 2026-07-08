import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import ProtectedRoute from './components/Layout/ProtectedRoute';
import AppLayout from './layout/AppLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ApiKeysPage from './pages/ApiKeysPage';
import UsersPage from './pages/UsersPage';
import LogsPage from './pages/LogsPage';
import ToolsPage from './pages/ToolsPage';
import SettingsPage from './pages/SettingsPage';
import FilesPage from './pages/FilesPage';

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
      <Routes>
        <Route element={<AppLayout username={user?.username || ''} role={user?.role || 'operator'} onLogout={logout} />}>
          <Route path="/" element={<ProtectedRoute isAuthenticated={isAuthenticated}><DashboardPage /></ProtectedRoute>} />
          <Route path="/files" element={<ProtectedRoute isAuthenticated={isAuthenticated}><FilesPage /></ProtectedRoute>} />
          <Route path="/keys" element={<ProtectedRoute isAuthenticated={isAuthenticated}><ApiKeysPage /></ProtectedRoute>} />
          <Route path="/users" element={<ProtectedRoute isAuthenticated={isAuthenticated}><UsersPage /></ProtectedRoute>} />
          <Route path="/tools" element={<ProtectedRoute isAuthenticated={isAuthenticated}><ToolsPage /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute isAuthenticated={isAuthenticated}><SettingsPage /></ProtectedRoute>} />
          <Route path="/logs" element={<ProtectedRoute isAuthenticated={isAuthenticated}><LogsPage /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
