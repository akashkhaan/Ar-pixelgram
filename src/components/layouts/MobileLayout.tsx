import BottomNav from "@/components/layouts/BottomNav";
import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Video, BookOpen, MessageCircle, User, Bell, Globe } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUnreadNotifications } from '@/hooks/useUnreadNotifications';
import { cn } from '@/lib/utils';

interface MobileLayoutProps {
  children: React.ReactNode;
  hideNav?: boolean;
  hideHeader?: boolean; // top header (logo + notification bell) छिपाओ
  autoHideNav?: boolean; // scroll down पर bottom nav गायब, scroll up पर वापस (YouTube जैसा)
  fullscreen?: boolean; // header + nav दोनों छिपाओ, pure black bg (reels के लिए)
  noScroll?: boolean; // freeze page, only allow internal scroll (e.g. Chat)
}

const MobileLayout: React.FC<MobileLayoutProps> = ({ children, hideNav = false, hideHeader = false, autoHideNav = true, fullscreen = false, noScroll = false }) => {
  const location = useLocation();
  const [navHidden, setNavHidden] = useState(false);
  const lastScrollY = useRef(0);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const scrollArea = mainRef.current;
    if (!autoHideNav || hideNav || !scrollArea) {
      setNavHidden(false);
      return;
    }
    const onScroll = () => {
      const y = Math.max(scrollArea.scrollTop, window.scrollY);
      const delta = y - lastScrollY.current;
      if (y <= 40) setNavHidden(false);
      else if (delta > 6) setNavHidden(true);
      else if (delta < -6) setNavHidden(false);
      lastScrollY.current = y;
    };
    scrollArea.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scrollArea.removeEventListener('scroll', onScroll);
      window.removeEventListener('scroll', onScroll);
    };
  }, [autoHideNav, hideNav]);
  const { profile, user } = useAuth();
  const { t } = useLanguage();
  const unreadNotifications = useUnreadNotifications(user?.id);
  // fullscreen mode — reels की तरह pure black, no header, no nav
  if (fullscreen) {
    return (
      <div className="fixed inset-0 w-full bg-black overflow-hidden">
        {children}
      </div>
    );
  }

  const navItems = [
    { path: '/home', icon: Home, label: t('home') },
    { path: '/videos', icon: Video, label: 'वीडियो' },
    { path: '/people', icon: Globe, label: 'लोग' },
    { path: '/stories', icon: BookOpen, label: t('stories') },
    { path: '/chat', icon: MessageCircle, label: t('chat') },
    { path: '/profile', icon: User, label: t('profile') },
  ];

  return (
    <div className={cn("flex flex-col w-full max-w-lg mx-auto bg-background", noScroll ? "fixed inset-0 overflow-hidden" : "min-h-screen")}>
      {/* Premium Top Header */}
      {!hideHeader && (
      <header className="sticky top-0 z-40 flex items-center justify-between px-4 py-3 glass-card border-b border-border/40">
        {/* Logo with animated rainbow */}
        <Link to="/home" className="flex items-center gap-2">
          <span className="text-xl font-black rainbow-text tracking-tight">Pixelgram</span>
        </Link>

        <div className="flex items-center gap-1">
          {/* Notifications */}
          <Link to="/notifications" className="relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted/60 transition-colors">
            <Bell className="w-5 h-5 text-foreground" />
            {unreadNotifications > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex min-w-4 h-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground ring-2 ring-background">
                {unreadNotifications > 99 ? '99+' : unreadNotifications}
              </span>
            )}
          </Link>
        </div>
      </header>
      )}

      {/* Main Content */}
      <main ref={mainRef} className={cn('flex-1', noScroll ? 'min-h-0 overflow-hidden flex flex-col' : 'overflow-y-auto', !hideNav && 'pb-nav')}>
        {children}
      </main>

      {!hideNav && <BottomNav hidden={navHidden} />}

    </div>
  );
};

export default MobileLayout;
