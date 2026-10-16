import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import LoginPage from '@/pages/auth/LoginPage';

export const RootRedirect: React.FC = () => {
  const { user, loading } = useAuth();

  // If user is already logged in, go straight to /home without flashing login screen
  if (user) {
    return <Navigate to="/home" replace />;
  }

  // If session is still verifying, show dark backdrop matching native splash
  if (loading) {
    return <div className="fixed inset-0 bg-[#0B0B0F] z-50 pointer-events-none" />;
  }

  // Only if no account exists/unauthenticated, show the Sign In / Sign Up screen
  return <LoginPage />;
};

export default RootRedirect;
