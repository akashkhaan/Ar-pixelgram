// WebRTC 1:1 audio/video calling with Supabase Realtime signaling.
// No DB migration — signaling flows over a per-user broadcast channel.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { getProfile, createNotification, sendMessage, saveCallLog, formatCallDuration, sendPushTo } from '@/services/api';
import { notifyPhone, dismissPhoneNotification } from '@/lib/notifyPhone';
import { getCallMedia, attachCallStream, applyCallAudioRoute, setCallFarEndStreams } from '@/lib/callMedia';
import type { Profile } from '@/types/types';
import { getHelloTuneFromProfile, isHelloTuneActive } from '@/services/helloTunes';

export type CallKind = 'audio' | 'video';
export type CallStatus = 'idle' | 'ringing-out' | 'ringing-in' | 'connecting' | 'active' | 'ended';

interface CallState {
  status: CallStatus;
  kind: CallKind;
  peerId: string | null;
  peerProfile: Profile | null;
  startedAt: number | null;
  endedReason?: string;
}

interface CallContextValue extends CallState {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  muted: boolean;
  cameraOff: boolean;
  minimized: boolean;
  screenSharing: boolean;
  recording: boolean;
  startCall: (peerId: string, kind: CallKind) => Promise<void>;
  playRingtone: () => void;
  acceptCall: () => Promise<void>;
  rejectCall: (reason?: 'declined' | 'no-answer') => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  toggleMinimize: () => void;
  toggleScreenShare: () => Promise<void>;
  toggleRecording: () => Promise<void>;
  speakerOn: boolean;
  toggleSpeaker: () => void;
  facingFront: boolean;
  flipCamera: () => Promise<void>;
}

const CallContext = createContext<CallContextValue | null>(null);
export const useCall = () => {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used inside CallProvider');
  return ctx;
};

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const channelName = (uid: string) => `calls:${uid}`;

const newId = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `call-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

/** Channel we broadcast signaling on, kept alive so sends are never dropped. */
type SignalChannel = { ch: RealtimeChannel; ready: Promise<boolean>; closeTimer: number | null };

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile } = useAuth();
  const [state, setState] = useState<CallState>({
    status: 'idle', kind: 'audio', peerId: null, peerProfile: null, startedAt: null,
  });
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [facingFront, setFacingFront] = useState(true);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const incomingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const ringAudioRef = useRef<HTMLAudioElement | null>(null);
  const camVideoTrackRef = useRef<MediaStreamTrack | null>(null);
  const videoSenderRef = useRef<RTCRtpSender | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const inviteRetryRef = useRef<number | null>(null);
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
  const autoAcceptRef = useRef<boolean>(false);
  const signalChannelsRef = useRef<Map<string, SignalChannel>>(new Map());
  const durationRef = useRef<number>(0);
  const startedAtRef = useRef<number | null>(null);
  const acceptCallRef = useRef<(() => Promise<void>) | null>(null);
  const rejectCallRef = useRef<((reason?: 'declined' | 'no-answer') => void) | null>(null);
  const endCallRef = useRef<(() => void) | null>(null);
  const stateRef = useRef<CallState | null>(null);
  const missedTimerRef = useRef<number | null>(null);
  // Unique id per call attempt — carried on the push payload so the phone can
  // tell a fresh call apart from one that was already cancelled.
  const callIdRef = useRef<string>(newId());
  // The caller we are currently ringing for (guards duplicate invites).
  const ringingFromRef = useRef<string | null>(null);
  const cameraOffRef = useRef(false);

  const stopInviteRetry = useCallback(() => {
    if (inviteRetryRef.current) { clearInterval(inviteRetryRef.current); inviteRetryRef.current = null; }
    pendingOfferRef.current = null;
  }, []);

  // Keep a ref of the latest state so timers/handlers can read it.
  stateRef.current = state;
  cameraOffRef.current = cameraOff;

  // Sends a "missed call" alert (lock-screen push + in-app notification) to a
  // user. Used when a call is declined, unanswered, or the peer is busy.
  const sendMissedAlert = useCallback(async (
    targetId: string,
    kind: CallKind,
    fromUsername: string | undefined,
    reason: 'declined' | 'no-answer' | 'busy',
  ) => {
    const label = kind === 'video' ? 'video call' : 'voice call';
    const who = fromUsername || 'Someone';
    const body = reason === 'declined'
      ? `${who} declined your ${label}`
      : reason === 'busy'
        ? `${who} was on another call`
        : `${who} didn't answer your ${label}`;
    try {
      await supabase.functions.invoke('send-call-push', {
        body: {
          receiverId: targetId,
          title: 'Missed call',
          body,
          tag: `missed-${targetId}-${Date.now()}`,
          data: { url: '/chat', missed: true, kind },
        },
      });
    } catch (e) { console.warn('missed push failed', e); }
    createNotification(targetId, 'message', user?.id, undefined, undefined, `📵 Missed ${label} — ${body}`).catch(() => {});
    if (user?.id) {
      void saveCallLog({
        callerId: reason === 'declined' || reason === 'busy' ? targetId : user.id,
        receiverId: reason === 'declined' || reason === 'busy' ? user.id : targetId,
        callType: kind === 'video' ? 'video' : 'audio',
        status: reason === 'declined' ? 'declined' : 'missed',
        durationSec: 0,
      });
    }
  }, [user]);

  // Send helper — pushes signaling event to peer's channel.
  //
  // Supabase silently drops a broadcast that is sent before the channel has
  // finished joining, and the old code created a throw-away channel for every
  // single signal. That is why invites were often lost (call never rang) and
  // why a "call-end" could be lost too (the other phone kept ringing after the
  // caller hung up). Channels are now cached, we wait for SUBSCRIBED before
  // sending, and the channel is closed only after a short idle period.
  const closeSignalChannel = useCallback((peerId: string) => {
    const entry = signalChannelsRef.current.get(peerId);
    if (!entry) return;
    signalChannelsRef.current.delete(peerId);
    if (entry.closeTimer) window.clearTimeout(entry.closeTimer);
    try { supabase.removeChannel(entry.ch); } catch { /* noop */ }
  }, []);

  const getSignalChannel = useCallback((peerId: string): SignalChannel => {
    const cached = signalChannelsRef.current.get(peerId);
    if (cached) return cached;
    const ch = supabase.channel(channelName(peerId));
    const ready = new Promise<boolean>(resolve => {
      let settled = false;
      const finish = (ok: boolean) => { if (settled) return; settled = true; resolve(ok); };
      ch.subscribe(status => {
        if (status === 'SUBSCRIBED') finish(true);
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') finish(false);
      });
      window.setTimeout(() => finish(false), 6000);
    });
    const entry: SignalChannel = { ch, ready, closeTimer: null };
    signalChannelsRef.current.set(peerId, entry);
    return entry;
  }, []);

  const sendSignal = useCallback(async (peerId: string, event: string, payload: unknown) => {
    if (!user) return;
    const entry = getSignalChannel(peerId);
    const joined = await entry.ready;
    if (!joined) {
      // Drop the half-open channel so the next attempt starts clean.
      closeSignalChannel(peerId);
      return;
    }
    try {
      await entry.ch.send({ type: 'broadcast', event, payload: { from: user.id, ...(payload as object) } });
    } catch (e) {
      console.warn('signal send failed', event, e);
    }
    if (entry.closeTimer) window.clearTimeout(entry.closeTimer);
    entry.closeTimer = window.setTimeout(() => closeSignalChannel(peerId), 20000);
  }, [user, getSignalChannel, closeSignalChannel]);

  const cleanup = useCallback(() => {
    dismissPhoneNotification("call_ongoing");
    stopInviteRetry();
    if (pcRef.current) { try { pcRef.current.close(); } catch { /* noop */ } pcRef.current = null; }
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); }
    if (camVideoTrackRef.current) { try { camVideoTrackRef.current.stop(); } catch { /* noop */ } camVideoTrackRef.current = null; }
    videoSenderRef.current = null;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch { /* noop */ }
    }
    setLocalStream(null);
    setRemoteStream(null);
    remoteStreamRef.current = null;
    incomingOfferRef.current = null;
    pendingIceRef.current = [];
    setMuted(false);
    setCameraOff(false);
    setMinimized(false);
    setScreenSharing(false);
    setSpeakerOn(true);
    setFacingFront(true);
    ringingFromRef.current = null;
    if (ringAudioRef.current) { ringAudioRef.current.pause(); ringAudioRef.current = null; }
  }, [localStream, stopInviteRetry]);

  const playRingtone = useCallback(() => {
    try {
      // simple beep loop using WebAudio — no asset needed
      const AudioCtx: typeof AudioContext = (window as unknown as { AudioContext: typeof AudioContext; webkitAudioContext: typeof AudioContext })
        .AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ac = new AudioCtx();
      const gain = ac.createGain(); gain.gain.value = 0.15; gain.connect(ac.destination);
      const loop = () => {
        const osc = ac.createOscillator(); osc.type = 'sine'; osc.frequency.value = 440;
        osc.connect(gain); osc.start(); osc.stop(ac.currentTime + 0.3);
      };
      const id = window.setInterval(loop, 800);
      const stopHolder = { pause: () => { clearInterval(id); ac.close().catch(() => {}); } } as unknown as HTMLAudioElement;
      ringAudioRef.current = stopHolder;
    } catch { /* noop */ }
  }, []);

  const buildPc = useCallback((peerId: string): RTCPeerConnection => {
    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      // Better connectivity + less "hang" via bundle & rtcp mux
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      iceCandidatePoolSize: 4,
    });
    // A single remote MediaStream we own, so audio is always played even when
    // the remote peer never sends e.streams[0].
    const remote = new MediaStream();
    remoteStreamRef.current = remote;
    pc.onicecandidate = (e) => {
      if (e.candidate) sendSignal(peerId, 'call-ice', { candidate: e.candidate.toJSON() });
    };
    pc.ontrack = (e) => {
      // Add the track to that one stream and publish it once. Re-creating the
      // stream on every track started (and re-binding srcObject) used to cut
      // and click the audio mid-call.
      if (!remote.getTracks().some(t => t.id === e.track.id)) {
        try { remote.addTrack(e.track); } catch { /* dupe */ }
      }
      setRemoteStream(remote);
      // Answering side may start muted for a tick — start playback again.
      e.track.onunmute = () => setRemoteStream(prev => prev ?? remote);
    };
    let disconnectTimer: number | null = null;
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === 'connected') {
        if (disconnectTimer) { window.clearTimeout(disconnectTimer); disconnectTimer = null; }
        setState(prev => {
          if (prev.startedAt) return prev;
          const now = Date.now();
          startedAtRef.current = now;
          return { ...prev, status: 'active', startedAt: now };
        });
        stopInviteRetry();
        if (ringAudioRef.current) { ringAudioRef.current.pause(); ringAudioRef.current = null; }
      }
      if (s === 'disconnected') {
        // Network blip only — a few seconds of grace keeps the call alive
        // instead of tearing the audio down immediately.
        if (!disconnectTimer) {
          disconnectTimer = window.setTimeout(() => {
            disconnectTimer = null;
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
              setState(prev => prev.status === 'idle' ? prev : { ...prev, status: 'ended', endedReason: 'Disconnected' });
            }
          }, 12000);
        }
        return;
      }
      if (s === 'failed' || s === 'closed') {
        if (disconnectTimer) { window.clearTimeout(disconnectTimer); disconnectTimer = null; }
        setState(prev => prev.status === 'idle' ? prev : { ...prev, status: 'ended', endedReason: 'Disconnected' });
      }
    };
    return pc;
  }, [sendSignal, stopInviteRetry]);

  const getMedia = useCallback(async (kind: CallKind) => {
    // echoCancellation / noiseSuppression / autoGainControl come from
    // callMedia so the far end hears clean speech instead of speaker bleed.
    const stream = await getCallMedia(kind);
    setLocalStream(stream);
    const vt = stream.getVideoTracks()[0];
    if (vt) camVideoTrackRef.current = vt;
    return stream;
  }, []);

  // ---- Outgoing call
  const startCall = useCallback(async (peerId: string, kind: CallKind) => {
    if (!user) return;
    if (state.status !== 'idle' && state.status !== 'ended') return;
    try {
      const peerProfile = await getProfile(peerId);
      const peerTune = getHelloTuneFromProfile(peerProfile);
      const hasActiveHelloTune = isHelloTuneActive(peerTune);
      callIdRef.current = newId();
      setState({ status: 'ringing-out', kind, peerId, peerProfile, startedAt: null });
      const stream = await getMedia(kind);
      const pc = buildPc(peerId); pcRef.current = pc;
      videoSenderRef.current = attachCallStream(pc, stream);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (!hasActiveHelloTune) playRingtone();
      pendingOfferRef.current = offer;
      await sendSignal(peerId, 'call-invite', { kind, offer, callId: callIdRef.current });
      // Retry every 2s until answer/reject/timeout — lets the receiver pick
      // up the invite when they open the app after tapping the push.
      if (inviteRetryRef.current) clearInterval(inviteRetryRef.current);
      inviteRetryRef.current = window.setInterval(() => {
        if (pendingOfferRef.current) {
          sendSignal(peerId, 'call-invite', { kind, offer: pendingOfferRef.current, callId: callIdRef.current }).catch(() => {});
        }
      }, 2000);
      // No answer after 45s → end the call and alert the caller locally.
      if (missedTimerRef.current) clearTimeout(missedTimerRef.current);
      missedTimerRef.current = window.setTimeout(() => {
        stopInviteRetry();
        const cur = stateRef.current;
        if (!cur || cur.status !== 'ringing-out' || cur.peerId !== peerId) return;
        sendSignal(peerId, 'call-end', { reason: 'no-answer' }).catch(() => {});
        const label = kind === 'video' ? 'video call' : 'voice call';
        const who = peerProfile?.username || 'User';
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification('Missed call', {
              body: `${who} didn't answer your ${label}`,
              icon: peerProfile?.avatar_url || '/images/logo/logo-icon.svg',
              tag: `missed-${peerId}`,
            });
          } catch { /* noop */ }
        }
        sendMessage(peerId, `📵 Missed ${label}`).catch(() => {});
        void sendPushTo(peerId, 'Call cancelled', '', `/chat/${user.id}`, `call-${user.id}`, null, { type: 'call_cancelled', callId: callIdRef.current });
        cleanup();
        setState(prev => ({ ...prev, status: 'ended', endedReason: 'No answer' }));
        setTimeout(() => setState({ status: 'idle', kind: 'audio', peerId: null, peerProfile: null, startedAt: null }), 1500);
      }, 45000);
      // In-app notification (for open tabs)
      createNotification(peerId, 'message', user.id, undefined, undefined, `📞 Incoming ${kind} call`).catch(() => {});
      // Web Push (lock screen / app-closed) via edge function — must show
      // the CALLER's own identity (this device's user), not the callee's.
      const myName = profile?.username || (user.user_metadata?.username as string | undefined) || 'Someone';
      const myAvatar = profile?.avatar_url || '/images/logo/logo-icon.svg';
      try {
        await supabase.functions.invoke('send-call-push', {
          body: {
            receiverId: peerId,
            title: `Incoming ${kind} call`,
            body: `${myName} is calling you`,
            tag: `call-${user.id}`,
            data: {
              type: 'call',
              kind,
              peerId: user.id,
              callerName: myName,
              callerAvatar: myAvatar,
              url: `/chat/${user.id}`,
              icon: myAvatar,
              callId: callIdRef.current,
              ts: Date.now(),
            },
          },
        });
      } catch (e) { console.warn('push send failed', e); }
    } catch (err) {
      console.error('startCall failed', err);
      cleanup();
      setState({ status: 'ended', kind, peerId, peerProfile: null, startedAt: null, endedReason: 'Camera/Mic access denied' });
    }
  }, [user, profile, state.status, getMedia, buildPc, sendSignal, playRingtone, cleanup, stopInviteRetry]);

  // ---- Accept incoming
  const acceptCall = useCallback(async () => {
    if (!state.peerId || !incomingOfferRef.current) return;
    try {
      const stream = await getMedia(state.kind);
      const pc = buildPc(state.peerId); pcRef.current = pc;
      videoSenderRef.current = attachCallStream(pc, stream);
      await pc.setRemoteDescription(new RTCSessionDescription(incomingOfferRef.current));
      // flush queued ICE
      for (const c of pendingIceRef.current) { try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch { /* noop */ } }
      pendingIceRef.current = [];
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await sendSignal(state.peerId, 'call-answer', { answer });
      if (ringAudioRef.current) { ringAudioRef.current.pause(); ringAudioRef.current = null; }
      // Drop the ringing notification on this phone right away so only the
      // single ongoing-call notification remains once connected.
      dismissPhoneNotification('call_ongoing');
      ringingFromRef.current = null;
      setState(prev => ({ ...prev, status: 'connecting' }));
    } catch (err) {
      console.error('acceptCall failed', err);
      cleanup();
      setState(prev => ({ ...prev, status: 'ended', endedReason: 'Camera/Mic access denied' }));
    }
  }, [state.peerId, state.kind, getMedia, buildPc, sendSignal, cleanup]);
  acceptCallRef.current = acceptCall;

  // Listen for service-worker push clicks so tapping "Accept" on a lock-screen
  // call notification auto-accepts once the invite arrives (or immediately if
  // it's already ringing).
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const onMsg = (ev: MessageEvent) => {
      const d = ev.data;
      if (!d || d.type !== 'push-notification-click') return;
      if (d.action === 'accept' || d.action === 'default') {
        if (state.status === 'ringing-in') { acceptCallRef.current?.(); }
        else { autoAcceptRef.current = true; }
      } else if (d.action === 'decline') {
        if (state.status === 'ringing-in') { rejectCallRef.current?.(); }
      } else if (d.action === 'end') {
        if (state.status === 'active' || state.status === 'connecting') { endCallRef.current?.(); }
      }
    };
    navigator.serviceWorker.addEventListener('message', onMsg);
    return () => navigator.serviceWorker.removeEventListener('message', onMsg);
  }, [state.status]);

  // "Answer" / "Decline" tapped on the phone's incoming-call notification.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onAction = (event: Event) => {
      const detail = (event as CustomEvent<{ action?: string }>).detail || {};
      if (detail.action === 'answer') {
        if (stateRef.current?.status === 'ringing-in') acceptCallRef.current?.();
        else autoAcceptRef.current = true;
      } else if (detail.action === 'decline') {
        if (stateRef.current?.status === 'ringing-in') rejectCallRef.current?.('declined');
      }
    };
    window.addEventListener('appCallActionFromNotification', onAction);
    return () => window.removeEventListener('appCallActionFromNotification', onAction);
  }, []);

  const rejectCall = useCallback((reason: 'declined' | 'no-answer' = 'declined') => {
    if (state.peerId && user) {
      sendSignal(state.peerId, 'call-end', { reason: reason === 'declined' ? 'rejected' : 'no-answer' });
      sendMissedAlert(state.peerId, state.kind, profile?.username || (user?.user_metadata?.username as string | undefined), reason);
      const label = state.kind === 'video' ? 'video call' : 'audio call';
      const text = reason === 'declined' ? `Declined ${label}` : `📵 Missed ${label}`;
      sendMessage(state.peerId, text).catch(() => {});
    }
    cleanup();
    setState({ status: 'idle', kind: 'audio', peerId: null, peerProfile: null, startedAt: null });
  }, [state.peerId, state.kind, sendSignal, cleanup, sendMissedAlert, user, profile]);
  rejectCallRef.current = rejectCall;

  const endCall = useCallback(() => {
    if (missedTimerRef.current) { clearTimeout(missedTimerRef.current); missedTimerRef.current = null; }
    // Stop the invite retry first — otherwise a pending retry could re-ring the
    // other phone right after we told it the call is over.
    stopInviteRetry();
    // Post a "call log" message to chat with duration so both sides see it.
    const startedAt = startedAtRef.current;
    const kind = state.kind;
    const peerId = state.peerId;
    const currentStatus = state.status;
    const durSec = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0;
    durationRef.current = durSec;
    ringingFromRef.current = null;
    if (state.peerId) {
      sendSignal(state.peerId, 'call-end', { reason: 'ended', durationSec: durSec, callId: callIdRef.current });
    }
    if (peerId && user) {
      if (startedAt && durSec > 0) {
        const mm = Math.floor(durSec / 60).toString().padStart(2, '0');
        const ss = Math.floor(durSec % 60).toString().padStart(2, '0');
        const emoji = kind === 'video' ? '🎥' : '📞';
        const label = kind === 'video' ? 'Video call' : 'Audio call';
        const text = `${emoji} ${label} ended · ${mm}:${ss}`;
        sendMessage(peerId, text).catch(() => {});
        const pretty = formatCallDuration(durSec);
        void saveCallLog({
          callerId: user.id,
          receiverId: peerId,
          callType: kind === 'video' ? 'video' : 'audio',
          status: 'answered',
          durationSec: durSec,
          startedAt: new Date(startedAt).toISOString(),
        });
        createNotification(
          peerId, 'message', user.id, undefined, undefined,
          `📞 Call ended — ${pretty}`,
        ).catch(() => {});
        void sendPushTo(peerId, `${label} ended`, `Call ended — ${pretty}`, `/chat/${user.id}`, `call-ended-${peerId}-${Date.now()}`);
      } else if (currentStatus === 'ringing-out') {
        const label = kind === 'video' ? 'video call' : 'audio call';
        sendMessage(peerId, `📵 Missed ${label}`).catch(() => {});
        // Caller hung up while ringing: remove the ringing notification on the other phone.
        void sendPushTo(peerId, 'Call cancelled', '', `/chat/${user.id}`, `call-${user.id}`, null, { type: 'call_cancelled', callId: callIdRef.current });
        void saveCallLog({
          callerId: user.id,
          receiverId: peerId,
          callType: kind === 'video' ? 'video' : 'audio',
          status: 'missed',
          durationSec: 0,
        });
      }
    }
    startedAtRef.current = null;
    cleanup();
    setState(prev => ({ ...prev, status: 'ended' }));
    setTimeout(() => setState({ status: 'idle', kind: 'audio', peerId: null, peerProfile: null, startedAt: null }), 1500);
  }, [state.peerId, state.kind, state.status, sendSignal, cleanup, user, stopInviteRetry]);
  endCallRef.current = endCall;

  const toggleMute = useCallback(() => {
    if (!localStream) return;
    const enabled = !muted;
    localStream.getAudioTracks().forEach(t => { t.enabled = !enabled; });
    setMuted(enabled);
  }, [localStream, muted]);

  const toggleCamera = useCallback(async () => {
    const peerId = state.peerId;
    const off = !cameraOff;
    if (off) {
      if (localStream) {
        localStream.getVideoTracks().forEach(t => {
          t.enabled = false;
          try { t.stop(); } catch {}
          localStream.removeTrack(t);
        });
      }
      if (videoSenderRef.current) {
        await videoSenderRef.current.replaceTrack(null);
      }
      setCameraOff(true);
      const remoteHasVid = Boolean(
        remoteStream && remoteStream.getVideoTracks().some(t => t.enabled && t.readyState === 'live')
      );
      if (!remoteHasVid) {
        setState(prev => ({ ...prev, kind: 'audio' }));
      }
      if (peerId) {
        sendSignal(peerId, 'camera-toggle', { cameraOff: true }).catch(() => {});
      }
    } else {
      try {
        const fresh = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facingFront ? 'user' : 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        const newTrack = fresh.getVideoTracks()[0];
        if (newTrack) {
          let s = localStream;
          if (!s) {
            s = new MediaStream([newTrack]);
          } else {
            s.getVideoTracks().forEach(t => {
              try { t.stop(); } catch {}
              s.removeTrack(t);
            });
            s.addTrack(newTrack);
          }
          camVideoTrackRef.current = newTrack;
          if (videoSenderRef.current) {
            await videoSenderRef.current.replaceTrack(newTrack);
          } else if (pcRef.current) {
            videoSenderRef.current = pcRef.current.addTrack(newTrack, s);
          }
          setLocalStream(new MediaStream(s.getTracks()));
          setCameraOff(false);
          setState(prev => ({ ...prev, kind: 'video' }));
          if (peerId) {
            sendSignal(peerId, 'camera-toggle', { cameraOff: false }).catch(() => {});
          }
        }
      } catch (err) {
        console.warn('Camera on failed:', err);
      }
    }
  }, [localStream, remoteStream, cameraOff, facingFront, state.peerId, sendSignal]);

  const toggleMinimize = useCallback(() => setMinimized(m => !m), []);

  // Speaker (loud) vs earpiece — the UI applies this to the audio element.
  const toggleSpeaker = useCallback(() => setSpeakerOn(v => !v), []);

  // Front / back camera switch during a video call.
  const flipCamera = useCallback(async () => {
    if (!localStream || screenSharing) return;
    const next = !facingFront;
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: next ? 'user' : 'environment' }, audio: false,
      });
      const newTrack = fresh.getVideoTracks()[0];
      if (!newTrack) return;
      newTrack.enabled = !cameraOff;
      if (videoSenderRef.current) { await videoSenderRef.current.replaceTrack(newTrack); }
      localStream.getVideoTracks().forEach(t => { try { t.stop(); } catch { /* noop */ } localStream.removeTrack(t); });
      localStream.addTrack(newTrack);
      camVideoTrackRef.current = newTrack;
      setLocalStream(new MediaStream(localStream.getTracks()));
      setFacingFront(next);
    } catch (err) { console.error('flip camera failed', err); }
  }, [localStream, facingFront, cameraOff, screenSharing]);

  const toggleScreenShare = useCallback(async () => {
    if (!pcRef.current || !videoSenderRef.current) return;
    try {
      if (!screenSharing) {
        const disp = await (navigator.mediaDevices as MediaDevices & { getDisplayMedia: (c?: DisplayMediaStreamOptions) => Promise<MediaStream> })
          .getDisplayMedia({ video: true, audio: false });
        const screenTrack = disp.getVideoTracks()[0];
        if (!screenTrack) return;
        await videoSenderRef.current.replaceTrack(screenTrack);
        // Reflect in local preview
        if (localStream) {
          const oldV = localStream.getVideoTracks()[0];
          if (oldV) localStream.removeTrack(oldV);
          localStream.addTrack(screenTrack);
          setLocalStream(new MediaStream(localStream.getTracks()));
        }
        setScreenSharing(true);
        screenTrack.onended = async () => {
          const cam = camVideoTrackRef.current;
          if (cam && videoSenderRef.current) {
            try { await videoSenderRef.current.replaceTrack(cam); } catch { /* noop */ }
            if (localStream) {
              localStream.getVideoTracks().forEach(t => { if (t !== cam) localStream.removeTrack(t); });
              if (!localStream.getVideoTracks().includes(cam)) localStream.addTrack(cam);
              setLocalStream(new MediaStream(localStream.getTracks()));
            }
          }
          setScreenSharing(false);
        };
      } else {
        const cam = camVideoTrackRef.current;
        if (cam && videoSenderRef.current) {
          await videoSenderRef.current.replaceTrack(cam);
          if (localStream) {
            localStream.getVideoTracks().forEach(t => { if (t !== cam) { try { t.stop(); } catch { /* noop */ } localStream.removeTrack(t); } });
            if (!localStream.getVideoTracks().includes(cam)) localStream.addTrack(cam);
            setLocalStream(new MediaStream(localStream.getTracks()));
          }
        }
        setScreenSharing(false);
      }
    } catch (err) {
      console.error('screen share failed', err);
    }
  }, [screenSharing, localStream]);

  const toggleRecording = useCallback(async () => {
    if (recording) {
      try { recorderRef.current?.stop(); } catch { /* noop */ }
      return;
    }
    try {
      // Mix local + remote into one stream
      const mixed = new MediaStream();
      localStream?.getTracks().forEach(t => mixed.addTrack(t));
      remoteStreamRef.current?.getTracks().forEach(t => mixed.addTrack(t));
      if (mixed.getTracks().length === 0) return;
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
        ? 'video/webm;codecs=vp8,opus'
        : (MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : '');
      const rec = new MediaRecorder(mixed, mime ? { mimeType: mime } : undefined);
      recordChunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) recordChunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(recordChunksRef.current, { type: mime || 'video/webm' });
        recordChunksRef.current = [];
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        a.href = url;
        a.download = `call-recording-${ts}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        setRecording(false);
      };
      recorderRef.current = rec;
      rec.start(1000);
      setRecording(true);
    } catch (err) {
      console.error('recording failed', err);
      setRecording(false);
    }
  }, [recording, localStream]);

  // Latest callbacks/profile for the long-lived signaling listener, so it can
  // stay subscribed without re-running on every render.
  const cleanupRef = useRef(cleanup); cleanupRef.current = cleanup;
  const stopInviteRetryRef = useRef(stopInviteRetry); stopInviteRetryRef.current = stopInviteRetry;
  const sendMissedAlertRef = useRef(sendMissedAlert); sendMissedAlertRef.current = sendMissedAlert;
  const playRingtoneRef = useRef(playRingtone); playRingtoneRef.current = playRingtone;
  const profileRef = useRef(profile); profileRef.current = profile;

  // ---- Global signaling listener
  //
  // Subscribed ONCE per signed-in user. It used to depend on state.status /
  // state.peerId, so every ringing transition tore the channel down and built
  // it again — invites and "call-end" events that arrived inside that window
  // were lost (call never rang, or the other phone kept ringing after the
  // caller hung up). Handlers now read live values from refs instead.
  useEffect(() => {
    if (!user?.id) return;
    const myId = user.id;
    let disposed = false;
    let retryTimer: number | null = null;
    let channel: RealtimeChannel | null = null;

    const attach = () => {
      const ch = supabase.channel(channelName(myId));
      channel = ch;

      ch.on('broadcast', { event: 'call-invite' }, async ({ payload }) => {
        const { from, kind, offer, callId } = payload as {
          from: string;
          kind: CallKind;
          offer: RTCSessionDescriptionInit;
          callId?: string;
        };
        if (!from || from === myId) return;
        const cur = stateRef.current;
        const busy = !!cur && cur.status !== 'idle' && cur.status !== 'ended';
        // Same caller ringing again (invite retry every 2s) — already handled.
        if (ringingFromRef.current === from) return;
        if (busy) {
          if (cur?.peerId === from) return;
          await sendSignal(from, 'call-end', { reason: 'busy' });
          void sendMissedAlertRef.current?.(
            from, kind, profileRef.current?.username, 'busy',
          );
          return;
        }
        ringingFromRef.current = from;
        incomingOfferRef.current = offer;
        callIdRef.current = callId || newId();
        // Ring immediately with whatever profile we already have, then fill the
        // profile in so the ringtone never waits on a network round-trip.
        setState(prev => ({
          status: 'ringing-in',
          kind,
          peerId: from,
          peerProfile: prev.peerId === from ? prev.peerProfile : null,
          startedAt: null,
        }));
        playRingtoneRef.current();
        void getProfile(from)
          .then(peerProfile => {
            if (disposed || ringingFromRef.current !== from) return;
            setState(prev => (prev.peerId === from ? { ...prev, peerProfile } : prev));
          })
          .catch(() => { /* keep the call ringing without a profile */ });
        // Auto-accept if the user tapped "Answer" on the phone notification.
        if (autoAcceptRef.current) {
          autoAcceptRef.current = false;
          window.setTimeout(() => { acceptCallRef.current?.(); }, 250);
        }
      });

      ch.on('broadcast', { event: 'call-answer' }, async ({ payload }) => {
        const { answer } = payload as { answer: RTCSessionDescriptionInit };
        const pc = pcRef.current;
        if (!pc) return;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          for (const c of pendingIceRef.current) { try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch { /* noop */ } }
          pendingIceRef.current = [];
          setState(prev => ({ ...prev, status: 'connecting' }));
        } catch (err) { console.error('answer apply failed', err); }
      });

      ch.on('broadcast', { event: 'call-ice' }, async ({ payload }) => {
        const { candidate } = payload as { candidate: RTCIceCandidateInit };
        const pc = pcRef.current;
        if (pc?.remoteDescription) {
          try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch { /* noop */ }
        } else {
          pendingIceRef.current.push(candidate);
        }
      });

      ch.on('broadcast', { event: 'camera-toggle' }, ({ payload }) => {
        const { cameraOff: remoteCamOff } = (payload || {}) as { cameraOff?: boolean };
        if (remoteCamOff === false) {
          setState(prev => ({ ...prev, kind: 'video' }));
        } else if (remoteCamOff === true && cameraOffRef.current) {
          setState(prev => ({ ...prev, kind: 'audio' }));
        }
      });

      ch.on('broadcast', { event: 'call-end' }, ({ payload }) => {
        const { reason } = payload as { reason?: string };
        stopInviteRetryRef.current();
        ringingFromRef.current = null;
        cleanupRef.current();
        setState(prev => (prev.status === 'idle' ? prev : { ...prev, status: 'ended', endedReason: reason || 'Call ended' }));
        window.setTimeout(() => setState({ status: 'idle', kind: 'audio', peerId: null, peerProfile: null, startedAt: null }), 1500);
      });

      ch.subscribe(status => {
        if (disposed) return;
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          // Rebuild the channel so calls keep landing after a network blip.
          try { supabase.removeChannel(ch); } catch { /* noop */ }
          if (retryTimer) window.clearTimeout(retryTimer);
          retryTimer = window.setTimeout(() => { if (!disposed) attach(); }, 1500);
        }
      });
    };

    attach();
    return () => {
      disposed = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      if (channel) { try { supabase.removeChannel(channel); } catch { /* noop */ } }
    };
  }, [user?.id, sendSignal]);

  // Put the phone into voice-call audio mode while a call is live, so Android's
  // echo canceller / noise suppressor run and the speaker toggle is respected.
  useEffect(() => {
    const inCall = state.status === 'connecting' || state.status === 'active';
    applyCallAudioRoute(inCall, speakerOn);
  }, [state.status, speakerOn]);

  useEffect(() => {
    setCallFarEndStreams(remoteStream ? [remoteStream] : []);
  }, [remoteStream]);

  // Close cached signaling channels when the provider goes away.
  useEffect(() => () => {
    signalChannelsRef.current.forEach(entry => {
      try { supabase.removeChannel(entry.ch); } catch { /* noop */ }
    });
    signalChannelsRef.current.clear();
  }, []);

  // Ask notification permission once
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'default') { Notification.requestPermission().catch(() => {}); }
  }, []);

  // Live phone notification for call states: Ringing-out, Ringing-in, and Active Call
  useEffect(() => {
    if (state.status === "idle" || state.status === "ended") {
      dismissPhoneNotification("call_ongoing");
      return;
    }

    const who = state.peerProfile?.username || state.peerProfile?.full_name || "User";
    const label = state.kind === "video" ? "Video call" : "Voice call";

    if (state.status === "ringing-out") {
      notifyPhone({
        title: `${label} · Ringing...`,
        body: `Calling ${who}...`,
        tag: "call_ongoing",
        isCall: true,
        isOngoing: true,
      });
    } else if (state.status === "ringing-in") {
      notifyPhone({
        title: `Incoming ${label} 📞`,
        body: `${who} is calling you...`,
        tag: "call_ongoing",
        isCall: true,
        isOngoing: false,
      });
    } else if (state.status === "active") {
      const updateOngoing = () => {
        const startedAt = startedAtRef.current;
        const durSec = startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0;
        const mm = Math.floor(durSec / 60).toString().padStart(2, "0");
        const ss = Math.floor(durSec % 60).toString().padStart(2, "0");
        notifyPhone({
          title: `Active ${label}`,
          body: `${who} (${mm}:${ss}) · Tap to return`,
          tag: "call_ongoing",
          isCall: true,
          isOngoing: true,
        });
      };
      updateOngoing();
      const intervalId = window.setInterval(updateOngoing, 1000);
      return () => {
        clearInterval(intervalId);
      };
    }
  }, [state.status, state.kind, state.peerProfile]);


  // "End call" tapped on the phone's ongoing-call notification
  useEffect(() => {
    if (state.status === 'idle' || state.status === 'ended') return;
    const onEndRequested = () => { endCallRef.current?.(); };
    window.addEventListener('appEndCallRequested', onEndRequested);
    return () => window.removeEventListener('appEndCallRequested', onEndRequested);
  }, [state.status]);

  // Receiver side: if an incoming call rings unanswered for 45s, auto-decline
  // and send the caller a missed-call alert.
  useEffect(() => {
    if (state.status !== 'ringing-in') return;
    const t = window.setTimeout(() => {
      if (stateRef.current?.status === 'ringing-in') rejectCallRef.current?.('no-answer');
    }, 45000);
    return () => clearTimeout(t);
  }, [state.status, state.peerId]);

  const value = useMemo<CallContextValue>(() => ({
    ...state, localStream, remoteStream, muted, cameraOff,
    minimized, screenSharing, recording,
    startCall, playRingtone, acceptCall, rejectCall, endCall, toggleMute, toggleCamera,
    toggleMinimize, toggleScreenShare, toggleRecording,
    speakerOn, toggleSpeaker, facingFront, flipCamera,
  }), [state, localStream, remoteStream, muted, cameraOff, minimized, screenSharing, recording, startCall, playRingtone, acceptCall, rejectCall, endCall, toggleMute, toggleCamera, toggleMinimize, toggleScreenShare, toggleRecording, speakerOn, toggleSpeaker, facingFront, flipCamera]);

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
};