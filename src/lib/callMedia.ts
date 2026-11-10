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

// Runs on the audio thread (not throttled in background). Voice gate with echo
// suppression. Input 0 is the mic, input 1 is what the other people are saying
// (played on our speaker). The mic is only let through while its level is
// clearly above both the learned background-noise floor and the expected echo
// of the far end, so traffic/vehicle noise and loudspeaker bleed are muted and
// only the person talking into this phone is sent.
export const VOICE_GATE_WORKLET = `
class VoiceGate extends AudioWorkletProcessor {
  constructor() {
    super();
    this.floor = 0.003;
    this.farEnv = 0;
    this.echoRatio = 0.6;
    this.gain = 0;
    this.hold = 0;
    this.attack = 1 - Math.exp(-1 / (0.004 * sampleRate));
    this.release = 1 - Math.exp(-1 / (0.15 * sampleRate));
  }
  rms(buf) {
    if (!buf) return 0;
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    return Math.sqrt(sum / buf.length);
  }
  process(inputs, outputs) {
    const input = inputs[0] && inputs[0][0];
    const output = outputs[0] && outputs[0][0];
    if (!output) return true;
    if (!input) { output.fill(0); return true; }
    const block = input.length / sampleRate;
    const mic = this.rms(input);
    const far = this.rms(inputs[1] && inputs[1][0]);

    // Far-end envelope: instant rise, ~400 ms decay to cover room echo/delay.
    this.farEnv = far > this.farEnv ? far : this.farEnv * Math.exp(-block / 0.4);
    const farActive = this.farEnv > 0.004;

    // Background noise floor: follows quiet moments quickly, rises slowly so
    // steady noise (engine, fan, road) is learned within ~1-2 s.
    if (!farActive || mic < this.floor) {
      if (mic < this.floor) this.floor += (mic - this.floor) * 0.2;
      else this.floor = Math.min(this.floor * Math.exp(block * 1.0), 0.08);
    }
    this.floor = Math.max(this.floor, 0.0005);

    const echoThreshold = farActive ? this.farEnv * this.echoRatio * 2.2 : 0;
    const threshold = Math.max(this.floor * 3.5, 0.008, echoThreshold);
    const open = mic > threshold;

    // While the far end talks and the mic stays closed, the mic is hearing
    // speaker bleed: learn how loud that echo is relative to the far end.
    if (farActive && !open && this.hold === 0 && this.farEnv > 0) {
      const ratio = Math.min(Math.max(mic / this.farEnv, 0.05), 3);
      this.echoRatio += (ratio - this.echoRatio) * (ratio > this.echoRatio ? 0.05 : 0.005);
    }

    if (open) this.hold = Math.round(0.25 / block);
    else if (this.hold > 0) this.hold--;
    const target = open || this.hold > 0 ? 1 : 0.003;
    const coeff = target > this.gain ? this.attack : this.release;
    for (let i = 0; i < input.length; i++) {
      this.gain += (target - this.gain) * coeff;
      output[i] = input[i] * this.gain;
    }
    return true;
  }
}
registerProcessor('voice-gate', VoiceGate);
`;

type FarEndBus = { ctx: AudioContext; bus: GainNode; sources: MediaStreamAudioSourceNode[] };
let farEndBus: FarEndBus | null = null;
let farEndStreams: MediaStream[] = [];

function connectFarEnd(): void {
  if (!farEndBus) return;
  const { ctx, bus } = farEndBus;
  farEndBus.sources.forEach(node => { try { node.disconnect(); } catch { /* noop */ } });
  farEndBus.sources = [];
  farEndStreams.forEach(stream => {
    if (!stream.getAudioTracks().length) return;
    try {
      const node = ctx.createMediaStreamSource(stream);
      node.connect(bus);
      farEndBus?.sources.push(node);
    } catch { /* noop */ }
  });
}

/**
 * Tells the mic gate what the other people in the call sound like, so their
 * voices coming out of our loudspeaker are not sent back to them.
 */
export function setCallFarEndStreams(streams: MediaStream[]): void {
  farEndStreams = streams;
  connectFarEnd();
}

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
    highpass.frequency.value = 150;
    highpass.Q.value = 0.7;

    const rumbleCut = ctx.createBiquadFilter();
    rumbleCut.type = 'highpass';
    rumbleCut.frequency.value = 150;
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
        const gate = new AudioWorkletNode(ctx, 'voice-gate', { numberOfInputs: 2, numberOfOutputs: 1, outputChannelCount: [1] });
        node = node.connect(gate, 0, 0);
        const bus = ctx.createGain();
        bus.connect(gate, 0, 1);
        farEndBus = { ctx, bus, sources: [] };
        connectFarEnd();
      } catch (err) {
        console.warn('voice gate unavailable', err);
      }
    }
    node.connect(destination);

    const cleanTrack = destination.stream.getAudioTracks()[0];
    if (!cleanTrack) throw new Error('No processed audio track');

    const audioCtx = ctx;
    const closeCtx = () => {
      if (farEndBus?.ctx === audioCtx) farEndBus = null;
      void audioCtx.close().catch(() => {});
    };
    const stopClean = cleanTrack.stop.bind(cleanTrack);
    cleanTrack.stop = () => {
      stopClean();
      try { rawTrack.stop(); } catch { /* noop */ }
      closeCtx();
    };
    rawTrack.addEventListener('ended', () => {
      try { stopClean(); } catch { /* noop */ }
      closeCtx();
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
