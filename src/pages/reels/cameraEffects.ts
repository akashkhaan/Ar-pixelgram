export type EffectCategory = 'trending' | 'appearance' | 'aesthetic';
export type Overlay = 'none' | 'vignette' | 'flare' | 'film' | 'fog' | 'split' | 'glitch' | 'rain' | 'glitter' | 'hearts' | 'cloud' | 'doodle';
export interface CameraEffect {
  id: string;
  name: string;
  category: EffectCategory;
  filter: string;
  overlay: Overlay;
  zoom: number;
  keywords: string;
}

function effect(id: string, name: string, category: EffectCategory, filter = 'none', overlay: Overlay = 'none', keywords = '', zoom = 1): CameraEffect {
  return { id, name, category, filter, overlay, keywords, zoom };
}

// Independently implemented looks from the visible reference, not proprietary effect assets.
export const EFFECTS: CameraEffect[] = [
  effect('none', 'No effect', 'trending'),
  effect('flashlight', 'Flashwiiart', 'trending', 'brightness(1.3) contrast(1.15)', 'flare', 'flashlight flash'),
  effect('camcorder', 'Camcorder', 'aesthetic', 'saturate(.7) contrast(1.2)', 'film', 'vhs retro'),
  effect('light-flare', 'Light & Flare', 'aesthetic', 'brightness(1.12) saturate(1.1)', 'flare', 'light'),
  effect('vignette', '💙Vignette💙', 'trending', 'contrast(1.12) saturate(.9)', 'vignette', 'dark'),
  effect('4k-iphone', '4K HD iPhone', 'appearance', 'contrast(1.16) saturate(1.17) brightness(1.08)', 'none', '4k iphone 14 hd'),
  effect('honey', 'Honey', 'appearance', 'sepia(.28) saturate(1.18) brightness(1.08)', 'none', 'warm'),
  effect('clear-skin', 'Clear Skin', 'appearance', 'brightness(1.12) contrast(.92) saturate(.95)', 'none', 'soft selfie'),
  effect('fog', 'Fog', 'aesthetic', 'hue-rotate(25deg) saturate(.8)', 'fog', 'blue purple'),
  effect('split-cam', 'Split Cam', 'aesthetic', 'none', 'split', 'split camera'),
  effect('real-glitch', 'The Real Glitch', 'aesthetic', 'contrast(1.2) saturate(1.3)', 'glitch', 'glitch cyber'),
  effect('selfie', 'selfie no monkey', 'appearance', 'brightness(1.13) saturate(1.08) contrast(.96)', 'none', 'selfie'),
  effect('zohan', 'Zohan🇮🇳', 'trending', 'saturate(1.48) contrast(1.16)', 'none', 'zohan'),
  effect('black', '🔥 Black دارك', 'trending', 'brightness(.72) contrast(1.4) saturate(.65)', 'vignette', 'black dark'),
  effect('hdr', 'HDR', 'appearance', 'contrast(1.3) saturate(1.2) brightness(1.08)', 'none', 'hd clear'),
  effect('glowness', 'Glowness', 'appearance', 'brightness(1.22) contrast(.92) saturate(1.12)', 'flare', 'glow'),
  effect('aesblue', 'AESBLUE SWEET', 'trending', 'sepia(.12) hue-rotate(165deg) saturate(1.3)', 'none', 'blue'),
  effect('film-burn', 'Film burn I', 'aesthetic', 'sepia(.22) contrast(1.1)', 'film', 'film burn vintage'),
  effect('ayush', 'Ayushhh', 'aesthetic', 'saturate(.82) brightness(1.08) contrast(1.1)', 'vignette'),
  effect('fairy', 'fairy grunge', 'aesthetic', 'saturate(.72) sepia(.16)', 'glitter', 'fairy glitter'),
  effect('blurcam', 'BlurCAM✰', 'aesthetic', 'blur(2px) saturate(.82)', 'vignette', 'blur'),
  effect('blue', 'blue 2.0', 'trending', 'sepia(.2) hue-rotate(175deg) saturate(1.55)', 'none', 'blue'),
  effect('moments', 'moments', 'aesthetic', 'sepia(.22) brightness(1.07) contrast(.92)', 'film'),
  effect('zoom', 'zoom', 'aesthetic', 'contrast(1.08)', 'none', 'zoom', 1.6),
  effect('bright', 'Bright', 'appearance', 'brightness(1.3) contrast(1.04)', 'none', 'light'),
  effect('dazzling', 'Dazzling', 'appearance', 'brightness(1.18) saturate(1.25)', 'glitter', 'sparkle'),
  effect('pleasant', 'Pleasant x1', 'appearance', 'saturate(1.18) brightness(1.08) contrast(.95)'),
  effect('weather', 'Weather', 'appearance', 'saturate(.8) brightness(.94)', 'rain', 'rain weather'),
  effect('purple-glitter', 'Purple Glitter', 'appearance', 'hue-rotate(25deg) saturate(1.2)', 'glitter', 'purple glitter'),
  effect('subtle', 'Subtle', 'appearance', 'brightness(1.05) saturate(.92) contrast(.96)'),
  effect('stitch', 'Stitch', 'appearance', 'sepia(.3) hue-rotate(165deg) saturate(1.6)', 'none', 'blue'),
  effect('view-hd', 'View HD', 'appearance', 'contrast(1.24) saturate(1.1)'),
  effect('glowing-skin', 'Glowing Skin', 'appearance', 'brightness(1.18) contrast(.9) saturate(1.08)', 'none', 'soft skin glow'),
  effect('preppy', 'Preppy Look', 'appearance', 'brightness(1.15) contrast(.97) saturate(1.32)'),
  effect('selfie-v2', 'Selfie V.2', 'appearance', 'brightness(1.08) sepia(.1) contrast(.96)'),
  effect('bar-shade', 'bar.k shade', 'aesthetic', 'grayscale(.85) contrast(1.3)', 'vignette'),
  effect('love', 'LOVE❤️', 'trending', 'saturate(1.16) brightness(1.08)', 'hearts', 'love hearts'),
  effect('black-v2', 'black 2.0', 'aesthetic', 'grayscale(1) contrast(1.28) brightness(.9)'),
  effect('doodle-heart', 'Doodle Heart', 'trending', 'brightness(1.06)', 'doodle', 'love heart'),
  effect('glow-shine', 'Glow Shine', 'trending', 'brightness(1.2) contrast(.94)', 'glitter', 'shine glow'),
  effect('colourful', 'Colourful❤️', 'trending', 'saturate(1.8) contrast(1.12)', 'hearts', 'color colourful'),
  effect('lovit', 'Lovit ☆', 'trending', 'sepia(.14) brightness(1.08)', 'hearts', 'love'),
  effect('inari', 'Inari', 'trending', 'grayscale(.4) contrast(1.18)', 'vignette'),
  effect('cloud', 'CLOUD', 'aesthetic', 'brightness(1.1) saturate(.85)', 'cloud', 'cloud sky'),
  effect('dark-blur', 'DARK BLUR', 'aesthetic', 'blur(3px) brightness(.65)', 'vignette', 'dark blur'),
  effect('low-light', 'Low Light +', 'appearance', 'brightness(1.5) contrast(.92)', 'none', 'low light'),
  effect('blush', 'Blush', 'appearance', 'sepia(.16) hue-rotate(320deg) brightness(1.1)', 'none', 'pink warm'),
];

export const NO_EFFECT = EFFECTS[0];

export function searchEffects(query: string, category?: EffectCategory, savedIds?: string[]): CameraEffect[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return EFFECTS.filter((e) => (!category || e.category === category) && (!savedIds || savedIds.includes(e.id)) &&
    terms.every((term) => `${e.name} ${e.keywords}`.toLocaleLowerCase().includes(term)));
}

/** One render path: thumbnails, preview, and capture use the same effect. */
export function renderEffect(ctx: CanvasRenderingContext2D, source: CanvasImageSource, sourceWidth: number, sourceHeight: number, effect: CameraEffect, time: number, mirror = false) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  if (!sourceWidth || !sourceHeight || !w || !h) return;
  const ratio = Math.max(w / sourceWidth, h / sourceHeight) * effect.zoom;
  const sw = w / ratio, sh = h / ratio;
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.filter = effect.filter;
  if (mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
  ctx.drawImage(source, (sourceWidth - sw) / 2, (sourceHeight - sh) / 2, sw, sh, 0, 0, w, h);
  if (effect.overlay === 'split') {
    ctx.drawImage(source, 0, 0, sourceWidth, sourceHeight, 0, 0, w, h / 2);
    ctx.drawImage(source, 0, 0, sourceWidth, sourceHeight, 0, h / 2, w, h / 2);
  }
  ctx.restore();
  ctx.save();
  ctx.filter = 'none';
  const t = time / 1000;
  if (effect.overlay === 'vignette') {
    const gradient = ctx.createRadialGradient(w / 2, h / 2, w * .12, w / 2, h / 2, h * .65);
    gradient.addColorStop(0, 'transparent'); gradient.addColorStop(1, 'rgba(0,0,0,.82)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
  }
  if (effect.overlay === 'fog' || effect.overlay === 'cloud') {
    for (let i = 0; i < 4; i++) {
      const x = ((t * 20 + i * w / 3) % (w * 1.6)) - w * .3;
      const y = h * (.2 + i * .2);
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, w * .8);
      gradient.addColorStop(0, effect.overlay === 'fog' ? 'rgba(100,110,240,.3)' : 'rgba(255,255,255,.4)');
      gradient.addColorStop(1, 'transparent'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
    }
  }
  if (effect.overlay === 'flare' || effect.overlay === 'film') {
    const x = w * (.15 + .1 * Math.sin(t));
    const gradient = ctx.createRadialGradient(x, h * .25, 0, x, h * .25, w * .9);
    gradient.addColorStop(0, effect.overlay === 'film' ? 'rgba(255,80,25,.55)' : 'rgba(255,225,160,.4)');
    gradient.addColorStop(1, 'transparent'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
    if (effect.id === 'camcorder' || effect.id === 'moments') {
      ctx.fillStyle = 'rgba(0,0,0,.12)';
      for (let y = 0; y < h; y += 6) ctx.fillRect(0, y, w, 1);
      ctx.fillStyle = 'white'; ctx.font = `${w * .035}px monospace`; ctx.fillText('REC ●', w * .06, h * .08);
    }
  }
  if (effect.overlay === 'glitch') {
    const y = ((t * 180) % h);
    ctx.globalAlpha = .65;
    ctx.drawImage(ctx.canvas, 0, y, w, h * .07, w * .06 * Math.sin(t * 20), y, w, h * .07);
    ctx.fillStyle = 'rgba(0,255,230,.14)'; ctx.fillRect(0, y, w, h * .07);
  }
  if (['rain', 'glitter', 'hearts', 'doodle'].includes(effect.overlay)) {
    for (let i = 0; i < 26; i++) {
      const x = ((i * .618033) % 1) * w + Math.sin(t + i) * w * .025;
      const y = ((i * .38197 + t * (effect.overlay === 'rain' ? .55 : -.045)) % 1 + 1) % 1 * h;
      const size = w * (.014 + (i % 4) * .006);
      ctx.lineWidth = Math.max(1, w / 250);
      ctx.strokeStyle = effect.overlay === 'rain' ? 'rgba(205,235,255,.65)' : 'rgba(255,160,200,.85)';
      ctx.fillStyle = effect.id === 'purple-glitter' ? 'rgba(211,150,255,.9)' : 'rgba(255,244,205,.9)';
      ctx.beginPath();
      if (effect.overlay === 'rain') { ctx.moveTo(x, y); ctx.lineTo(x - size, y + size * 4); ctx.stroke(); }
      else if (effect.overlay === 'glitter') {
        const pulse = .4 + .6 * Math.abs(Math.sin(t * 2 + i));
        ctx.globalAlpha = pulse;
        ctx.moveTo(x - size, y); ctx.lineTo(x, y - size); ctx.lineTo(x + size, y); ctx.lineTo(x, y + size); ctx.closePath(); ctx.fill();
      } else {
        ctx.moveTo(x, y + size);
        ctx.bezierCurveTo(x - size * 2, y, x - size, y - size * 1.6, x, y - size * .5);
        ctx.bezierCurveTo(x + size, y - size * 1.6, x + size * 2, y, x, y + size);
        if (effect.overlay === 'doodle') ctx.stroke(); else { ctx.fillStyle = 'rgba(255,110,165,.65)'; ctx.fill(); }
      }
    }
  }
  ctx.restore();
}

export function recordingFileExtension(mimeType: string): 'webm' | 'mp4' {
  return mimeType.toLowerCase().startsWith('video/mp4') ? 'mp4' : 'webm';
}

export function createEffectRecordingStream(canvas: HTMLCanvasElement, camera: MediaStream): MediaStream {
  if (typeof canvas.captureStream !== 'function') throw new Error('Effects recording is not supported by this browser.');
  const capture = canvas.captureStream(30);
  camera.getAudioTracks().forEach((track) => capture.addTrack(track));
  return capture;
}