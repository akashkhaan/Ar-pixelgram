import React from 'react';
import { VoiceMessageBubble } from './VoiceMessageBubble';
import { Play, FileText, Download } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatMediaRendererProps {
  content: string;
  isMe: boolean;
  activeBubbleClass?: string;
  onOpenMedia?: (url: string, type: 'photo' | 'video') => void;
}

export const isDirectMediaUrl = (url: string): { isMedia: boolean; type?: 'image' | 'video' | 'audio' } => {
  if (!url) return { isMedia: false };
  const clean = url.trim();
  const isAudio = /\.(webm|mp3|wav|ogg|m4a)(\?.*)?$/i.test(clean);
  if (isAudio) return { isMedia: true, type: 'audio' };

  const isImage = /\.(jpe?g|png|webp|gif|svg|bmp)(\?.*)?$/i.test(clean) ||
    /\/storage\/v1\/object\/public\/(posts|avatars|stories|chat_media)\//i.test(clean);
  if (isImage) return { isMedia: true, type: 'image' };

  const isVideo = /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(clean) ||
    /\/storage\/v1\/object\/public\/(reels|videos)\//i.test(clean);
  if (isVideo) return { isMedia: true, type: 'video' };

  return { isMedia: false };
};

export const isMediaMessage = (text: string): boolean => {
  if (!text) return false;
  const t = text.trim();
  if (t.startsWith('🎙️') || t.startsWith('📎 ')) return true;
  return isDirectMediaUrl(t).isMedia;
};

export const ChatMediaRenderer: React.FC<ChatMediaRendererProps> = ({
  content,
  isMe,
  activeBubbleClass,
  onOpenMedia,
}) => {
  if (!content) return null;
  const raw = content.trim();

  // 1. Voice Note / Audio message
  if (raw.startsWith('🎙️')) {
    // Format: 🎙️ Voice message (0:12)\nhttps://... OR 🎙️ https://...
    const lines = raw.split('\n');
    const headerLine = lines[0];
    const audioUrl = lines.length > 1 ? lines[1].trim() : lines[0].replace(/^🎙️\s*/, '').trim();
    const durationMatch = headerLine.match(/\((.*?)\)/);
    const durationText = durationMatch ? durationMatch[1] : undefined;

    return (
      <div
        className={cn(
          'rounded-[20px] shadow-sm overflow-hidden p-1',
          isMe
            ? cn('rounded-br-[4px] text-white', activeBubbleClass || 'bg-[#0084FF]')
            : 'bg-muted/80 dark:bg-[#242526] text-foreground rounded-bl-[4px] border border-border/40'
        )}
      >
        <VoiceMessageBubble audioUrl={audioUrl} durationText={durationText} isMe={isMe} />
      </div>
    );
  }

  // 2. Attachment starting with 📎
  if (raw.startsWith('📎 ')) {
    const lines = raw.split('\n');
    const fileName = lines[0].replace(/^📎\s*/, '').trim();
    const fileUrl = lines.slice(1).join('\n').trim();

    const isImageFile = /\.(jpe?g|png|webp|gif|svg)$/i.test(fileName) || /\.(jpe?g|png|webp|gif|svg)/i.test(fileUrl);
    const isVideoFile = /\.(mp4|webm|mov|m4v|ogv)$/i.test(fileName) || /\.(mp4|webm|mov|m4v|ogv)/i.test(fileUrl);
    const isAudioFile = /\.(webm|mp3|wav|ogg|m4a)$/i.test(fileName) || /\.(webm|mp3|wav|ogg|m4a)/i.test(fileUrl);

    if (isAudioFile && fileUrl) {
      return (
        <div
          className={cn(
            'rounded-[20px] shadow-sm overflow-hidden p-1',
            isMe
              ? cn('rounded-br-[4px] text-white', activeBubbleClass || 'bg-[#0084FF]')
              : 'bg-muted/80 dark:bg-[#242526] text-foreground rounded-bl-[4px] border border-border/40'
          )}
        >
          <VoiceMessageBubble audioUrl={fileUrl} durationText={fileName} isMe={isMe} />
        </div>
      );
    }

    if (isImageFile && fileUrl) {
      return (
        <div
          className={cn(
            'overflow-hidden rounded-[20px] shadow-sm border border-border/30 max-w-[270px] sm:max-w-xs',
            isMe ? 'rounded-br-[4px]' : 'rounded-bl-[4px]'
          )}
        >
          <img
            src={fileUrl}
            alt={fileName}
            className="w-full h-auto max-h-80 object-cover cursor-pointer hover:opacity-95 transition-opacity"
            onClick={() => onOpenMedia ? onOpenMedia(fileUrl, 'photo') : window.open(fileUrl, '_blank')}
            loading="lazy"
          />
        </div>
      );
    }

    if (isVideoFile && fileUrl) {
      return (
        <div
          className={cn(
            'overflow-hidden rounded-[20px] shadow-sm border border-border/30 max-w-[270px] sm:max-w-xs bg-black',
            isMe ? 'rounded-br-[4px]' : 'rounded-bl-[4px]'
          )}
        >
          <video
            src={fileUrl}
            controls
            playsInline
            preload="metadata"
            className="w-full h-auto max-h-80 object-cover"
          />
        </div>
      );
    }

    // Generic file fallback
    return (
      <a
        href={fileUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'flex items-center gap-2 px-3.5 py-2.5 rounded-[18px] text-xs font-medium underline shadow-xs break-all max-w-[260px]',
          isMe
            ? cn('rounded-br-[4px] text-white', activeBubbleClass || 'bg-[#0084FF]')
            : 'bg-muted/80 dark:bg-[#242526] text-foreground rounded-bl-[4px] border border-border/40'
        )}
      >
        <FileText className="w-4 h-4 shrink-0" />
        <span className="truncate flex-1">{fileName}</span>
        <Download className="w-3.5 h-3.5 shrink-0 ml-1" />
      </a>
    );
  }

  // 3. Direct URL Check
  const isDirectUrl = /^(https?:\/\/[^\s]+)$/i.test(raw);
  if (isDirectUrl) {
    const isImage = /\.(jpe?g|png|webp|gif|svg)(\?.*)?$/i.test(raw) || /\/storage\/v1\/object\/public\/(posts|avatars|stories)\//i.test(raw);
    const isVideo = /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(raw) || /\/storage\/v1\/object\/public\/(reels|videos)\//i.test(raw);
    const isAudio = /\.(webm|mp3|wav|ogg|m4a)(\?.*)?$/i.test(raw);

    if (isAudio) {
      return (
        <div
          className={cn(
            'rounded-[20px] shadow-sm overflow-hidden p-1',
            isMe
              ? cn('rounded-br-[4px] text-white', activeBubbleClass || 'bg-[#0084FF]')
              : 'bg-muted/80 dark:bg-[#242526] text-foreground rounded-bl-[4px] border border-border/40'
          )}
        >
          <VoiceMessageBubble audioUrl={raw} isMe={isMe} />
        </div>
      );
    }

    if (isImage) {
      return (
        <div
          className={cn(
            'overflow-hidden rounded-[20px] shadow-sm border border-border/30 max-w-[270px] sm:max-w-xs',
            isMe ? 'rounded-br-[4px]' : 'rounded-bl-[4px]'
          )}
        >
          <img
            src={raw}
            alt="Shared photo"
            className="w-full h-auto max-h-80 object-cover cursor-pointer hover:opacity-95 transition-opacity"
            onClick={() => onOpenMedia ? onOpenMedia(raw, 'photo') : window.open(raw, '_blank')}
            loading="lazy"
          />
        </div>
      );
    }

    if (isVideo) {
      return (
        <div
          className={cn(
            'overflow-hidden rounded-[20px] shadow-sm border border-border/30 max-w-[270px] sm:max-w-xs bg-black',
            isMe ? 'rounded-br-[4px]' : 'rounded-bl-[4px]'
          )}
        >
          <video
            src={raw}
            controls
            playsInline
            preload="metadata"
            className="w-full h-auto max-h-80 object-cover"
          />
        </div>
      );
    }
  }

  // Link fallback so URL messages are never invisible
  if (/^https?:\/\//i.test(raw)) {
    return (
      <a
        href={raw}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[18px] text-xs font-semibold underline break-all',
          isMe ? 'text-white' : 'text-sky-500'
        )}
      >
        <span>{raw}</span>
      </a>
    );
  }

  // Normal text fallback
  return null;
};
