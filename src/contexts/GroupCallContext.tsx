import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
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
import { toast } from 'sonner';

export type CallKind = 'audio' | 'video';

export type Signal = {
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

export interface GroupCallContextValue {
  groupId: string | null;
  groupName: string;
  groupAvatarUrl?: string | null;
  members: GroupMember[];
  active: boolean;
  minimized: boolean;
  kind: CallKind;
  callId: string | null;
  startedAt: number | null;
  elapsedSeconds: number;
  localStream: MediaStream | null;
  screenStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  remoteLabels: Map<string, string>;
  remoteAvatars: Map<string, string | null>;
  remoteMuted: Map<string, boolean>;
  muted: boolean;
  cameraOff: boolean;
  speakerOn: boolean;
  screenSharing: boolean;
  incoming: Signal | null;
  startCall: (
    groupId: string,
    groupName: string,
    groupAvatarUrl?: string | null,
    members?: GroupMember[],
    requestedKind?: CallKind,
  ) => Promise<void>;
  joinCall: (
    groupId: string,
    groupName: string,
    groupAvatarUrl?: string | null,
    callId?: string,
    requestedKind?: CallKind,
    startedAtTime?: number,
  ) => Promise<void>;
  leaveCall: () => Promise<void>;
  toggleMute: () => void;
  toggleCamera: () => void;
  toggleSpeaker: () => void;
  toggleScreenShare: () => Promise<void>;
  setMinimized: (min: boolean) => void;
  toggleMinimize: () => void;
  dismissIncoming: () => void;
  acceptIncoming: () => Promise<void>;
}

const GroupCallContext = createContext<GroupCallContextValue | null>(null);

export const useGroupCall = () => {
  const ctx = useContext(GroupCallContext);
  if (!ctx) throw new Error('useGroupCall must be used inside GroupCallProvider');
  return ctx;
};

export const GroupCallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile } = useAuth();

  const [groupId, setGroupId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState<string>('Group Call');
  const [groupAvatarUrl, setGroupAvatarUrl] = useState<string | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);

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

  const channelRef = useRef<any>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const activeCallRef = useRef<string | null>(null);
  const channelReadyRef = useRef(false);

  const memberFor = useCallback(
    (userId: string) => members.find(m => m.user_id === userId)?.profile,
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
        /* proceed */
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

  // Set up channel whenever groupId changes or is set
  useEffect(() => {
    if (!groupId) return;
    const channel = supabase.channel(`group-call-signal-${groupId}`);
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

  // Elapsed timer
  useEffect(() => {
    if (!active || !startedAt) {
      setElapsedSeconds(0);
      return;
    }
    const update = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [active, startedAt]);

  // Live Phone Notification & Native Android Bridge
  useEffect(() => {
    if (!active || !groupId) {
      dismissPhoneNotification(`group_call_ongoing`);
      if (groupId) dismissPhoneNotification(`group_call_${groupId}`);
      const android = (window as unknown as { AndroidNotification?: { setCallActive?: (a: boolean, t: string) => void } }).AndroidNotification;
      android?.setCallActive?.(false, '');
      return;
    }

    const title = `${groupName || 'Group'} · ${kind === 'video' ? 'Video' : 'Audio'} Call 📞`;
    const mm = Math.floor(elapsedSeconds / 60).toString().padStart(2, '0');
    const ss = Math.floor(elapsedSeconds % 60).toString().padStart(2, '0');
    const body = `Calling group (${mm}:${ss}) · Tap to return`;

    notifyPhone({
      title,
      body,
      tag: `group_call_ongoing`,
      isCall: true,
      isOngoing: true,
      url: `/group/${groupId}`,
      icon: groupAvatarUrl || '/images/logo/logo-icon.svg',
    });

    const android = (window as unknown as { AndroidNotification?: { setCallActive?: (a: boolean, t: string) => void } }).AndroidNotification;
    android?.setCallActive?.(true, title);

    return () => {
      dismissPhoneNotification(`group_call_ongoing`);
      if (groupId) dismissPhoneNotification(`group_call_${groupId}`);
    };
  }, [active, groupId, groupName, groupAvatarUrl, kind, elapsedSeconds]);

  // Back button interception when call overlay is full-screen
  useEffect(() => {
    if (!active || minimized) return;

    window.history.pushState({ inGroupCall: true }, '');

    const handlePopState = () => {
      setMinimized(true);
    };

    const handleNativeBack = () => {
      setMinimized(true);
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('appCallBackPressed', handleNativeBack);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('appCallBackPressed', handleNativeBack);
    };
  }, [active, minimized]);

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

  const startCall = async (
    targetGroupId: string,
    targetGroupName: string,
    targetAvatarUrl?: string | null,
    targetMembers: GroupMember[] = [],
    requestedKind: CallKind = 'audio',
  ) => {
    if (!user) return;
    if (active) {
      setMinimized(false);
      return;
    }

    setGroupId(targetGroupId);
    setGroupName(targetGroupName);
    setGroupAvatarUrl(targetAvatarUrl || null);
    setMembers(targetMembers);

    try {
      await waitForChannel();
      const callInfo = await startOrJoinGroupCall(targetGroupId, requestedKind);
      const finalKind = callInfo.kind || requestedKind;

      await getMedia(finalKind);
      await joinGroupCall(callInfo.id);

      const callStarted = Date.now();
      activeCallRef.current = callInfo.id;
      setCallId(callInfo.id);
      setKind(finalKind);
      setStartedAt(callStarted);
      setActive(true);
      setMinimized(false);

      const callerName = profile?.username || profile?.full_name || 'Someone';
      const callerAvatar = profile?.avatar_url || null;

      if (callInfo.isNew) {
        send({ type: 'invite', callId: callInfo.id, from: user.id, kind: finalKind, startedAt: callStarted });
        const otherMemberIds = targetMembers.map(m => m.user_id).filter(uid => uid && uid !== user.id);
        void Promise.allSettled(
          otherMemberIds.map(async uid => {
            try {
              const memberCallChannel = supabase.channel(`calls:${uid}`);
              await memberCallChannel.subscribe();
              await memberCallChannel.send({
                type: 'broadcast',
                event: 'group-call-invite',
                payload: {
                  groupId: targetGroupId,
                  groupName: targetGroupName || 'Group',
                  groupAvatarUrl: targetAvatarUrl || null,
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
              `📞 ${targetGroupName || 'Group'} · Incoming ${finalKind === 'video' ? 'Video' : 'Audio'} Call`,
              `${callerName} is calling the group · Tap to join`,
              `/group/${targetGroupId}?autoJoin=1&kind=${finalKind}`,
              `group_call_${callInfo.id}`,
              targetAvatarUrl || callerAvatar || '/images/logo/logo-icon.svg',
            );
            return createNotification(
              uid,
              'group_call',
              user.id,
              targetGroupId,
              undefined,
              `📞 Group ${finalKind} call started in ${targetGroupName || 'Group'} by ${callerName}`,
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

  const joinCall = async (
    targetGroupId: string,
    targetGroupName: string,
    targetAvatarUrl?: string | null,
    targetCallId?: string,
    requestedKind: CallKind = 'audio',
    startedAtTime?: number,
  ) => {
    if (!user) return;
    setGroupId(targetGroupId);
    setGroupName(targetGroupName);
    setGroupAvatarUrl(targetAvatarUrl || null);

    try {
      await waitForChannel();
      await getMedia(requestedKind);

      let targetId = targetCallId;
      if (!targetId) {
        const activeCall = await getActiveGroupCall(targetGroupId);
        if (activeCall) targetId = activeCall.id;
      }

      if (targetId) {
        await joinGroupCall(targetId);
        activeCallRef.current = targetId;
        setCallId(targetId);
      }

      setKind(requestedKind);
      setStartedAt(startedAtTime || Date.now());
      setActive(true);
      setMinimized(false);
      setIncoming(null);

      if (targetId) {
        send({ type: 'join', callId: targetId, from: user.id, kind: requestedKind });
      }
    } catch (error) {
      console.error('Join call error:', error);
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

  const leaveCall = async () => {
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

    setRemoteStreams(new Map());
    setRemoteLabels(new Map());
    setRemoteAvatars(new Map());
    setRemoteMuted(new Map());
    setScreenStream(null);
    setLocalStream(null);
    setCallId(null);
    setStartedAt(null);
    setElapsedSeconds(0);
    setScreenSharing(false);
    setActive(false);
    setMinimized(false);
    setIncoming(null);

    dismissPhoneNotification('group_call_ongoing');
    if (groupId) dismissPhoneNotification(`group_call_${groupId}`);
    const android = (window as unknown as { AndroidNotification?: { setCallActive?: (a: boolean, t: string) => void } }).AndroidNotification;
    android?.setCallActive?.(false, '');
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

  const toggleSpeaker = () => setSpeakerOn(v => !v);
  const toggleMinimize = () => setMinimized(m => !m);
  const dismissIncoming = () => setIncoming(null);

  const acceptIncoming = async () => {
    if (!incoming || !groupId) return;
    await joinCall(groupId, groupName, groupAvatarUrl, incoming.callId, incoming.kind || 'audio', incoming.startedAt);
  };

  return (
    <GroupCallContext.Provider
      value={{
        groupId,
        groupName,
        groupAvatarUrl,
        members,
        active,
        minimized,
        kind,
        callId,
        startedAt,
        elapsedSeconds,
        localStream,
        screenStream,
        remoteStreams,
        remoteLabels,
        remoteAvatars,
        remoteMuted,
        muted,
        cameraOff,
        speakerOn,
        screenSharing,
        incoming,
        startCall,
        joinCall,
        leaveCall,
        toggleMute,
        toggleCamera,
        toggleSpeaker,
        toggleScreenShare,
        setMinimized,
        toggleMinimize,
        dismissIncoming,
        acceptIncoming,
      }}
    >
      {children}
    </GroupCallContext.Provider>
  );
};
