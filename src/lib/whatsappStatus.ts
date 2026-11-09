// Reel ko WhatsApp Status par lagana — Instagram ke "WhatsApp Status" button jaisa.
// Phone app (APK) me: video download hoke seedha WhatsApp status screen khulti hai.
// Website (mobile browser) me: video file share sheet me jati hai, wahan WhatsApp > My status.
// Dono me caption me reel ka link jata hai, jis par tap karke reel Pixelgram me khulti hai.

type WaBridge = {
  canShareToWhatsAppStatus?: () => boolean;
  shareVideoToWhatsAppStatus?: (videoUrl: string, caption: string) => void;
};

const getBridge = (): WaBridge | undefined =>
  (window as unknown as { AndroidNotification?: WaBridge }).AndroidNotification;

export type WaStatusResult = 'opened' | 'shared' | 'cancelled' | 'no_whatsapp' | 'error' | 'fallback';

export function buildStatusCaption(link: string): string {
  return `Pixelgram par ye reel dekho 👇\n${link}`;
}

function waitForNativeResult(timeoutMs: number): Promise<WaStatusResult> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener('pixelgram-wa-status', onResult as EventListener);
      resolve('error');
    }, timeoutMs);
    function onResult(e: CustomEvent<string>) {
      window.clearTimeout(timer);
      window.removeEventListener('pixelgram-wa-status', onResult as EventListener);
      const d = e.detail;
      resolve(d === 'opened' || d === 'no_whatsapp' ? d : 'error');
    }
    window.addEventListener('pixelgram-wa-status', onResult as EventListener);
  });
}

export async function shareReelToWhatsAppStatus(videoUrl: string, link: string): Promise<WaStatusResult> {
  const caption = buildStatusCaption(link);
  const bridge = getBridge();

  // 1. Phone app: native se seedha WhatsApp status
  if (bridge?.shareVideoToWhatsAppStatus) {
    const result = waitForNativeResult(3 * 60_000);
    bridge.shareVideoToWhatsAppStatus(videoUrl, caption);
    return result;
  }

  // 2. Browser: video file share (Android Chrome me WhatsApp > My status)
  try {
    if (navigator.share && typeof navigator.canShare === 'function') {
      const res = await fetch(videoUrl, { mode: 'cors' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const type = blob.type && blob.type.startsWith('video/') ? blob.type : 'video/mp4';
      const ext = type.includes('webm') ? 'webm' : type.includes('quicktime') ? 'mov' : 'mp4';
      const file = new File([blob], `pixelgram-reel.${ext}`, { type });
      if (navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], text: caption });
          return 'shared';
        } catch (err) {
          if ((err as Error)?.name === 'AbortError') return 'cancelled';
          throw err;
        }
      }
    }
  } catch (err) {
    console.warn('WhatsApp status video share failed, falling back to link:', err);
  }

  // 3. Aakhri raasta: WhatsApp me link bhejo
  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(caption)}`, '_blank');
  return 'fallback';
}
