import React, { useLayoutEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  className?: string;
  /** Max visible lines before the box starts scrolling */
  maxRows?: number;
};

/**
 * Instagram-style message box: grows with the text (multi-line), so the whole
 * message is visible before sending. Enter sends on desktop; on phones the
 * Enter key adds a new line and the send button sends.
 */
export default function ChatComposerInput({
  value,
  onChange,
  placeholder,
  maxLength,
  disabled,
  className,
  maxRows = 6,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20;
    const padding =
      parseFloat(getComputedStyle(el).paddingTop) + parseFloat(getComputedStyle(el).paddingBottom);
    const max = lineHeight * maxRows + padding;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
  }, [value, maxRows]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
    const isTouch =
      typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
    if (isTouch) return; // phone: Enter = new line
    e.preventDefault();
    e.currentTarget.form?.requestSubmit();
  };

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      maxLength={maxLength}
      disabled={disabled}
      enterKeyHint="enter"
      className={cn('chat-composer-input', className)}
    />
  );
}
