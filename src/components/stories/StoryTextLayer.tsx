import type React from 'react';
import { type StoryTextOverlay, storyTextStyle } from '@/lib/storyText';

/** Read-only text stickers placed on a story (same frame as the editor). */
const StoryTextLayer: React.FC<{ overlays?: StoryTextOverlay[] }> = ({ overlays }) => {
  if (!overlays?.length) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ containerType: 'inline-size' }}>
      {overlays.map(o => (
        <div
          key={o.id}
          className="absolute max-w-[90%]"
          style={{ left: `${o.x}%`, top: `${o.y}%`, transform: 'translate(-50%, -50%)' }}
        >
          <span style={storyTextStyle(o)}>{o.text}</span>
        </div>
      ))}
    </div>
  );
};

export default StoryTextLayer;
