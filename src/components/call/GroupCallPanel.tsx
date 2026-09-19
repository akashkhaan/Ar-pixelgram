import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Camera, CameraOff, Mic, MicOff, Monitor, Phone, PhoneOff, Users, Video, VideoOff, Volume2, VolumeX, X } from 'lucide-react';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { createGroupCall, endGroupCall, joinGroupCall, leaveGroupCall } from '@/services/groups';
import type { GroupMember } from '@/types/groups';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export type CallKind = 'audio' | 'video';

type Signal = {
  type: 'invite' | 'join' | 'offer' | 'answer' | 'ice' | 'leave';
  callId: string;
  from: string;
  to?: string;
  kind?: CallKind;
  startedAt?: number;
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

export type GroupCallPanelProps = {
  groupId: string;
  groupName?: string;
  members: GroupMember[];
};

export type GroupCallPanelHandle = {
  startCall: (kind: CallKind) => Promise<void>;
  isCallActive: () => boolean;
};

const TILE_COLORS = [
  'from-slate-800 via-slate-700 to-slate-900',
  'from-rose-900 via-red-800 to-orange-900',
  'from-violet-900 via-fuchsia-800 to-pink-900',
  'from-emerald-900 via-teal-800 to-cyan-900',
  'from-amber-900 via-yellow-800 to-orange-900',
  'from-blue-900 via-indigo-800 to-violet-900',
];

const initials = (name: string) => name.trim().slice(0, 1).toUpperCase() || '?';

const ParticipantTile: React.FC<{
  stream: MediaStream | null;
  label: string;
  avatarUrl?: string | null;
  muted?: boolean;
  showVideo: boolean;
  speakerOn: boolean;
  index: number;
  local?: boolean;
}> = ({ stream, label, avatarUrl, muted, showVideo, speakerOn, index, local }) => {
  const ref = useRef<HTMLVideoElement>(null);
  const hasVideo = Boolean(stream && showVideo);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.srcObject = stream;
    ref.current.volume = speakerOn ? 1 : 0;
  }, [stream, speakerOn]);

  return (
    <div className="relative flex min-h-[240px] flex-1 flex-col items-center justify-center overflow-hidden rounded-3xl bg-neutral-900 shadow-xl border border-white/10">
      {hasVideo ? (
        <>
          <video ref={ref} autoPlay playsInline muted={muted} className="h-full min-h-[240px] w-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/85 via-black/40 to-transparent px-4 pb-3.5 pt-8 text-white">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold drop-shadow">{local ? 'You' : label}</span>
              {muted && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white shadow">
                  <MicOff className="h-3 w-3" />
                </span>
              )}
            </div>
            <span className="rounded-full bg-black/50 px-2.5 py-0.5 text-[11px] font-medium text-white/90 backdrop-blur-sm border border-white/10">
              Camera
            </span>
          </div>
        </>
      ) : (
        <>
          {/* Messenger-style DP Background */}
          {avatarUrl ? (
            <div className="absolute inset-0 overflow-hidden">
              <img
                src={avatarUrl}
                alt=""
                className="h-full w-full object-cover scale-110 blur-xl brightness-[0.50] select-none"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/10 to-black/80" />
            </div>
          ) : (
            <div className={'absolute inset-0 bg-gradient-to-br ' + TILE_COLORS[index % TILE_COLORS.length]} />
          )}

          {/* Center Avatar & Identity */}
          <div className="relative z-10 flex flex-col items-center justify-center p-6 text-center select-none">
            <div className="relative">
              <div className="flex h-24 w-24 sm:h-28 sm:w-28 items-center justify-center overflow-hidden rounded-full bg-white/15 text-3xl font-bold text-white ring-4 ring-white/35 shadow-2xl backdrop-blur-sm">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={label} className="h-full w-full object-cover" />
                ) : (
                  initials(label)
                )}
              </div>
              {muted && (
                <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-red-600 text-white shadow-lg ring-2 ring-black/70">
                  <MicOff className="h-4 w-4" />
                </span>
              )}
            </div>

            <div className="mt-3.5 flex flex-col items-center">
              <p className="max-w-[220px] truncate text-base font-bold text-white drop-shadow-md">
                {local ? 'You' : label}
              </p>
              <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-0.5 text-xs font-medium text-white/90 backdrop-blur-sm border border-white/10 shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Audio
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

/* Circular Messenger-style call control button */
const RoundCallButton: React.FC<{
  label: string;
  onClick: () => void;
  variant?: 'normal' | 'danger' | 'highlight' | 'active';
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ label, onClick, variant = 'normal', disabled, children }) => {
  let styleClasses = 'bg-white/15 text-white hover:bg-white/25 border border-white/10 shadow-sm';
  if (variant === 'danger') {
    styleClasses = 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/40 border border-red-500/40';
  } else if (variant === 'highlight' || variant === 'active') {
    styleClasses = 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/40 border border-blue-400/40';
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className={`flex h-12 w-12 items-center justify-center rounded-full transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 ${styleClasses}`}
      >
        {children}
      </button>
      <span className="text-[11px] font-medium text-white/80 select-none text-center">{label}</span>
    </div>
  );
};

export const GroupCallPanel = forwardRef<GroupCallPanelHandle, GroupCallPanelProps>(
  ({ groupId, groupName, members }, ref) => {
    const { user, profile } = useAuth();
    const channelRef = useRef<any>(null);
    const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
    const localStreamRef = useRef<MediaStream | null>(null);
    const screenStreamRef = useRef<MediaStream | null>(null);
    const activeCallRef = useRef<string | null>(null);
    const starterRef = useRef(false);
    const channelReadyRef = useRef(false);

    const [callId, setCallId] = useState<string | null>(null);
    const [kind, setKind] = useState<CallKind>('audio');
    const [incoming, setIncoming] = useState<Signal | null>(null);
    const [active, setActive] = useState(false);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
    const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
    const [remoteLabels, setRemoteLabels] = useState<Map<string, string>>(new Map());
    const [remoteAvatars, setRemoteAvatars] = useState<Map<string, string | null>>(new Map());
    const [muted, setMuted] = useState(false);
    const [cameraOff, setCameraOff] = useState(false);
    const [speakerOn, setSpeakerOn] = useState(true);
    const [screenSharing, setScreenSharing] = useState(false);
    const [startedAt, setStartedAt] = useState<number | null>(null);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);

    const memberFor = useCallback((userId: string) => members.find(member => member.user_id === userId)?.profile, [members]);
    const send = useCallback((signal: Signal) => {
      void channelRef.current?.send({ type: 'broadcast', event: 'signal', payload: signal });
    }, []);

    const waitForChannel = useCallback(async () => {
      for (let attempt = 0; attempt < 30 && !channelReadyRef.current; attempt += 1) {
        await new Promise(resolve => window.setTimeout(resolve, 100));
      }
      if (!channelReadyRef.current) throw new Error('Call connection is still starting. Please try again.');
    }, []);

    const closePeer = useCallback((peerId: string) => {
      peersRef.current.get(peerId)?.close();
      peersRef.current.delete(peerId);
      setRemoteStreams(current => {
        const next = new Map(current);
        next.delete(peerId);
        return next;
      });
      setRemoteLabels(current => {
        const next = new Map(current);
        next.delete(peerId);
        return next;
      });
      setRemoteAvatars(current => {
        const next = new Map(current);
        next.delete(peerId);
        return next;
      });
    }, []);

    const createPeer = useCallback(
      async (peerId: string, isInitiator: boolean, activeId: string, activeKind: CallKind) => {
        if (!user || peersRef.current.has(peerId)) return;
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }],
        });
        peersRef.current.set(peerId, pc);
        localStreamRef.current?.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current as MediaStream));
        pc.onicecandidate = event => {
          if (event.candidate) {
            send({ type: 'ice', callId: activeId, from: user.id, to: peerId, candidate: event.candidate.toJSON() });
          }
        };
        pc.ontrack = event => {
          const stream = event.streams[0];
          if (!stream) return;
          const person = memberFor(peerId);
          setRemoteStreams(current => new Map(current).set(peerId, stream));
          setRemoteLabels(current => new Map(current).set(peerId, person?.username || person?.full_name || 'Participant'));
          setRemoteAvatars(current => new Map(current).set(peerId, person?.avatar_url || null));
        };
        pc.onconnectionstatechange = () => {
          if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) closePeer(peerId);
        };
        if (isInitiator) {
          const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: activeKind === 'video' });
          await pc.setLocalDescription(offer);
          send({ type: 'offer', callId: activeId, from: user.id, to: peerId, kind: activeKind, offer });
        }
      },
      [closePeer, memberFor, send, user],
    );

    const handleSignal = useCallback(
      async (signal: Signal) => {
        if (!user || signal.from === user.id || (signal.to && signal.to !== user.id)) return;
        if (signal.type === 'invite') {
          if (!active && !incoming) setIncoming(signal);
          return;
        }
        if (signal.type === 'join') {
          if (starterRef.current && signal.callId === activeCallRef.current) {
            await createPeer(signal.from, true, signal.callId, signal.kind || kind);
          }
          return;
        }
        if (signal.type === 'offer' && signal.offer) {
          if (signal.callId !== activeCallRef.current) return;
          await createPeer(signal.from, false, signal.callId, signal.kind || kind);
          const pc = peersRef.current.get(signal.from);
          if (!pc) return;
          await pc.setRemoteDescription(signal.offer);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          send({ type: 'answer', callId: signal.callId, from: user.id, to: signal.from, answer });
          return;
        }
        if (signal.type === 'answer' && signal.answer) {
          const pc = peersRef.current.get(signal.from);
          if (pc) await pc.setRemoteDescription(signal.answer);
          return;
        }
        if (signal.type === 'ice' && signal.candidate) {
          const pc = peersRef.current.get(signal.from);
          if (pc) await pc.addIceCandidate(signal.candidate);
          return;
        }
        if (signal.type === 'leave') closePeer(signal.from);
      },
      [active, closePeer, createPeer, incoming, kind, send, user],
    );

    useEffect(() => {
      const channel = supabase.channel('group-call-signal-' + groupId);
      channel.on('broadcast', { event: 'signal' }, payload => {
        void handleSignal(payload.payload as Signal);
      });
      channel.subscribe(status => {
        channelReadyRef.current = status === 'SUBSCRIBED';
      });
      channelRef.current = channel;
      return () => {
        channelReadyRef.current = false;
        void channel.unsubscribe();
        channelRef.current = null;
      };
    }, [groupId, handleSignal]);

    useEffect(() => {
      if (!active || !startedAt) return;
      const update = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
      update();
      const timer = window.setInterval(update, 1000);
      return () => window.clearInterval(timer);
    }, [active, startedAt]);

    const getMedia = async (requestedKind: CallKind) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Audio/video calls need HTTPS and microphone/camera permission');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: requestedKind === 'video' });
      localStreamRef.current = stream;
      setLocalStream(stream);
      return stream;
    };

    const start = async (requestedKind: CallKind) => {
      if (!user || active) return;
      try {
        await waitForChannel();
        const id = await createGroupCall(groupId, requestedKind);
        await getMedia(requestedKind);
        await joinGroupCall(id);
        const callStarted = Date.now();
        activeCallRef.current = id;
        starterRef.current = true;
        setCallId(id);
        setKind(requestedKind);
        setStartedAt(callStarted);
        setActive(true);
        send({ type: 'invite', callId: id, from: user.id, kind: requestedKind, startedAt: callStarted });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Call start nahi hui');
      }
    };

    useImperativeHandle(
      ref,
      () => ({
        startCall: async (requestedKind: CallKind) => {
          await start(requestedKind);
        },
        isCallActive: () => active,
      }),
      [active, start],
    );

    const accept = async () => {
      if (!incoming || !user) return;
      try {
        await waitForChannel();
        await getMedia(incoming.kind || 'audio');
        await joinGroupCall(incoming.callId);
        activeCallRef.current = incoming.callId;
        starterRef.current = false;
        setCallId(incoming.callId);
        setKind(incoming.kind || 'audio');
        setStartedAt(incoming.startedAt || Date.now());
        setActive(true);
        setIncoming(null);
        send({ type: 'join', callId: incoming.callId, from: user.id, to: incoming.from, kind: incoming.kind });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Call join nahi hui');
      }
    };

    const stopScreenShare = useCallback(async () => {
      const display = screenStreamRef.current;
      const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
      for (const pc of peersRef.current.values()) {
        const sender = pc.getSenders().find(item => item.track?.kind === 'video');
        if (sender && cameraTrack) await sender.replaceTrack(cameraTrack);
      }
      if (cameraTrack) cameraTrack.enabled = !cameraOff;
      display?.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
      setScreenStream(null);
      setScreenSharing(false);
    }, [cameraOff]);

    const toggleScreenShare = async () => {
      if (kind !== 'video') {
        toast.info('Screen share video call me available hai');
        return;
      }
      if (screenSharing) {
        await stopScreenShare();
        return;
      }
      try {
        if (!navigator.mediaDevices?.getDisplayMedia) {
          throw new Error('Screen share browser me available nahi hai');
        }
        const display = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const track = display.getVideoTracks()[0];
        for (const pc of peersRef.current.values()) {
          const sender = pc.getSenders().find(item => item.track?.kind === 'video');
          if (sender) await sender.replaceTrack(track);
        }
        screenStreamRef.current = display;
        setScreenStream(display);
        setScreenSharing(true);
        track.onended = () => {
          void stopScreenShare();
        };
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Screen share start nahi hua');
      }
    };

    const leave = async () => {
      const id = activeCallRef.current;
      if (id && user) {
        send({ type: 'leave', callId: id, from: user.id });
        try {
          await leaveGroupCall(id);
          if (starterRef.current) await endGroupCall(id);
        } catch {
          /* cleanup continues */
        }
      }
      screenStreamRef.current?.getTracks().forEach(track => track.stop());
      peersRef.current.forEach(peer => peer.close());
      peersRef.current.clear();
      localStreamRef.current?.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
      screenStreamRef.current = null;
      activeCallRef.current = null;
      starterRef.current = false;
      setRemoteStreams(new Map());
      setRemoteLabels(new Map());
      setRemoteAvatars(new Map());
      setScreenStream(null);
      setLocalStream(null);
      setCallId(null);
      setStartedAt(null);
      setElapsedSeconds(0);
      setScreenSharing(false);
      setActive(false);
      setIncoming(null);
    };

    const toggleMute = () => {
      const next = !muted;
      localStreamRef.current?.getAudioTracks().forEach(track => {
        track.enabled = !next;
      });
      setMuted(next);
    };

    const toggleCamera = () => {
      const next = !cameraOff;
      if (!screenSharing) {
        localStreamRef.current?.getVideoTracks().forEach(track => {
          track.enabled = !next;
        });
      }
      setCameraOff(next);
    };

    const formatTime = (seconds: number) =>
      Math.floor(seconds / 60)
        .toString()
        .padStart(2, '0') +
      ':' +
      (seconds % 60).toString().padStart(2, '0');

    const participantCount = remoteStreams.size + 1;
    const localLabel = profile?.username || profile?.full_name || user?.email?.split('@')[0] || 'You';

    /* Incoming Call Notification (Messenger style floating card) */
    if (incoming) {
      const caller = memberFor(incoming.from);
      return (
        <div className="fixed top-3 inset-x-3 z-[100] mx-auto max-w-md animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-3 rounded-2xl border border-border/80 bg-card/95 p-3 shadow-2xl backdrop-blur-md">
            <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-primary/20 font-semibold text-primary shrink-0 ring-2 ring-primary/30">
              {caller?.avatar_url ? (
                <img src={caller.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                initials(caller?.username || caller?.full_name || 'Member')
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{caller?.username || caller?.full_name || 'A member'}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Incoming group {incoming.kind || 'audio'} call
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button size="sm" onClick={() => void accept()} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-8 px-3 text-xs font-semibold shadow-sm">
                Join
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setIncoming(null)} className="rounded-xl h-8 px-2 text-xs text-muted-foreground hover:bg-muted">
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      );
    }

    /* When NOT active and NO incoming call, render NOTHING (no box below header!) */
    if (!active) return null;

    const localPreview = screenStream || localStream;

    return (
      <div className="fixed inset-0 z-[80] flex flex-col overflow-hidden bg-[#101114] text-white select-none">
        {/* Call Header */}
        <header className="flex shrink-0 items-center gap-3 border-b border-white/10 bg-[#17181c] px-4 py-3 pt-[max(env(safe-area-inset-top),12px)]">
          <button
            type="button"
            onClick={() => void leave()}
            className="rounded-full p-2 text-white/80 hover:bg-white/10 transition-colors"
            aria-label="End or close call"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold leading-tight">{groupName || 'Group call'}</p>
            <p className="flex items-center gap-1.5 text-xs text-white/60 mt-0.5">
              <Users className="h-3.5 w-3.5" />
              {participantCount} participant{participantCount === 1 ? '' : 's'} · {formatTime(elapsedSeconds)}
            </p>
          </div>
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/90 border border-white/10">
            {kind === 'video' ? 'Video call' : 'Audio call'}
          </span>
        </header>

        {/* Video / Audio Grid */}
        <main className="min-h-0 flex-1 overflow-y-auto p-2">
          <div className="grid h-full auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2">
            <ParticipantTile
              stream={localPreview}
              muted
              label={localLabel}
              avatarUrl={profile?.avatar_url}
              showVideo={kind === 'video' && !cameraOff}
              speakerOn={speakerOn}
              index={0}
              local
            />
            {Array.from(remoteStreams.entries()).map(([peerId, stream], index) => (
              <ParticipantTile
                key={peerId}
                stream={stream}
                label={remoteLabels.get(peerId) || 'Participant'}
                avatarUrl={remoteAvatars.get(peerId)}
                showVideo={kind === 'video'}
                speakerOn={speakerOn}
                index={index + 1}
              />
            ))}
          </div>
        </main>

        {/* Messenger-style circular bottom controls - NEVER turning white */}
        <footer className="flex shrink-0 items-center justify-around gap-2 border-t border-white/10 bg-[#17181c] px-3 py-3.5 pb-[max(env(safe-area-inset-bottom),16px)]">
          {/* Mute Button */}
          <RoundCallButton
            label={muted ? 'Unmute' : 'Mute'}
            onClick={toggleMute}
            variant={muted ? 'danger' : 'normal'}
          >
            {muted ? <MicOff className="h-5 w-5 text-white" /> : <Mic className="h-5 w-5 text-white" />}
          </RoundCallButton>

          {/* Camera Button (Video Call Only) */}
          {kind === 'video' && (
            <RoundCallButton
              label={cameraOff ? 'Turn on' : 'Camera'}
              onClick={toggleCamera}
              variant={cameraOff ? 'danger' : 'normal'}
            >
              {cameraOff ? <CameraOff className="h-5 w-5 text-white" /> : <Camera className="h-5 w-5 text-white" />}
            </RoundCallButton>
          )}

          {/* Screen Share Button (Video Call Only) */}
          {kind === 'video' && (
            <RoundCallButton
              label={screenSharing ? 'Stop' : 'Share'}
              onClick={() => void toggleScreenShare()}
              variant={screenSharing ? 'highlight' : 'normal'}
            >
              <Monitor className="h-5 w-5 text-white" />
            </RoundCallButton>
          )}

          {/* Speaker Button */}
          <RoundCallButton
            label={speakerOn ? 'Speaker' : 'Earpiece'}
            onClick={() => setSpeakerOn(value => !value)}
            variant={speakerOn ? 'active' : 'normal'}
          >
            {speakerOn ? <Volume2 className="h-5 w-5 text-white" /> : <VolumeX className="h-5 w-5 text-white" />}
          </RoundCallButton>

          {/* End Call Button */}
          <RoundCallButton
            label="End"
            onClick={() => void leave()}
            variant="danger"
          >
            <PhoneOff className="h-5 w-5 text-white" />
          </RoundCallButton>
        </footer>
      </div>
    );
  },
);

GroupCallPanel.displayName = 'GroupCallPanel';

export default GroupCallPanel;
