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
    return (
      <div className="fixed inset-0 bg-[#0B0B0F] z-50 flex flex-col items-center justify-center pointer-events-none">
        <img src="/icons/icon-192.png" alt="Pixelgram" className="w-[76px] h-[76px] rounded-[18px] shadow-[0_8px_30px_rgba(255,61,127,0.35)] mb-3.5" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
        <span className="font-['Bricolage_Grotesque'] text-xl font-extrabold bg-gradient-to-r from-[#FF3D7F] to-[#7C5CFF] bg-clip-text text-transparent">Pixelgram</span>
      </div>
    );
  }

  // Only if no account exists/unauthenticated, show the Sign In / Sign Up screen
  return <LoginPage />;
};

export default RootRedirect;
