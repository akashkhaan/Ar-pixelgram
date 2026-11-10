// Shared call-media helpers (1:1 + group calls).
//
// Capture constraints matter a lot on Android WebView: without explicit
// echoCancellation / noiseSuppression / autoGainControl the microphone keeps
// picking up the loudspeaker output, so the other person hears their own voice
// plus a hollow "gharrr" background noise and speech becomes hard to follow.
// These are the same processing flags WhatsApp-style calls rely on.

export const CALL_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
  sampleRate: { ideal: 48000 },
};

/** Mic (+ optional camera) capture tuned for voice calls. */
export async function getCallMedia(kind: 'audio' | 'video'): Promise<MediaStream> {
  const video: MediaTrackConstraints | false =
    kind === 'video'
      ? {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 30 },
        }
      : false;
  return navigator.mediaDevices.getUserMedia({ audio: CALL_AUDIO_CONSTRAINTS, video });
}

/**
 * Opus tuning: keep the bitrate high enough for speech and force in-band FEC so
 * short packet losses are repaired instead of sounding like robotic noise.
 */
export async function tuneAudioSender(sender: RTCRtpSender): Promise<void> {
  try {
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) {
      (params as RTCRtpSendParameters).encodings = [{}];
    }
    const encoding = params.encodings[0];
    encoding.maxBitrate = 40000;
    encoding.networkPriority = 'high';
    await sender.setParameters(params);
  } catch (err) {
    // Older WebView builds reject setParameters before negotiation — harmless.
    console.warn('audio sender tuning skipped', err);
  }
}

/**
 * Adds every local track to the peer connection in one place so both call
 * flows always get the same audio processing (and returns the video sender).
 */
export function attachCallStream(
  pc: RTCPeerConnection,
  stream: MediaStream,
): RTCRtpSender | null {
  let videoSender: RTCRtpSender | null = null;
  stream.getTracks().forEach(track => {
    const sender = pc.addTrack(track, stream);
    if (track.kind === 'video') videoSender = sender;
    else if (track.kind === 'audio') void tuneAudioSender(sender);
  });
  return videoSender;
}

type AndroidAudioBridge = {
  setCallAudioActive?: (active: boolean) => void;
  setSpeakerphoneOn?: (on: boolean) => void;
};

function audioBridge(): AndroidAudioBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { AndroidAudio?: AndroidAudioBridge }).AndroidAudio;
}

/**
 * Puts the phone into the voice-call audio mode (Android) so the platform echo
 * canceller / noise suppressor are active and routing follows the speaker
 * toggle. No-op on the web build.
 */
export function applyCallAudioRoute(active: boolean, speakerOn: boolean): void {
  const bridge = audioBridge();
  if (!bridge) return;
  try {
    bridge.setCallAudioActive?.(active);
    if (active) bridge.setSpeakerphoneOn?.(speakerOn);
  } catch (err) {
    console.warn('call audio route failed', err);
  }
}
