// Reel ko WhatsApp Status par lagana — Instagram ke "WhatsApp Status" button jaisa.
// Phone app (APK) me: WhatsApp Status API se attribution ke saath share hota hai bina bottom text ke.
// Website (mobile browser) me: video file share sheet me bina extra text ke jati hai, taaki video ke neeche koi faltu link text na aaye.

type WaBridge = {
  canShareToWhatsAppStatus?: () => boolean;
  shareVideoToWhatsAppStatus?: (videoUrl: string, reelUrl: string) => void;
  shareVideoToWhatsAppStatusWithBadge?: (
    videoUrl: string,
    reelUrl: string,
    username: string,
    avatarUrl: string
  ) => void;
};

/** Reel banane wale ki pehchan — status video par DP + @username chhapne ke liye */
export type StatusCreator = { username?: string | null; avatarUrl?: string | null };

const getBridge = (): WaBridge | undefined =>
  (window as unknown as { AndroidNotification?: WaBridge }).AndroidNotification;

export type WaStatusResult =
  | 'opened'
  | 'shared'
  | 'completed'
  | 'cancelled'
  | 'no_whatsapp'
  | 'error'
  | 'fallback';

export function buildStatusCaption(_link: string): string {
  // Return empty string so WhatsApp Status caption box remains clean without bottom text
  return '';
}

function waitForNativeResult(timeoutMs: number): Promise<WaStatusResult> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener('pixelgram-wa-status', onResult as EventListener);
      resolve('error');
    }, timeoutMs);

    function onResult(e: CustomEvent<string>) {
      // "processing" = video par naam/logo chhap raha hai, abhi intezaar karo
      if (e.detail === 'processing') return;
      window.clearTimeout(timer);
      window.removeEventListener('pixelgram-wa-status', onResult as EventListener);
      const d = e.detail;
      resolve(
        d === 'opened' || d === 'completed' || d === 'no_whatsapp'
          ? (d as WaStatusResult)
          : 'error'
      );
    }

    window.addEventListener('pixelgram-wa-status', onResult as EventListener);
  });
}

export async function shareReelToWhatsAppStatus(
  videoUrl: string,
  link: string,
  creator?: StatusCreator
): Promise<WaStatusResult> {
  const bridge = getBridge();

  // 1a. Naya APK: video par Instagram jaisa DP + @username + "View on Pixelgram"
  if (bridge?.shareVideoToWhatsAppStatusWithBadge) {
    const result = waitForNativeResult(4 * 60_000);
    bridge.shareVideoToWhatsAppStatusWithBadge(
      videoUrl,
      link,
      creator?.username || '',
      creator?.avatarUrl || ''
    );
    return result;
  }

  // 1. Phone app (APK): native intent with attribution and automatic return
  if (bridge?.shareVideoToWhatsAppStatus) {
    const result = waitForNativeResult(3 * 60_000);
    bridge.shareVideoToWhatsAppStatus(videoUrl, link);
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
          // IMPORTANT: Do NOT pass `text: caption` so WhatsApp status has NO text caption at the bottom!
          await navigator.share({
            files: [file],
            title: 'Pixelgram Reel',
          });
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

  // 3. Fallback: only if video file cannot be shared at all
  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(link)}`, '_blank');
  return 'fallback';
}
