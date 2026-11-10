import type { CSSProperties } from 'react';

export type StoryFontId = 'classic' | 'modern' | 'typewriter' | 'neon' | 'strong';

export interface StoryTextOverlay {
  id: string;
  text: string;
  font: StoryFontId;
  color: string;
  /** Centre position as % of the story frame. */
  x: number;
  y: number;
  /** Font size as % of the frame width. */
  size: number;
}

export const STORY_FONTS: { id: StoryFontId; label: string }[] = [
  { id: 'classic', label: 'Classic' },
  { id: 'modern', label: 'Modern' },
  { id: 'typewriter', label: 'Typewriter' },
  { id: 'neon', label: 'Neon' },
  { id: 'strong', label: 'Strong' },
];

export const STORY_TEXT_COLORS = ['#ffffff', '#000000', '#ff3b5c', '#ffcc00', '#34c759', '#0a84ff', '#bf5af2', '#ff9500'];

const TAG = /<!--pixelgram_text:([\s\S]*?)-->/;

export function encodeStoryText(caption: string | null, overlays: StoryTextOverlay[]): string | null {
  const list = overlays.filter(o => o.text.trim());
  if (!list.length) return caption;
  const tag = `<!--pixelgram_text:${encodeURIComponent(JSON.stringify(list))}-->`;
  return caption ? `${caption}\n\n${tag}` : tag;
}

export function decodeStoryText(raw?: string | null): StoryTextOverlay[] {
  const match = (raw || '').match(TAG);
  if (!match) return [];
  try {
    const list = JSON.parse(decodeURIComponent(match[1]));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function storyTextStyle(o: Pick<StoryTextOverlay, 'font' | 'color' | 'size'>): CSSProperties {
  const base: CSSProperties = {
    color: o.color,
    fontSize: `${o.size}cqw`,
    lineHeight: 1.2,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    textAlign: 'center',
    textShadow: '0 1px 4px rgba(0,0,0,0.35)',
  };
  switch (o.font) {
    case 'modern':
      return { ...base, fontFamily: 'Georgia, "Times New Roman", serif', fontStyle: 'italic', fontWeight: 600 };
    case 'typewriter':
      return { ...base, fontFamily: '"Courier New", Courier, monospace', fontWeight: 700 };
    case 'neon':
      return {
        ...base,
        fontFamily: '"Brush Script MT", "Segoe Script", "Dancing Script", cursive',
        fontWeight: 700,
        textShadow: `0 0 6px ${o.color}, 0 0 14px ${o.color}, 0 0 2px #fff`,
      };
    case 'strong': {
      const dark = o.color === '#ffffff' || o.color === '#ffcc00';
      return {
        ...base,
        fontFamily: 'Impact, "Arial Black", "Roboto Condensed", sans-serif',
        fontWeight: 900,
        textTransform: 'uppercase',
        color: dark ? '#000000' : '#ffffff',
        background: o.color,
        padding: '0.15em 0.45em',
        borderRadius: '0.3em',
        textShadow: 'none',
        boxDecorationBreak: 'clone',
        WebkitBoxDecorationBreak: 'clone',
      };
    }
    default:
      return { ...base, fontFamily: 'system-ui, -apple-system, Roboto, "Segoe UI", sans-serif', fontWeight: 700 };
  }
}
