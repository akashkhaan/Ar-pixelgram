import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

// Pixel-perfect SVG icons matching the screenshot
const HomeIcon: React.FC<{ active?: boolean; className?: string }> = ({ active, className }) => (
  <svg viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? 1.5 : 1.8} className={className || "w-5 h-5"}>
    <path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-4v6H4a1 1 0 0 1-1-1v-9.5z" />
  </svg>
);

const VideoReelIcon: React.FC<{ active?: boolean; className?: string }> = ({ active, className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} className={className || "w-5 h-5"}>
    <rect x="2.5" y="3.5" width="19" height="17" rx="3.5" />
    <path d="M7 3.5v3.5M17 3.5v3.5M7 17v3.5M17 17v3.5" strokeWidth={1.5} />
    <polygon points="10 8.5 16 12 10 15.5 10 8.5" fill="currentColor" stroke="none" />
  </svg>
);

const PeopleIcon: React.FC<{ active?: boolean; className?: string }> = ({ active, className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} className={className || "w-5 h-5"}>
    <circle cx="12" cy="12" r="9.5" />
    <circle cx="12" cy="9.5" r="3" />
    <path d="M6.5 18c0-2.8 2.5-4.8 5.5-4.8s5.5 2 5.5 4.8" />
  </svg>
);

const StoriesIcon: React.FC<{ active?: boolean; className?: string }> = ({ active, className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} className={className || "w-5 h-5"}>
    <circle cx="12" cy="12" r="9.5" />
    <path d="M12 7.5v9M7.5 12h9" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" />
  </svg>
);

const ChatIcon: React.FC<{ active?: boolean; className?: string }> = ({ active, className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} className={className || "w-5 h-5"}>
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    <circle cx="8" cy="12" r="1" fill="currentColor" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
    <circle cx="16" cy="12" r="1" fill="currentColor" />
  </svg>
);

const ProfileIcon: React.FC<{ active?: boolean; className?: string }> = ({ active, className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} className={className || "w-5 h-5"}>
    <circle cx="12" cy="8" r="4" />
    <path d="M5.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5" />
  </svg>
);

interface NavItemDef {
  path: string;
  icon: React.FC<{ active?: boolean; className?: string }>;
  label: string;
  badge?: number | string;
}

const BottomNav: React.FC<{ overlay?: boolean; hidden?: boolean }> = ({ hidden = false }) => {
  const location = useLocation();
  const { t } = useLanguage();

  const navItems: NavItemDef[] = [
    { path: '/home', icon: HomeIcon, label: t('home') || 'होम' },
    { path: '/videos', icon: VideoReelIcon, label: 'वीडियो' },
    { path: '/people', icon: PeopleIcon, label: 'लोग' },
    { path: '/stories', icon: StoriesIcon, label: t('stories') || 'स्टोरीज़' },
    { path: '/chat', icon: ChatIcon, label: t('chat') || 'चैट', badge: 3 },
    { path: '/profile', icon: ProfileIcon, label: t('profile') || 'प्रोफ़ाइल' },
  ];

  return (
    <nav
      aria-label="Bottom Navigation"
      className={cn(
        'fixed bottom-3.5 left-1/2 -translate-x-1/2 w-[calc(100%-1.25rem)] max-w-[430px] z-50 pointer-events-auto transition-all duration-300 ease-out select-none safe-bottom',
        hidden && 'translate-y-24 opacity-0 pointer-events-none'
      )}
    >
      {/* Outer Floating Pill Capsule Container */}
      <div className="relative rounded-full p-[1.5px] dynamic-rainbow-border shadow-[0_10px_35px_rgba(0,0,0,0.85),0_0_30px_rgba(99,102,241,0.4)]">
        <div className="rounded-full bg-[#090a16]/92 backdrop-blur-2xl px-2 py-1.5 flex items-center justify-between w-full">
        {navItems.map(({ path, icon: IconComponent, label, badge }) => {
          const isActive =
            location.pathname === path || (path !== '/' && path !== '/home' && location.pathname.startsWith(path));

          return (
            <Link
              key={path}
              to={path}
              className="relative flex flex-col items-center justify-center flex-1 transition-all duration-200"
            >
              {isActive ? (
                /* Glowing Active Capsule Pill matching the screenshot */
                <div className="relative flex flex-col items-center justify-center p-[2px] rounded-full dynamic-rainbow-border shadow-[0_0_22px_rgba(99,102,241,0.7),0_0_35px_rgba(217,70,239,0.4)] scale-105 transition-all">
                  <div className="w-full h-full px-3.5 py-1 rounded-full bg-[#0a0a14]/85 backdrop-blur-md flex flex-col items-center justify-center">
                  <div className="text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.85)]">
                    <IconComponent active={true} className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-[10px] font-bold text-white tracking-tight mt-0.5 leading-none">
                    {label}
                  </span>
                  {/* Glowing Dot Underneath */}
                  <span className="w-1 h-1 rounded-full bg-white shadow-[0_0_6px_#ffffff] mt-1" />
                  </div>
                </div>
              ) : (
                /* Inactive Option */
                <div className="relative flex flex-col items-center justify-center py-1 px-1 text-white/70 hover:text-white transition-colors active:scale-95">
                  <div className="relative">
                    <IconComponent active={false} className="w-5 h-5 text-white/80 transition-colors" />
                    {/* Badge if present (like the red '3' badge on chat) */}
                    {badge !== undefined && (
                      <span className="absolute -top-1.5 -right-2.5 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center shadow-[0_0_8px_rgba(244,63,94,0.9)] animate-pulse">
                        {badge}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-medium text-white/70 mt-1 leading-none">
                    {label}
                  </span>
                </div>
              )}
            </Link>
          );
        })}
        </div>
      </div>
    </nav>
  );
};

export default BottomNav;
