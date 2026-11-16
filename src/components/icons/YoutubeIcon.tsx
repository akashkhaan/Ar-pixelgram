import React from 'react';

interface YoutubeIconProps {
  className?: string;
  size?: number;
}

export const YoutubeIcon: React.FC<YoutubeIconProps> = ({ className = '', size = 28 }) => (
  <div
    style={{ width: size, height: size }}
    className={`relative rounded-[8px] bg-[#FF0000] flex items-center justify-center shadow-sm shrink-0 overflow-hidden ${className}`}
  >
    <svg viewBox="0 0 24 24" style={{ width: size * 0.55, height: size * 0.55 }} xmlns="http://www.w3.org/2000/svg">
      <path d="M8 5.5v13l11-6.5z" fill="#ffffff" />
    </svg>
  </div>
);

export default YoutubeIcon;
