import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useHasStory } from '@/hooks/useStoryUsers';

interface Props {
  userId?: string | null;
  children: React.ReactNode;
  className?: string;
  /** false ho to tap par story nahi khulegi, sirf red ring dikhega */
  openOnTap?: boolean;
}

/**
 * Instagram jaisa: user ne story dali ho to profile photo ke charo taraf red ring,
 * aur photo par tap karte hi uski story khulti hai. Story nahi to kuch nahi badalta.
 */
const StoryRing: React.FC<Props> = ({ userId, children, className = '', openOnTap = true }) => {
  const hasStory = useHasStory(userId);
  const navigate = useNavigate();
  if (!hasStory) return <>{children}</>;
  return (
    <span
      className={`inline-flex shrink-0 rounded-full ${className}`}
      style={{ boxShadow: '0 0 0 2px hsl(var(--background)), 0 0 0 4px #ef4444' }}
      onClickCapture={openOnTap ? (e) => {
        e.preventDefault();
        e.stopPropagation();
        navigate(`/stories?u=${userId}`);
      } : undefined}
    >
      {children}
    </span>
  );
};

export default StoryRing;
