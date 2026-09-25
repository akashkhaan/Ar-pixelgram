import React, { useEffect } from "react";
import { resumeAllPendingUploads } from '@/services/persistentUploadQueue';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { RouteGuard } from "@/components/common/RouteGuard";
import { CallProvider } from "@/contexts/CallContext";
import { GroupCallProvider } from "@/contexts/GroupCallContext";
import { CallOverlay, IncomingCallModal } from "@/components/call/CallOverlay";
import { IncomingGroupCallModal } from "@/components/call/IncomingGroupCallModal";
import GroupCallOverlay from "@/components/call/GroupCallOverlay";
import { routes } from "./routes";
import { useVisitTracker } from "@/hooks/useVisitTracker";
import UploadProgressOverlay from "@/components/common/UploadProgressOverlay";


const UploadAutoResumer: React.FC = () => {
  useEffect(() => {
    try {
      void resumeAllPendingUploads();
    } catch (e) {
      console.warn('Upload resume error:', e);
    }

    const handleOnline = () => {
      try {
        void resumeAllPendingUploads();
      } catch (e) {
        console.warn('Online resume error:', e);
      }
    };
    window.addEventListener('online', handleOnline);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        try {
          void resumeAllPendingUploads();
        } catch (e) {
          console.warn('Visibility resume error:', e);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return null;
};

const VisitTracker: React.FC = () => {
  useVisitTracker();
  return null;
};

const App: React.FC = () => {
  return (
    <LanguageProvider>
      <Router>
        <AuthProvider>
          <CallProvider>
            <GroupCallProvider>
              <VisitTracker />
              <UploadAutoResumer />
              <RouteGuard>
                <Routes>
                  {routes.map((route, index) => (
                    <Route
                      key={index}
                      path={route.path}
                      element={route.element}
                    />
                  ))}
                  <Route path="*" element={<Navigate to="/home" replace />} />
                </Routes>
              </RouteGuard>
              <IncomingCallModal />
              <IncomingGroupCallModal />
              <CallOverlay />
              <GroupCallOverlay />
              <UploadProgressOverlay />
            </GroupCallProvider>
          </CallProvider>
        </AuthProvider>
        <Toaster />
      </Router>
    </LanguageProvider>
  );
};

export default App;
