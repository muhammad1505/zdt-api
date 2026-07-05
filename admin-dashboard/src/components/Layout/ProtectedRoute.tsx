import { Navigate } from 'react-router-dom';

interface Props {
  children: React.ReactNode;
  isAuthenticated: boolean;
}

export default function ProtectedRoute({ children, isAuthenticated }: Props) {
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
