import InAppBrowserModal from "@/components/common/InAppBrowserModal";
import React, { Suspense, useEffect } from "react";
import { useAuth } from '@/contexts/AuthContext';
import { resumeAllPendingUploads } from '@/services/persistentUploadQueue';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { audioPlayerService } from "@/services/audioPlayerService";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { RouteGuard } from "@/components/common/RouteGuard";
import { CallProvider } from "@/contexts/CallContext";
import { GroupCallProvider } from "@/contexts/GroupCallContext";
import { CallOverlay, IncomingCallModal } from "@/components/call/CallOverlay";
import { IncomingGroupCallModal } from "@/components/call/IncomingGroupCallModal";
import GroupCallOverlay from "@/components/call/GroupCallOverlay";
import UploadProgressOverlay from "@/components/common/UploadProgressOverlay";
import AppUpdateSheet from "@/components/common/AppUpdateSheet";
import { routes } from "./routes";
import { useVisitTracker } from "@/hooks/useVisitTracker";


const UploadAutoResumer: React.FC = () => {
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return;
    try {
      void resumeAllPendingUploads();
    } catch (e) {
      console.warn("Upload resume error:", e);
    }
  }, [user?.id]);
  return null;
};

const VisitTracker: React.FC = () => {
  useVisitTracker();
  return null;
};

const GlobalAudioAutoStopper: React.FC = () => {
  const location = useLocation();

  useEffect(() => {
    if (!location.pathname.startsWith('/song/')) {
      audioPlayerService.stop();
    }
  }, [location.pathname]);

  useEffect(() => {
    const stopAll = () => {
      audioPlayerService.stop();
      document.querySelectorAll('audio').forEach((a) => {
        try { a.pause(); } catch {}
      });
    };
    window.addEventListener('popstate', stopAll);
    window.addEventListener('appCallBackPressed', stopAll);
    window.addEventListener('pagehide', stopAll);
    return () => {
      window.removeEventListener('popstate', stopAll);
      window.removeEventListener('appCallBackPressed', stopAll);
      window.removeEventListener('pagehide', stopAll);
    };
  }, []);

  return null;
};

const App: React.FC = () => {
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        (window as any).AndroidNotification?.setWebReady?.();
      }
    } catch {}
  }, []);
  return (
    <LanguageProvider>
      <Router>
        <AuthProvider>
          <CallProvider>
            <GroupCallProvider>
              <VisitTracker />
              <GlobalAudioAutoStopper />
              <UploadAutoResumer />
              <RouteGuard>
                <Suspense fallback={<div className="min-h-screen bg-background" aria-busy="true" />}>
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
                </Suspense>
              </RouteGuard>
              <IncomingCallModal />
              <IncomingGroupCallModal />
              <CallOverlay />
              <GroupCallOverlay />
              <UploadProgressOverlay />
              <InAppBrowserModal />
              <AppUpdateSheet />
            </GroupCallProvider>
          </CallProvider>
        </AuthProvider>
        <Toaster />
      </Router>
    </LanguageProvider>
  );
};

export default App;
