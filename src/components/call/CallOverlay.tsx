import React, { useEffect, useRef, useState } from 'react';
import { useCall } from '@/contexts/CallContext';
import {
  PhoneOff,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  RefreshCw,
  ChevronDown,
  MessageCircle,
  Phone,
} from 'lucide-react';
import { MessengerCallBubble } from './MessengerCallBubble';

const fmt = (secs: number) => {
  const m = Math.floor(secs / 60)
    .toString()
    .padStart(2, '0');
  const s = Math.floor(secs % 60)
    .toString()
    .padStart(2, '0');
  return `${m}:${s}`;
};

export const CallOverlay: React.FC = () => {
  const call = useCall();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const [elapsed, setElapsed] = useState(0);

  // Bind local video stream
  useEffect(() => {
    if (localVideoRef.current && call.localStream) {
      localVideoRef.current.srcObject = call.localStream;
      localVideoRef.current.play().catch(() => {});
    }
  }, [call.localStream, call.cameraOff]);

  // Bind remote video stream
  useEffect(() => {
    if (remoteVideoRef.current && call.remoteStream) {
      remoteVideoRef.current.srcObject = call.remoteStream;
      remoteVideoRef.current.play().catch(() => {});
    }
  }, [call.remoteStream, call.kind]);

  // Bind remote audio stream & speaker routing (earpiece vs loudspeaker)
  useEffect(() => {
    const el = remoteAudioRef.current;
    if (!el) return;

    if (call.remoteStream && el.srcObject !== call.remoteStream) {
      el.srcObject = call.remoteStream;
      el.play().catch(() => {});
    }

    // Normal ear-call vs Loudspeaker:
    // When speaker is ON: 1.0 (loudspeaker)
    // When speaker is OFF: 0.25 (earpiece receiver)
    el.volume = call.speakerOn ? 1.0 : 0.25;

    const anyEl = el as HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> };
    if (typeof anyEl.setSinkId === 'function') {
      anyEl.setSinkId(call.speakerOn ? 'default' : 'communications').catch(() => {});
    }

    // Native Android wrapper
    const android = (window as unknown as { AndroidAudio?: { setSpeakerphoneOn?: (on: boolean) => void } }).AndroidAudio;
    android?.setSpeakerphoneOn?.(call.speakerOn);
  }, [call.speakerOn, call.remoteStream]);

  // Call timer
  useEffect(() => {
    if (call.status !== 'active' || !call.startedAt) {
      setElapsed(0);
      return;
    }
    const start = call.startedAt;
    const update = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    update();
    const id = window.setInterval(update, 500);
    return () => clearInterval(id);
  }, [call.status, call.startedAt]);

  const visible =
    call.status === 'ringing-out' ||
    call.status === 'connecting' ||
    call.status === 'active' ||
    call.status === 'ended';

  // Intercept back button when call is full screen so call stays active and minimizes into floating bubble
  useEffect(() => {
    if (!visible || call.minimized) return;
    window.history.pushState({ in1on1Call: true }, '');

    const handlePopState = () => {
      call.toggleMinimize();
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [visible, call.minimized, call]);

  if (!visible) return null;

  const hasLocalVideo =
    !call.cameraOff &&
    Boolean(
      call.localStream?.getVideoTracks().some(
        t => (t.readyState === 'live' || (t.readyState as string) === 'active') && t.enabled !== false
      )
    );

  const hasRemoteVideo = Boolean(
    call.remoteStream?.getVideoTracks().some(
      t => (t.readyState === 'live' || (t.readyState as string) === 'active') && t.enabled !== false
    )
  );

  const name =
    call.peerProfile?.username ||
    call.peerProfile?.full_name ||
    'Pixelgram User';

  const avatarUrl = call.peerProfile?.avatar_url || '';

  // Status subtitle
  const statusSubtitle =
    call.status === 'ringing-out'
      ? 'Calling…'
      : call.status === 'connecting'
      ? 'Connecting…'
      : call.status === 'active'
      ? fmt(elapsed)
      : call.endedReason || 'Call ended';

  // Badge state
  const isConnected = call.status === 'active';
  const isEnded = call.status === 'ended';
  const badgeClass = isEnded ? 'pcall-badge end' : isConnected ? 'pcall-badge on' : 'pcall-badge';
  const badgeText = isEnded ? 'Ended' : isConnected ? 'Connected' : 'Ringing';

  // Minimized floating Messenger-style Call Bubble
  if (call.minimized) {
    return (
      <>
        <audio ref={remoteAudioRef} autoPlay playsInline />
        <MessengerCallBubble
          avatarUrl={call.peerProfile?.avatar_url}
          title={name}
          kind={hasRemoteVideo || hasLocalVideo ? 'video' : 'audio'}
          elapsedSeconds={elapsed}
          videoStream={hasRemoteVideo ? call.remoteStream : hasLocalVideo ? call.localStream : null}
          muted={call.muted}
          onToggleMute={call.toggleMute}
          onMaximize={call.toggleMinimize}
          onEndCall={call.endCall}
        />
      </>
    );
  }

  return (
    <div className="pcall-app">
      {/* Background audio playback */}
      <audio ref={remoteAudioRef} autoPlay playsInline />

      <div className={`pcall-box ${isEnded ? 'over' : ''}`}>
        {/* Remote Person Full Tile / Profile Photo Background */}
        <div
          className="pcall-remote"
          style={{
            backgroundImage: !hasRemoteVideo && avatarUrl ? `url(${avatarUrl})` : undefined,
          }}
        >
          {/* If remote camera is active, display live remote video */}
          {hasRemoteVideo && (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="absolute inset-0 w-full h-full object-cover z-0"
            />
          )}

          {/* Fallback pattern if no avatar */}
          {!hasRemoteVideo && !avatarUrl && (
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-950 via-slate-900 to-black flex items-center justify-center">
              <span className="text-7xl font-bold text-white/40">
                {(name?.[0] || 'U').toUpperCase()}
              </span>
            </div>
          )}
        </div>

        {/* Local Camera Self Preview (Picture-in-Picture) */}
        {hasLocalVideo && call.localStream && (
          <div className="absolute bottom-36 right-4 w-28 h-40 rounded-2xl overflow-hidden ring-2 ring-white/30 shadow-2xl bg-black z-20">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Top Bar */}
        <div className="pcall-top">
          <button
            type="button"
            className="pcall-back"
            onClick={call.toggleMinimize}
            title="Minimize call"
          >
            <ChevronDown className="w-6 h-6 stroke-[2.4]" />
          </button>

          <div className="pcall-who">
            <b>{name}</b>
            <span id="sub">{statusSubtitle}</span>
          </div>

          <div className={badgeClass} id="badge">
            <i />
            <span id="btxt">{badgeText}</span>
          </div>
        </div>

        {/* Name Tag on Tile */}
        <div className="pcall-tag" id="tag">
          <span>@{name}</span>
          {call.speakerOn && (
            <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-black/40 px-2 py-0.5 rounded-full border border-emerald-500/30">
              <Volume2 className="w-3 h-3" />
              <span>Speaker on</span>
            </span>
          )}
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
        </div>

        {/* Bottom Control Bar */}
        <div className="pcall-bar" id="bar">
          {/* Mute Button */}
          <button
            type="button"
            className={`pcall-b ${call.muted ? 'on' : ''}`}
            onClick={call.toggleMute}
            title={call.muted ? 'Unmute' : 'Mute'}
          >
            {call.muted ? (
              <MicOff className="w-6 h-6 stroke-[2]" />
            ) : (
              <Mic className="w-6 h-6 stroke-[2]" />
            )}
          </button>

          {/* Camera Button */}
          <button
            type="button"
            className={`pcall-b ${!call.cameraOff ? 'on' : ''}`}
            onClick={() => void call.toggleCamera()}
            title={call.cameraOff ? 'Turn on camera' : 'Turn off camera'}
          >
            {!call.cameraOff ? (
              <Video className="w-6 h-6 stroke-[2]" />
            ) : (
              <VideoOff className="w-6 h-6 stroke-[2]" />
            )}
          </button>

          {/* End Call Button */}
          <button
            type="button"
            className="pcall-b end"
            onClick={call.endCall}
            disabled={call.status === 'ended'}
            title="End call"
          >
            <PhoneOff className="w-7 h-7 fill-white stroke-none" />
          </button>

          {/* Speaker Button */}
          <button
            type="button"
            className={`pcall-b ${call.speakerOn ? 'on' : ''}`}
            onClick={call.toggleSpeaker}
            title={call.speakerOn ? 'Earpiece' : 'Speaker'}
          >
            {call.speakerOn ? (
              <Volume2 className="w-6 h-6 stroke-[2]" />
            ) : (
              <VolumeX className="w-6 h-6 stroke-[2]" />
            )}
          </button>

          {/* Flip Camera Button */}
          <button
            type="button"
            className="pcall-b"
            onClick={() => void call.flipCamera()}
            title="Flip camera"
          >
            <RefreshCw className="w-5 h-5 stroke-[2]" />
          </button>
        </div>

        {/* Call Ended Screen */}
        {isEnded && (
          <div className="pcall-over" id="over">
            <h2>Call ended</h2>
            <p id="dur">
              {elapsed > 0 ? `Duration ${fmt(elapsed)}` : 'Not answered'}
            </p>
            {call.peerId && (
              <button
                type="button"
                id="again"
                onClick={() => void call.startCall(call.peerId!, call.kind)}
              >
                Call again
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const IncomingCallModal: React.FC = () => {
  const call = useCall();
  if (call.status !== 'ringing-in') return null;
  const name =
    call.peerProfile?.username ||
    call.peerProfile?.full_name ||
    'Unknown';

  const avatarUrl = call.peerProfile?.avatar_url || '';

  return (
    <div className="fixed inset-0 z-[125] flex items-center justify-center bg-[#050309] text-white select-none overflow-hidden font-sans">
      <div className="relative w-full max-w-[430px] h-full max-h-[900px] overflow-hidden bg-[#0a0710] flex flex-col justify-between">
        {/* Full DP Background */}
        <div
          className="absolute inset-0 bg-cover bg-center filter saturate-110"
          style={{
            backgroundImage: avatarUrl ? `url(${avatarUrl})` : undefined,
          }}
        >
          {!avatarUrl && (
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-950 via-slate-900 to-black" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-[rgba(10,7,16,0.75)] via-[rgba(10,7,16,0.3)] to-[rgba(10,7,16,0.92)]" />
        </div>

        {/* Top Section */}
        <div className="relative z-10 pt-16 px-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-xs font-medium text-emerald-400 mb-4 border border-white/10">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Incoming {call.kind === 'video' ? 'Video' : 'Voice'} Call</span>
          </div>
          <h2 className="text-2xl font-bold drop-shadow-md">{name}</h2>
          {call.peerProfile?.username && (
            <p className="text-white/60 text-sm mt-0.5">@{call.peerProfile.username}</p>
          )}
        </div>

        {/* Center Pulsing Avatar */}
        <div className="relative z-10 flex items-center justify-center my-auto">
          <div className="relative">
            <span className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping duration-1000" />
            <span className="absolute -inset-4 rounded-full bg-emerald-500/10 animate-pulse" />
            <div className="relative w-36 h-36 rounded-full overflow-hidden border-4 border-white/20 shadow-2xl bg-white/10 flex items-center justify-center">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-5xl font-bold text-white">
                  {(name?.[0] || 'U').toUpperCase()}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="relative z-10 px-8 pb-12 flex items-center justify-between">
          {/* Decline Button */}
          <button
            type="button"
            onClick={() => call.rejectCall('declined')}
            className="flex flex-col items-center gap-1.5 cursor-pointer"
          >
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center shadow-lg shadow-rose-500/40 text-white active:scale-90 transition-transform">
              <PhoneOff className="w-7 h-7 stroke-[2]" />
            </div>
            <span className="text-xs text-white/80 font-medium">Decline</span>
          </button>

          {/* Accept Button */}
          <button
            type="button"
            onClick={call.acceptCall}
            className="flex flex-col items-center gap-1.5 cursor-pointer animate-bounce"
          >
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-400 to-green-600 flex items-center justify-center shadow-lg shadow-emerald-500/40 text-white active:scale-90 transition-transform">
              {call.kind === 'video' ? (
                <Video className="w-7 h-7 stroke-[2]" />
              ) : (
                <Phone className="w-7 h-7 stroke-[2]" />
              )}
            </div>
            <span className="text-xs text-white/80 font-medium">Accept</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default CallOverlay;
