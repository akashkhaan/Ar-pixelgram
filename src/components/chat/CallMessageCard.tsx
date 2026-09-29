import React from 'react';
import { Phone, PhoneMissed, Video, PhoneCall } from 'lucide-react';

interface CallMessageCardProps {
  content: string;
  timestamp: string;
  isMe?: boolean;
  onCallBack?: (kind: 'audio' | 'video') => void;
  isGroup?: boolean;
}

export function isCallEventMessage(content?: string | null): boolean {
  if (!content || typeof content !== 'string') return false;
  const c = content.trim();
  return (
    c.startsWith('📞') ||
    c.startsWith('🎥') ||
    c.startsWith('📵') ||
    c.includes('call ended') ||
    c.includes('Call ended') ||
    c.includes('Missed call') ||
    c.includes('missed call') ||
    c.includes('Voice call') ||
    c.includes('Audio call') ||
    c.includes('Video call') ||
    c.includes('Group audio call') ||
    c.includes('Group video call') ||
    c.includes('Declined call')
  );
}

export const CallMessageCard: React.FC<CallMessageCardProps> = ({
  content,
  timestamp,
  isMe,
  onCallBack,
  isGroup = false,
}) => {
  const isVideo = content.toLowerCase().includes('video') || content.includes('🎥');
  const isMissed =
    content.toLowerCase().includes('missed') ||
    content.includes('📵') ||
    content.toLowerCase().includes('declined') ||
    content.toLowerCase().includes('no-answer');
  const isDeclined = content.toLowerCase().includes('declined');
  const isGroupCall = isGroup || content.toLowerCase().includes('group');

  // Extract duration if present: e.g. "· 02:15"
  let duration = '';
  if (content.includes('·')) {
    const parts = content.split('·');
    duration = parts[1]?.trim() || '';
  }

  // Determine Title & Subtitle
  let title = '';
  if (isGroupCall) {
    title = isVideo ? 'Group Video Call' : 'Group Audio Call';
  } else if (isMissed) {
    title = isDeclined
      ? isVideo ? 'Declined Video Call' : 'Declined Audio Call'
      : isVideo ? 'Missed Video Call' : 'Missed Audio Call';
  } else {
    title = isVideo ? 'Video Call' : 'Audio Call';
  }

  let subtitle = '';
  if (duration) {
    subtitle = `Ended · ${duration}`;
  } else if (isMissed) {
    subtitle = isDeclined ? 'Call declined' : 'Missed call';
  } else {
    subtitle = 'Call ended';
  }

  const timeFormatted = (() => {
    try {
      const d = new Date(timestamp);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  })();

  return (
    <div className="flex w-full justify-center my-2.5 px-2 animate-in fade-in zoom-in-95 duration-200">
      <div
        className={`flex items-center justify-between gap-3 w-full max-w-sm px-4 py-3 rounded-2xl border backdrop-blur-md transition-all shadow-sm ${
          isMissed
            ? 'bg-rose-500/10 border-rose-500/25 dark:bg-rose-950/30 dark:border-rose-500/30 text-rose-700 dark:text-rose-200'
            : isVideo
            ? 'bg-primary/10 border-primary/25 dark:bg-primary/15 dark:border-primary/30 text-foreground'
            : 'bg-emerald-500/10 border-emerald-500/25 dark:bg-emerald-950/30 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-200'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* Icon Badge */}
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-xs ${
              isMissed
                ? 'bg-rose-500 text-white'
                : isVideo
                ? 'bg-gradient-to-tr from-violet-600 to-pink-500 text-white'
                : 'bg-emerald-600 text-white'
            }`}
          >
            {isMissed ? (
              <PhoneMissed className="w-5 h-5" />
            ) : isVideo ? (
              <Video className="w-5 h-5" />
            ) : (
              <PhoneCall className="w-5 h-5" />
            )}
          </div>

          {/* Details */}
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-bold truncate leading-tight text-foreground">
              {title}
            </h4>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
              <span className={isMissed ? 'text-rose-500 font-semibold' : ''}>
                {subtitle}
              </span>
              {timeFormatted && (
                <>
                  <span>•</span>
                  <span>{timeFormatted}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Action Button: Call Back / Join */}
        {onCallBack && (
          <button
            type="button"
            onClick={() => onCallBack(isVideo ? 'video' : 'audio')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all active:scale-95 shadow-xs ${
              isMissed
                ? 'bg-rose-500 hover:bg-rose-600 text-white'
                : isVideo
                ? 'bg-primary hover:bg-primary/90 text-primary-foreground'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
          >
            {isVideo ? <Video className="w-3.5 h-3.5" /> : <Phone className="w-3.5 h-3.5" />}
            <span>{isGroupCall ? 'Call' : 'Call back'}</span>
          </button>
        )}
      </div>
    </div>
  );
};
