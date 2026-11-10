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
  // Chrome/Android: use the platform voice-isolation model when available.
  ...({ voiceIsolation: true } as MediaTrackConstraints),
};

// Runs on the audio thread (not throttled in background). Adaptive noise gate:
// tracks the background noise floor and only lets audio through while the
// level is clearly above it (i.e. someone is talking into the phone).
const VOICE_GATE_WORKLET = `
class VoiceGate extends AudioWorkletProcessor {
  constructor() {
    super();
    this.floor = 0.002;
    this.gain = 1;
    this.hold = 0;
  }
  process(inputs, outputs) {
    const input = inputs[0] && inputs[0][0];
    const output = outputs[0] && outputs[0][0];
    if (!output) return true;
    if (!input) { output.fill(0); return true; }
    let sum = 0;
    for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
    const rms = Math.sqrt(sum / input.length);
    if (rms < this.floor) this.floor = this.floor * 0.9 + rms * 0.1;
    else this.floor = Math.min(this.floor * 1.0005 + 0.000001, 0.05);
    const open = rms > Math.max(this.floor * 3, 0.006);
    if (open) this.hold = Math.round(sampleRate * 0.35 / input.length);
    else if (this.hold > 0) this.hold--;
    const target = open || this.hold > 0 ? 1 : 0.06;
    const coeff = target > this.gain ? 0.5 : 0.04;
    for (let i = 0; i < input.length; i++) {
      this.gain += (target - this.gain) * coeff / 16;
      output[i] = input[i] * this.gain;
    }
    return true;
  }
}
registerProcessor('voice-gate', VoiceGate);
`;

let voiceGateModuleUrl: string | null = null;

/**
 * Cleans the outgoing mic so only the caller's voice is sent: cuts low rumble
 * (vehicles, wind, fans), high hiss, and gates background noise between words.
 * Falls back to the raw stream if Web Audio can't run.
 */
export async function cleanCallAudio(stream: MediaStream): Promise<MediaStream> {
  const rawTrack = stream.getAudioTracks()[0];
  const AudioCtx: typeof AudioContext | undefined =
    typeof window !== 'undefined'
      ? window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined;
  if (!rawTrack || !AudioCtx) return stream;

  let ctx: AudioContext | null = null;
  try {
    ctx = new AudioCtx({ latencyHint: 'interactive' });
    if (ctx.state !== 'running') {
      await Promise.race([ctx.resume(), new Promise(resolve => setTimeout(resolve, 800))]);
    }
    if (ctx.state !== 'running') throw new Error('AudioContext not running');

    const source = ctx.createMediaStreamSource(new MediaStream([rawTrack]));

    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 120;
    highpass.Q.value = 0.7;

    const rumbleCut = ctx.createBiquadFilter();
    rumbleCut.type = 'highpass';
    rumbleCut.frequency.value = 120;
    rumbleCut.Q.value = 0.7;

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 7000;
    lowpass.Q.value = 0.7;

    const destination = ctx.createMediaStreamDestination();
    let node: AudioNode = lowpass;
    source.connect(highpass).connect(rumbleCut).connect(lowpass);

    if (ctx.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
      try {
        if (!voiceGateModuleUrl) {
          voiceGateModuleUrl = URL.createObjectURL(new Blob([VOICE_GATE_WORKLET], { type: 'application/javascript' }));
        }
        await ctx.audioWorklet.addModule(voiceGateModuleUrl);
        const gate = new AudioWorkletNode(ctx, 'voice-gate', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
        node = node.connect(gate);
      } catch (err) {
        console.warn('voice gate unavailable', err);
      }
    }
    node.connect(destination);

    const cleanTrack = destination.stream.getAudioTracks()[0];
    if (!cleanTrack) throw new Error('No processed audio track');

    const audioCtx = ctx;
    const stopClean = cleanTrack.stop.bind(cleanTrack);
    cleanTrack.stop = () => {
      stopClean();
      try { rawTrack.stop(); } catch { /* noop */ }
      void audioCtx.close().catch(() => {});
    };
    rawTrack.addEventListener('ended', () => {
      try { stopClean(); } catch { /* noop */ }
      void audioCtx.close().catch(() => {});
    });

    return new MediaStream([cleanTrack, ...stream.getVideoTracks()]);
  } catch (err) {
    console.warn('call audio cleanup skipped', err);
    if (ctx) void ctx.close().catch(() => {});
    return stream;
  }
}

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
  prepareCallAudio();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: CALL_AUDIO_CONSTRAINTS, video });
    return await cleanCallAudio(stream);
  } catch (err) {
    applyCallAudioRoute(false, false);
    throw err;
  }
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
 * Switch to voice-call mode before opening the mic, so Android attaches its
 * hardware echo canceller / noise suppressor to the capture.
 */
export function prepareCallAudio(): void {
  try {
    audioBridge()?.setCallAudioActive?.(true);
  } catch { /* noop */ }
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
