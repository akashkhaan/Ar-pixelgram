import React from 'react';

/**
 * Share sheet ke app icons — local SVG (koi internet image nahi).
 * Pehle flaticon ke remote PNG use ho rahe the jo offline/slow network par
 * khaali dikhte the (WhatsApp ka logo hi nahi aata tha).
 */

type Props = { className?: string };

export const WhatsAppIcon: React.FC<Props> = ({ className = 'w-6 h-6' }) => (
  <svg viewBox="0 0 32 32" className={className} fill="#fff" aria-hidden="true">
    <path d="M16.02 4C9.4 4 4.03 9.37 4.03 15.99c0 2.11.56 4.17 1.6 5.98L4 28l6.2-1.6a11.94 11.94 0 0 0 5.82 1.5h.01c6.61 0 11.98-5.37 11.98-11.99C28.01 9.37 22.64 4 16.02 4Zm0 21.86h-.01a9.9 9.9 0 0 1-5.04-1.38l-.36-.21-3.68.95.98-3.58-.23-.37a9.86 9.86 0 0 1-1.51-5.28c0-5.48 4.46-9.94 9.95-9.94a9.9 9.9 0 0 1 9.93 9.95c0 5.48-4.46 9.86-10.03 9.86Zm5.45-7.4c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.95 1.17-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.65-2.05-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.03 1.01-1.03 2.46 0 1.45 1.05 2.85 1.2 3.05.15.2 2.07 3.32 5.03 4.53.7.3 1.25.48 1.68.61.7.22 1.34.19 1.84.12.56-.08 1.72-.7 1.97-1.38.24-.67.24-1.25.17-1.37-.07-.12-.27-.19-.57-.34Z" />
  </svg>
);

export const FacebookIcon: React.FC<Props> = ({ className = 'w-6 h-6' }) => (
  <svg viewBox="0 0 32 32" className={className} fill="#fff" aria-hidden="true">
    <path d="M19.5 28V17.2h3.6l.55-4.2h-4.15v-2.7c0-1.2.34-2.05 2.1-2.05h2.2V4.5c-.4-.05-1.75-.16-3.32-.16-3.3 0-5.55 2-5.55 5.7v3h-3.6v4.2h3.6V28h4.57Z" />
  </svg>
);

export const TelegramIcon: React.FC<Props> = ({ className = 'w-6 h-6' }) => (
  <svg viewBox="0 0 32 32" className={className} fill="#fff" aria-hidden="true">
    <path d="M27.3 5.7 4.9 14.3c-1.3.5-1.3 1.3-.2 1.6l5.1 1.6 1.9 6c.2.6.4.8 1 .8.5 0 .7-.2 1-.5l2.4-2.3 5 3.7c.9.5 1.5.2 1.7-.8l3.1-14.5c.3-1.3-.5-1.9-1.5-1.5ZM12.9 17.7l9.6-6c.4-.3.8-.1.4.2l-8 7.2-.3 3.3-1.7-4.7Z" />
  </svg>
);

export const XIcon: React.FC<Props> = ({ className = 'w-6 h-6' }) => (
  <svg viewBox="0 0 32 32" className={className} fill="#fff" aria-hidden="true">
    <path d="M18.24 14.1 26.5 4.5h-2.2l-7.1 8.3-5.7-8.3H4.9l8.66 12.6L4.9 27.5h2.2l7.55-8.8 5.98 8.8h6.6L18.24 14.1Zm-2.67 3.1-.87-1.25-6.95-9.94h3.1l5.6 8.02.87 1.25 7.3 10.44h-3.1l-5.95-8.52Z" />
  </svg>
);

export const InstagramGlyph: React.FC<Props> = ({ className = 'w-6 h-6' }) => (
  <svg viewBox="0 0 32 32" className={className} fill="none" stroke="#fff" strokeWidth="2.2" aria-hidden="true">
    <rect x="6" y="6" width="20" height="20" rx="6" />
    <circle cx="16" cy="16" r="4.6" />
    <circle cx="22.2" cy="9.8" r="1.2" fill="#fff" stroke="none" />
  </svg>
);
