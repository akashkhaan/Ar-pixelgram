import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  Camera,
  CameraOff,
  ChevronDown,
  Maximize2,
  Mic,
  MicOff,
  Monitor,
  Phone,
  PhoneOff,
  Users,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import {
  createGroupCall,
  endGroupCall,
  getActiveGroupCall,
  joinGroupCall,
  leaveGroupCall,
  startOrJoinGroupCall,
} from '@/services/groups';
import { createNotification, sendPushTo } from '@/services/api';
import { notifyPhone, dismissPhoneNotification } from '@/lib/notifyPhone';
import type { GroupMember } from '@/types/groups';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export type CallKind = 'audio' | 'video';

export interface GroupCallPanelHandle {
  startCall: (kind: CallKind) => Promise<void>;
  isCallActive: () => boolean;
}

interface GroupCallPanelProps {
  groupId: string;
  groupName?: string;
  groupAvatarUrl?: string | null;
  members: GroupMember[];
}

type Signal = {
  type: 'invite' | 'join' | 'offer' | 'answer' | 'ice' | 'leave' | 'mute';
  callId: string;
  from: string;
  to?: string;
  kind?: CallKind;
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  startedAt?: number;
  isMuted?: boolean;
};

const TILE_COLORS = [
  'from-blue-600/80 to-indigo-900/90',
  'from-emerald-600/80 to-teal-900/90',
  'from-purple-600/80 to-violet-900/90',
  'from-amber-600/80 to-rose-900/90',
];

function initials(name: string) {
  return (name || 'M')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase())
    .join('');
}

const ParticipantTile: React.FC<{
  stream: MediaStream | null;
  label: string;
  avatarUrl?: string | null;
  videoMuted?: boolean;
  isMicMuted?: boolean;
  showVideo?: boolean;
  speakerOn?: boolean;
  index: number;
  local?: boolean;
}> = ({ stream, label, avatarUrl, videoMuted, isMicMuted, showVideo, speakerOn, index, local }) => {
  const ref = useRef<HTMLVideoElement>(null);
  const hasVideo = Boolean(stream && showVideo);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.srcObject = stream;
    ref.current.volume = speakerOn ? 1 : 0;
  }, [stream, speakerOn]);

  return (
    <div className="relative flex min-h-[200px] flex-1 flex-col items-center justify-center overflow-hidden rounded-2xl bg-neutral-900/90 shadow-2xl border border-white/10">
      {hasVideo ? (
        <>
          <video
            ref={ref}
            autoPlay
            playsInline
            muted={videoMuted}
            className="h-full min-h-[200px] w-full object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3.5 pb-3 pt-8 text-white">
            <div className="flex items-center gap-2">
              <span className="truncate text-xs sm:text-sm font-semibold drop-shadow">
                {local ? 'You' : label}
              </span>
              {isMicMuted && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white shadow ring-1 ring-black/40">
                  <MicOff className="h-3 w-3" />
                </span>
              )}
            </div>
            <span className="rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white/90 backdrop-blur-sm border border-white/10">
              Camera
            </span>
          </div>
        </>
      ) : (
        <>
          {/* Background image - Clear (no blur), dimmed with dark gradient */}
          {avatarUrl ? (
            <div className="absolute inset-0 overflow-hidden">
              <img
                src={avatarUrl}
                alt=""
                className="h-full w-full object-cover brightness-[0.55] select-none"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/20 to-black/85" />
            </div>
          ) : (
            <div className={'absolute inset-0 bg-gradient-to-br ' + TILE_COLORS[index % TILE_COLORS.length]} />
          )}

          {/* Center Identity */}
          <div className="relative z-10 flex flex-col items-center justify-center p-4 text-center select-none">
            <div className="relative">
              <div className="flex h-20 w-20 sm:h-24 sm:w-24 items-center justify-center overflow-hidden rounded-full bg-white/15 text-2xl sm:text-3xl font-bold text-white ring-4 ring-white/30 shadow-2xl backdrop-blur-sm">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={label} className="h-full w-full object-cover" />
                ) : (
                  initials(label)
                )}
              </div>
              {isMicMuted && (
                <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white shadow-lg ring-2 ring-black/70 animate-in fade-in zoom-in-75">
                  <MicOff className="h-3.5 w-3.5" />
                </span>
              )}
            </div>

            <div className="mt-3 flex flex-col items-center">
              <p className="max-w-[180px] truncate text-sm sm:text-base font-bold text-white drop-shadow-md">
                {local ? 'You' : label}
              </p>
              <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-0.5 text-[11px] font-medium text-white/90 backdrop-blur-sm border border-white/10 shadow-sm">
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

/* Circular Messenger-style Call Button */
const RoundCallButton: React.FC<{
  label: string;
  onClick: () => void;
  variant?: 'normal' | 'active' | 'danger' | 'highlight';
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ label, onClick, variant = 'normal', disabled, children }) => {
  let styleClasses = 'bg-white/20 hover:bg-white/30 text-white backdrop-blur-md border border-white/15';
  if (variant === 'active') {
    styleClasses = 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/40 border border-blue-400/40';
  } else if (variant === 'danger') {
    styleClasses = 'bg-red-600 hover:bg-red-700 text-white shadow-xl shadow-red-600/50 border border-red-500/40';
  } else if (variant === 'highlight') {
    styleClasses = 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/40 border border-emerald-400/40';
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className={`flex h-13 w-13 sm:h-14 sm:w-14 items-center justify-center rounded-full transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 ${styleClasses}`}
      >
        {children}
      </button>
      <span className="text-[11px] font-medium text-white/80 select-none text-center drop-shadow">
        {label}
      </span>
    </div>
  );
};

export const GroupCallPanel = forwardRef<GroupCallPanelHandle, GroupCallPanelProps>(
  ({ groupId, groupName, groupAvatarUrl, members }, ref) => {
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
    const [minimized, setMinimized] = useState(false);

    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
    const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
    const [remoteLabels, setRemoteLabels] = useState<Map<string, string>>(new Map());
    const [remoteAvatars, setRemoteAvatars] = useState<Map<string, string | null>>(new Map());
    const [remoteMuted, setRemoteMuted] = useState<Map<string, boolean>>(new Map());

    const [muted, setMuted] = useState(false);
    const [cameraOff, setCameraOff] = useState(false);
    const [speakerOn, setSpeakerOn] = useState(true);
    const [screenSharing, setScreenSharing] = useState(false);
    const [startedAt, setStartedAt] = useState<number | null>(null);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);

    const memberFor = useCallback(
      (userId: string) => members.find(member => member.user_id === userId)?.profile,
      [members],
    );

    const send = useCallback((signal: Signal) => {
      void channelRef.current?.send({ type: 'broadcast', event: 'signal', payload: signal });
    }, []);

    const waitForChannel = useCallback(async () => {
      if (channelReadyRef.current) return;
      for (let attempt = 0; attempt < 15 && !channelReadyRef.current; attempt += 1) {
        await new Promise(resolve => window.setTimeout(resolve, 100));
      }
      if (!channelReadyRef.current && channelRef.current) {
        try {
          await channelRef.current.subscribe();
          channelReadyRef.current = true;
        } catch {
          // Proceed
        }
      }
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
      setRemoteMuted(current => {
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
          if (active && signal.callId === activeCallRef.current) {
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

        if (signal.type === 'mute' && signal.from) {
          setRemoteMuted(current => new Map(current).set(signal.from, !!signal.isMuted));
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

    // Push notifications for incoming and ongoing group calls
    useEffect(() => {
      if (!active) {
        dismissPhoneNotification(`group_call_${groupId}`);
        return;
      }
      notifyPhone({
        title: `${groupName || 'Group'} · ${kind === 'video' ? 'Video' : 'Audio'} Call 📞`,
        body: `Group call active · Tap to return`,
        tag: `group_call_${groupId}`,
        isCall: true,
        isOngoing: true,
        url: `/group/${groupId}`,
      });
      return () => {
        dismissPhoneNotification(`group_call_${groupId}`);
      };
    }, [active, groupId, groupName, kind]);

    useEffect(() => {
      if (!incoming) return;
      const caller = memberFor(incoming.from);
      const callerName = caller?.username || caller?.full_name || 'Someone';
      notifyPhone({
        title: `Incoming Group Call 📞`,
        body: `${groupName || 'Group'} — ${callerName} started a call`,
        tag: `group_call_${groupId}`,
        isCall: true,
        isOngoing: false,
        url: `/group/${groupId}`,
      });
    }, [incoming, groupId, groupName, memberFor]);

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
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: requestedKind === 'video',
        });
        localStreamRef.current = stream;
        setLocalStream(stream);
        return stream;
      } catch (err) {
        if (requestedKind === 'video') {
          console.warn('Camera failed, falling back to audio only:', err);
          toast.info('Camera unavailable, starting audio-only call');
          const audioStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false,
          });
          localStreamRef.current = audioStream;
          setLocalStream(audioStream);
          return audioStream;
        }
        throw err;
      }
    };

    const start = async (requestedKind: CallKind) => {
      if (!user) return;
      if (active) {
        setMinimized(false);
        return;
      }
      try {
        await waitForChannel();
        const callInfo = await startOrJoinGroupCall(groupId, requestedKind);
        const finalKind = callInfo.kind || requestedKind;

        await getMedia(finalKind);
        await joinGroupCall(callInfo.id);

        const callStarted = Date.now();
        activeCallRef.current = callInfo.id;
        starterRef.current = callInfo.isNew;
        setCallId(callInfo.id);
        setKind(finalKind);
        setStartedAt(callStarted);
        setActive(true);
        setMinimized(false);

        const callerName = profile?.username || profile?.full_name || 'Someone';
        const callerAvatar = profile?.avatar_url || null;

        if (callInfo.isNew) {
          send({ type: 'invite', callId: callInfo.id, from: user.id, kind: finalKind, startedAt: callStarted });
          const otherMemberIds = members.map(m => m.user_id).filter(uid => uid && uid !== user.id);
          void Promise.allSettled(
            otherMemberIds.map(async uid => {
              try {
                const memberCallChannel = supabase.channel(`calls:${uid}`);
                await memberCallChannel.subscribe();
                await memberCallChannel.send({
                  type: 'broadcast',
                  event: 'group-call-invite',
                  payload: {
                    groupId,
                    groupName: groupName || 'Group',
                    groupAvatarUrl: groupAvatarUrl || null,
                    callId: callInfo.id,
                    kind: finalKind,
                    from: user.id,
                    fromName: callerName,
                    fromAvatar: callerAvatar,
                  },
                });
                setTimeout(() => memberCallChannel.unsubscribe(), 3000);
              } catch {
                /* optional */
              }

              void sendPushTo(
                uid,
                `📞 ${groupName || 'Group'} · Incoming ${finalKind === 'video' ? 'Video' : 'Audio'} Call`,
                `${callerName} is calling the group · Tap to join`,
                `/group/${groupId}?autoJoin=1&kind=${finalKind}`,
                `group_call_${callInfo.id}`,
                groupAvatarUrl || callerAvatar || '/images/logo/logo-icon.svg',
              );

              return createNotification(
                uid,
                'group_call',
                user.id,
                groupId,
                undefined,
                `📞 Group ${finalKind} call started in ${groupName || 'Group'} by ${callerName}`,
              );
            }),
          );
        } else {
          send({ type: 'join', callId: callInfo.id, from: user.id, kind: finalKind });
        }
      } catch (error: any) {
        console.error('Call start error:', error);
        toast.error(error instanceof Error ? error.message : 'Call start nahi hui');
        throw error;
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
        setMinimized(false);
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
        } catch {
          /* cleanup */
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
      setMinimized(false);
      setIncoming(null);
    };

    const toggleMute = () => {
      const next = !muted;
      localStreamRef.current?.getAudioTracks().forEach(track => {
        track.enabled = !next;
      });
      setMuted(next);
      if (activeCallRef.current && user) {
        send({
          type: 'mute',
          callId: activeCallRef.current,
          from: user.id,
          isMuted: next,
        });
      }
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

    /* Floating Incoming Call Banner (Messenger style) */
    if (incoming) {
      const caller = memberFor(incoming.from);
      return (
        <div className="fixed top-3 inset-x-3 z-[100] mx-auto max-w-md animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-3 rounded-2xl border border-white/20 bg-card/95 p-3 shadow-2xl backdrop-blur-md text-foreground">
            <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-primary/20 font-semibold text-primary shrink-0 ring-2 ring-primary/30">
              {caller?.avatar_url ? (
                <img src={caller.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                initials(caller?.username || caller?.full_name || 'Member')
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">
                {caller?.username || caller?.full_name || 'A member'}
              </p>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Incoming group {incoming.kind || 'audio'} call
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                size="sm"
                onClick={() => void accept()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-8 px-3 text-xs font-semibold shadow-sm"
              >
                Join
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIncoming(null)}
                className="rounded-xl h-8 px-2 text-xs text-muted-foreground hover:bg-muted"
              >
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      );
    }

    if (!active) return null;

    /* Minimized Floating Bubble */
    if (minimized) {
      return (
        <div
          onClick={() => setMinimized(false)}
          className="fixed bottom-24 right-4 z-[90] flex items-center gap-2.5 rounded-full bg-emerald-600/95 hover:bg-emerald-600 px-3.5 py-2 text-white shadow-2xl cursor-pointer backdrop-blur-md border border-white/20 transition-all active:scale-95 animate-in zoom-in-95"
        >
          {groupAvatarUrl ? (
            <img src={groupAvatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
          ) : (
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-[10px] font-bold">
              {initials(groupName || 'G')}
            </div>
          )}
          <span className="text-xs font-bold">{formatTime(elapsedSeconds)}</span>
          <Maximize2 className="h-3.5 w-3.5 opacity-80" />
        </div>
      );
    }

    const localPreview = screenStream || localStream;
    const isSingleAudio = participantCount === 1 && kind === 'audio';

    return (
      <div className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-[#0d0e12] text-white select-none">
        {/* TOP FLOATING OVERLAY (Seamlessly inside call view) */}
        <div className="absolute top-0 inset-x-0 z-30 flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),16px)] pb-8 bg-gradient-to-b from-black/85 via-black/40 to-transparent pointer-events-none">
          <button
            type="button"
            onClick={() => setMinimized(true)}
            className="pointer-events-auto rounded-full p-2.5 bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/10 text-white transition-colors"
            aria-label="Minimize call"
            title="Minimize call"
          >
            <ChevronDown className="h-5 w-5" />
          </button>

          <div className="pointer-events-auto flex items-center gap-2 px-3 py-1 rounded-full bg-black/35 backdrop-blur-md border border-white/10">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold text-white/90 drop-shadow truncate max-w-[160px] sm:max-w-xs">
              {groupName || 'Group Call'} · {formatTime(elapsedSeconds)}
            </span>
          </div>

          <span className="pointer-events-auto rounded-full bg-black/40 backdrop-blur-md px-3 py-1 text-[11px] font-medium text-white/90 border border-white/10">
            {kind === 'video' ? 'Video call' : 'Audio call'}
          </span>
        </div>

        {/* CENTER CONTENT */}
        {isSingleAudio ? (
          /* Single Participant / Waiting Screen: Full-Screen Background + Center Avatar (100% Messenger Style) */
          <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden w-full h-full select-none">
            {/* Full Screen Background Image (Clear, dimmed for contrast) */}
            {groupAvatarUrl || profile?.avatar_url ? (
              <img
                src={groupAvatarUrl || profile?.avatar_url || ''}
                alt=""
                className="absolute inset-0 h-full w-full object-cover brightness-[0.38] select-none"
              />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/25 to-black/85" />

            {/* Center Avatar & Live Pulse */}
            <div className="relative z-10 flex flex-col items-center justify-center px-6 text-center">
              <div className="relative flex items-center justify-center">
                {/* Breathing glow rings */}
                <div className="absolute h-36 w-36 sm:h-44 sm:w-44 rounded-full bg-emerald-500/15 animate-ping" />
                <div className="relative flex h-28 w-28 sm:h-36 sm:w-36 items-center justify-center overflow-hidden rounded-full bg-white/15 text-4xl sm:text-5xl font-bold text-white ring-4 ring-white/35 shadow-2xl backdrop-blur-md">
                  {groupAvatarUrl ? (
                    <img src={groupAvatarUrl} alt={groupName} className="h-full w-full object-cover" />
                  ) : profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    initials(groupName || 'G')
                  )}
                </div>
                {muted && (
                  <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-red-600 text-white shadow-lg ring-2 ring-black/70 animate-in fade-in zoom-in-75">
                    <MicOff className="h-4 w-4" />
                  </span>
                )}
              </div>

              {/* Group Name & Calling Status */}
              <h2 className="mt-5 max-w-sm truncate text-xl sm:text-2xl font-bold tracking-tight text-white drop-shadow-md">
                {groupName || 'Group Call'}
              </h2>
              <div className="mt-2.5 inline-flex items-center gap-2 rounded-full bg-black/50 border border-white/10 px-3.5 py-1 text-xs font-semibold backdrop-blur-md text-emerald-400 shadow-sm">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Calling group members...</span>
              </div>
              <p className="mt-2 text-xs text-white/70 drop-shadow">
                1 participant in call · Waiting for others to join
              </p>
            </div>
          </div>
        ) : (
          /* Multi-participant or Video Call Grid (Full Screen Edge-to-Edge) */
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-20 pb-28">
            <div className="grid h-full auto-rows-fr grid-cols-1 sm:grid-cols-2 gap-2.5">
              <ParticipantTile
                stream={localPreview}
                videoMuted={true}
                isMicMuted={muted}
                label={localLabel}
                avatarUrl={profile?.avatar_url || groupAvatarUrl}
                showVideo={kind === 'video' && !cameraOff}
                speakerOn={speakerOn}
                index={0}
                local
              />
              {Array.from(remoteStreams.entries()).map(([peerId, stream], index) => {
                const peerAvatar = remoteAvatars.get(peerId) || memberFor(peerId)?.avatar_url;
                const peerName =
                  remoteLabels.get(peerId) ||
                  memberFor(peerId)?.username ||
                  memberFor(peerId)?.full_name ||
                  'Participant';
                return (
                  <ParticipantTile
                    key={peerId}
                    stream={stream}
                    label={peerName}
                    avatarUrl={peerAvatar}
                    showVideo={kind === 'video'}
                    speakerOn={speakerOn}
                    videoMuted={!speakerOn}
                    isMicMuted={remoteMuted.get(peerId) || false}
                    index={index + 1}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* BOTTOM FLOATING CONTROLS (Inside call view, floating directly on background) */}
        <div className="absolute bottom-0 inset-x-0 z-30 flex items-center justify-center gap-4 sm:gap-7 px-4 pt-12 pb-[max(env(safe-area-inset-bottom),24px)] bg-gradient-to-t from-black/95 via-black/60 to-transparent pointer-events-none">
          {/* Mute Button */}
          <div className="pointer-events-auto">
            <RoundCallButton
              label={muted ? 'Unmute' : 'Mute'}
              onClick={toggleMute}
              variant={muted ? 'danger' : 'normal'}
            >
              {muted ? <MicOff className="h-6 w-6 text-white" /> : <Mic className="h-6 w-6 text-white" />}
            </RoundCallButton>
          </div>

          {/* Camera Button (Video Call) */}
          {kind === 'video' && (
            <div className="pointer-events-auto">
              <RoundCallButton
                label={cameraOff ? 'Turn on' : 'Camera'}
                onClick={toggleCamera}
                variant={cameraOff ? 'danger' : 'normal'}
              >
                {cameraOff ? <CameraOff className="h-6 w-6 text-white" /> : <Camera className="h-6 w-6 text-white" />}
              </RoundCallButton>
            </div>
          )}

          {/* Screen Share Button (Video Call) */}
          {kind === 'video' && (
            <div className="pointer-events-auto">
              <RoundCallButton
                label={screenSharing ? 'Stop' : 'Share'}
                onClick={() => void toggleScreenShare()}
                variant={screenSharing ? 'highlight' : 'normal'}
              >
                <Monitor className="h-6 w-6 text-white" />
              </RoundCallButton>
            </div>
          )}

          {/* Speaker Button */}
          <div className="pointer-events-auto">
            <RoundCallButton
              label={speakerOn ? 'Speaker' : 'Earpiece'}
              onClick={() => setSpeakerOn(value => !value)}
              variant={speakerOn ? 'active' : 'normal'}
            >
              {speakerOn ? <Volume2 className="h-6 w-6 text-white" /> : <VolumeX className="h-6 w-6 text-white" />}
            </RoundCallButton>
          </div>

          {/* End Call Button */}
          <div className="pointer-events-auto">
            <RoundCallButton
              label="End"
              onClick={() => void leave()}
              variant="danger"
            >
              <PhoneOff className="h-6 w-6 text-white" />
            </RoundCallButton>
          </div>
        </div>
      </div>
    );
  },
);

GroupCallPanel.displayName = 'GroupCallPanel';
export default GroupCallPanel;
