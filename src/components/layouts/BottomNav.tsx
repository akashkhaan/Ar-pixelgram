import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

// Icons matching user provided HTML snippet
const ICONS = [
  // 0: Home
  (
    <svg viewBox="0 0 24 24">
      <path d="M3.5 11 12 3.5 20.5 11" />
      <path d="M5.5 9.5V19a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5" />
      <path d="M10 20v-5.5a.8.8 0 0 1 .8-.8h2.4a.8.8 0 0 1 .8.8V20" />
    </svg>
  ),
  // 1: Video
  (
    <svg viewBox="0 0 24 24">
      <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" />
      <path d="M10 8.3v7.4l6-3.7Z" />
    </svg>
  ),
  // 2: Log (People)
  (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6.6 18c1.2-2.2 3-3.2 5.4-3.2s4.2 1 5.4 3.2" />
    </svg>
  ),
  // 3: Stories
  (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v9M7.5 12h9" />
    </svg>
  ),
  // 4: Chat (with badge 3)
  (
    <span className="ic">
      <svg viewBox="0 0 24 24">
        <path d="M12 3.8c4.6 0 8.2 3 8.2 6.9S16.6 17.6 12 17.6c-.9 0-1.7-.1-2.5-.3L5.2 19.6l1-3.6C4.6 14.9 3.8 12.9 3.8 10.7 3.8 6.8 7.4 3.8 12 3.8Z" />
        <circle cx="8.6" cy="10.8" r=".6" fill="currentColor" />
        <circle cx="12" cy="10.8" r=".6" fill="currentColor" />
        <circle cx="15.4" cy="10.8" r=".6" fill="currentColor" />
      </svg>
      <b className="badge">3</b>
    </span>
  ),
  // 5: Profile
  (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.8 20c.6-4 3.2-6 7.2-6s6.6 2 7.2 6" />
    </svg>
  ),
];

const NAV_ITEMS = [
  { path: '/home', label: 'Home' },
  { path: '/videos', label: 'Video' },
  { path: '/people', label: 'Log (People)' },
  { path: '/stories', label: 'Stories' },
  { path: '/chat', label: 'Chat' },
  { path: '/profile', label: 'Profile' },
];

const getIndexFromPath = (pathname: string): number => {
  if (pathname === '/' || pathname.startsWith('/home')) return 0;
  if (pathname.startsWith('/videos') || pathname.startsWith('/reels')) return 1;
  if (pathname.startsWith('/people')) return 2;
  if (pathname.startsWith('/stories')) return 3;
  if (
    pathname.startsWith('/chat') ||
    pathname.startsWith('/messages') ||
    pathname.startsWith('/group') ||
    pathname.startsWith('/direct')
  ) {
    return 4;
  }
  if (
    pathname.startsWith('/profile') ||
    pathname.startsWith('/settings') ||
    pathname.startsWith('/edit-profile')
  ) {
    return 5;
  }
  return 0;
};

interface Props {
  overlay?: boolean;
  hidden?: boolean;
}

const BottomNav: React.FC<Props> = ({ hidden = false }) => {
  const location = useLocation();
  const navigate = useNavigate();

  const activeIndex = useMemo(() => getIndexFromPath(location.pathname), [location.pathname]);
  const [cur, setCur] = useState(activeIndex);
  const [displayedBallIndex, setDisplayedBallIndex] = useState(activeIndex);
  const [isBallEmpty, setIsBallEmpty] = useState(false);

  const ballRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const tokenRef = useRef(0);

  // Sync with route changes
  useEffect(() => {
    setCur(activeIndex);
    setDisplayedBallIndex(activeIndex);
    setIsBallEmpty(false);
  }, [activeIndex]);

  const handleRipple = (e: React.PointerEvent<HTMLButtonElement>) => {
    const btn = e.currentTarget;
    const ring = document.createElement('span');
    ring.className = 'ring';
    btn.appendChild(ring);
    ring.addEventListener('animationend', () => ring.remove());
  };

  const handleNavClick = (idx: number, path: string) => {
    if (idx !== cur) {
      const t = ++tokenRef.current;
      setCur(idx);
      setIsBallEmpty(true);

      // Hop animation while travelling
      if (ballRef.current) {
        ballRef.current.animate(
          [
            { transform: 'translateY(0)' },
            { transform: 'translateY(-11px)', offset: 0.5 },
            { transform: 'translateY(0)' },
          ],
          { duration: 560, easing: 'ease-in-out' }
        );
      }

      // Settle and reveal icon in ball
      setTimeout(() => {
        if (t !== tokenRef.current) return;
        setDisplayedBallIndex(idx);
        requestAnimationFrame(() => {
          setIsBallEmpty(false);
        });
      }, 430);
    }

    if (location.pathname !== path) {
      navigate(path);
    }
  };

  return (
    <>
      <style>{`
        @property --x {
          syntax: '<length-percentage>';
          inherits: true;
          initial-value: 8.333%;
        }

        :root {
          --pink: #d81b60;
          --pink-dark: #b8135a;
          --ink: #111;
          --bar-h: 52px;
          --ball: 40px;
          --ease: cubic-bezier(.55, .05, .25, 1);
          --dur: .56s;
        }

        .floating-ball-nav {
          --i: 0;
          --x: calc(var(--i) * (100% / 6) + 100% / 12);
          position: fixed;
          bottom: max(14px, env(safe-area-inset-bottom, 14px));
          left: 50%;
          transform: translateX(-50%);
          width: min(512px, 94vw);
          height: var(--bar-h);
          transition: --x var(--dur) var(--ease), transform 0.3s ease-out, opacity 0.3s ease-out;
          filter: drop-shadow(0 8px 14px rgba(40, 60, 120, .22));
          z-index: 50;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
        }

        .floating-ball-nav.nav-hidden {
          transform: translate(-50%, 80px);
          opacity: 0;
          pointer-events: none;
        }

        .floating-ball-nav .bar {
          position: absolute;
          inset: 0;
          background: #fff;
          border-radius: 34px;
          -webkit-mask: radial-gradient(circle 28px at var(--x) 6px, transparent 27px, #000 28px);
                  mask: radial-gradient(circle 28px at var(--x) 6px, transparent 27px, #000 28px);
        }

        .floating-ball-nav .items {
          position: absolute;
          inset: 0;
          display: grid;
          grid-template-columns: repeat(6, 1fr);
        }

        .floating-ball-nav .item {
          position: relative;
          display: grid;
          place-items: center;
          border: 0;
          background: none;
          padding: 0;
          cursor: pointer;
          color: var(--ink);
          outline: none;
        }

        .floating-ball-nav .item svg {
          width: 22px;
          height: 22px;
          fill: none;
          stroke: currentColor;
          stroke-width: 2;
          stroke-linecap: round;
          stroke-linejoin: round;
          transition: color .2s, opacity .25s, transform .25s;
        }

        .floating-ball-nav .item:hover,
        .floating-ball-nav .item:active,
        .floating-ball-nav .item:focus-visible {
          color: var(--pink-dark);
        }

        .floating-ball-nav .item.active svg {
          opacity: 0;
          transform: scale(.5);
        }

        .floating-ball-nav .ic {
          position: relative;
          display: grid;
          place-items: center;
        }

        .floating-ball-nav .badge {
          position: absolute;
          top: -7px;
          right: -9px;
          min-width: 16px;
          height: 16px;
          padding: 0 4px;
          border-radius: 99px;
          background: #0f9d8a;
          color: #fff;
          font: 700 10px/16px system-ui, sans-serif;
          text-align: center;
          box-shadow: 0 0 0 2px #fff;
          transition: opacity .25s;
        }

        .floating-ball-nav .ball .badge {
          box-shadow: 0 0 0 2px var(--pink);
        }

        .floating-ball-nav .item.active .badge {
          opacity: 0;
        }

        .floating-ball-nav .ring {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 34px;
          height: 34px;
          margin: -17px 0 0 -17px;
          border-radius: 50%;
          border: 2px solid rgba(216, 27, 96, .55);
          pointer-events: none;
          animation: ring .55s ease-out forwards;
        }

        @keyframes ring {
          from { transform: scale(.4); opacity: 1; }
          to   { transform: scale(1.5); opacity: 0; }
        }

        .floating-ball-nav .ball {
          position: absolute;
          top: calc(6px - var(--ball) / 2);
          left: calc(var(--i) * (100% / 6) + 100% / 12 - var(--ball) / 2);
          width: var(--ball);
          height: var(--ball);
          border-radius: 50%;
          background: linear-gradient(150deg, #ee2b78 0%, var(--pink) 45%, var(--pink-dark) 100%);
          box-shadow: 0 8px 14px rgba(216, 27, 96, .42);
          display: grid;
          place-items: center;
          pointer-events: none;
          transition: left var(--dur) var(--ease);
          will-change: left, transform;
        }

        .floating-ball-nav .ball svg {
          width: 22px;
          height: 22px;
          fill: none;
          stroke: #fff;
          stroke-width: 2;
          stroke-linecap: round;
          stroke-linejoin: round;
          transition: opacity .2s, transform .25s;
        }

        .floating-ball-nav .ball.empty svg {
          opacity: 0;
          transform: scale(.4);
        }

        @media (prefers-reduced-motion: reduce) {
          .floating-ball-nav, .floating-ball-nav .ball {
            transition-duration: .01s;
          }
        }
      `}</style>

      <nav
        ref={navRef}
        aria-label="Bottom navigation"
        className={cn('floating-ball-nav', hidden && 'nav-hidden')}
        style={{ '--i': cur, '--x': `calc(${cur} * (100% / 6) + 100% / 12)` } as React.CSSProperties}
      >
        <div className="bar" />

        <div className="items">
          {NAV_ITEMS.map((item, i) => (
            <button
              key={item.path}
              type="button"
              className={cn('item', cur === i && 'active')}
              aria-label={item.label}
              data-i={i}
              onPointerDown={handleRipple}
              onClick={() => handleNavClick(i, item.path)}
            >
              {ICONS[i]}
            </button>
          ))}
        </div>

        <div
          ref={ballRef}
          className={cn('ball', isBallEmpty && 'empty')}
        >
          {ICONS[displayedBallIndex]}
        </div>
      </nav>
    </>
  );
};

export default BottomNav;
