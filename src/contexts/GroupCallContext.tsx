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
  sendGroupMessage,
} from '@/services/groups';
import { createNotification, sendPushTo } from '@/services/api';
import { notifyPhone, dismissPhoneNotification } from '@/lib/notifyPhone';
import type { GroupMember } from '@/types/groups';
import { toast } from 'sonner';

export type CallKind = 'audio' | 'video';

export type Signal = {
  type: 'invite' | 'join' | 'offer' | 'answer' | 'ice' | 'leave' | 'mute' | 'camera';
  callId: string;
  from: string;
  to?: string;
  kind?: CallKind;
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  startedAt?: number;
  isMuted?: boolean;
  cameraOff?: boolean;
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
  remoteCameraOff: Map<string, boolean>;
  muted: boolean;
  cameraOff: boolean;
  facingFront: boolean;
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
  toggleCamera: () => Promise<void>;
  flipCamera: () => Promise<void>;
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
  const leaveCallRef = useRef<(() => Promise<void>) | null>(null);

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
  const [remoteCameraOff, setRemoteCameraOff] = useState<Map<string, boolean>>(new Map());

  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [facingFront, setFacingFront] = useState(true);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);

  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const channelRef = useRef<any>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const activeCallRef = useRef<string | null>(null);
  const channelReadyRef = useRef<boolean>(false);

  const send = useCallback((signal: Signal) => {
    if (!channelRef.current || !channelReadyRef.current) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'signal',
      payload: signal,
    });
  }, []);

  const memberFor = useCallback(
    (uid: string) => members.find(m => m.user_id === uid)?.profile || null,
    [members],
  );

  const closePeer = useCallback((peerId: string) => {
    const pc = peersRef.current.get(peerId);
    if (pc) {
      pc.close();
      peersRef.current.delete(peerId);
    }
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
    setRemoteCameraOff(current => {
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

      const person = memberFor(peerId);
      if (person) {
        setRemoteLabels(current => new Map(current).set(peerId, person.username || person.full_name || 'Participant'));
        setRemoteAvatars(current => new Map(current).set(peerId, person.avatar_url || null));
      } else {
        supabase.from('profiles').select('username, full_name, avatar_url').eq('id', peerId).maybeSingle().then(({ data }) => {
          if (data) {
            setRemoteLabels(current => new Map(current).set(peerId, data.username || data.full_name || 'Participant'));
            setRemoteAvatars(current => new Map(current).set(peerId, data.avatar_url || null));
          }
        }).catch(() => {});
      }

      // Add local audio and video tracks to peer connection
      localStreamRef.current?.getTracks().forEach(track => {
        try { pc.addTrack(track, localStreamRef.current as MediaStream); } catch {}
      });

      // ALWAYS ensure both audio and video transceivers exist so camera can be turned on/off dynamically
      try {
        if (!pc.getTransceivers().some(t => t.receiver.track?.kind === 'video')) {
          pc.addTransceiver('video', { direction: 'sendrecv' });
        }
      } catch (err) {
        console.warn('addTransceiver error:', err);
      }

      pc.onicecandidate = event => {
        if (event.candidate) {
          send({ type: 'ice', callId: activeId, from: user.id, to: peerId, candidate: event.candidate.toJSON() });
        }
      };

      pc.ontrack = event => {
        const track = event.track;
        const stream = event.streams[0] || new MediaStream([track]);
        const matchedPerson = memberFor(peerId);

        setRemoteStreams(current => {
          const existing = current.get(peerId);
          if (existing) {
            if (!existing.getTracks().some(t => t.id === track.id)) {
              existing.addTrack(track);
            }
            return new Map(current).set(peerId, new MediaStream(existing.getTracks()));
          }
          return new Map(current).set(peerId, stream);
        });

        setRemoteLabels(current => new Map(current).set(peerId, matchedPerson?.username || matchedPerson?.full_name || 'Participant'));
        setRemoteAvatars(current => new Map(current).set(peerId, matchedPerson?.avatar_url || null));

        if (track.kind === 'video') {
          setRemoteCameraOff(c => new Map(c).set(peerId, false));
          setKind('video');
          track.onunmute = () => {
            setRemoteCameraOff(c => new Map(c).set(peerId, false));
          };
          track.onended = () => {
            setRemoteCameraOff(c => new Map(c).set(peerId, true));
          };
        }
      };

      pc.onconnectionstatechange = () => {
        if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) closePeer(peerId);
      };

      if (isInitiator) {
        // ALWAYS offerToReceiveVideo: true so video can start dynamically
        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
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
        if (active) return;
        setIncoming(signal);
        setCallId(signal.callId);
        setKind(signal.kind || 'audio');
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

        try {
          if (!pc.getTransceivers().some(t => t.receiver.track?.kind === 'video')) {
            pc.addTransceiver('video', { direction: 'sendrecv' });
          }
        } catch {}

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

      if (signal.type === 'camera' && signal.from) {
        setRemoteCameraOff(current => new Map(current).set(signal.from, !!signal.cameraOff));
        if (!signal.cameraOff) {
          setKind('video');
        }
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
  }, [active, groupId, groupName, groupAvatarUrl, kind, elapsedSeconds]);

  // "End call" tapped on the phone's ongoing-call notification
  useEffect(() => {
    if (!active) return;
    const onEndRequested = () => {
      void leaveCallRef.current?.();
    };
    window.addEventListener('appEndCallRequested', onEndRequested);
    return () => window.removeEventListener('appEndCallRequested', onEndRequested);
  }, [active]);

  // Native / Android back button: Minimize instead of killing the call
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
        video: requestedKind === 'video' ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } : false,
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
      toast.info('Already in a call');
      return;
    }

    try {
      setGroupId(targetGroupId);
      setGroupName(targetGroupName);
      setGroupAvatarUrl(targetAvatarUrl || null);
      setMembers(targetMembers);
      setKind(requestedKind);
      setCameraOff(requestedKind !== 'video');

      await getMedia(requestedKind);

      const dbCall = await startOrJoinGroupCall(targetGroupId, requestedKind);
      const newCallId = dbCall.id;
      setCallId(newCallId);
      activeCallRef.current = newCallId;
      setActive(true);
      setMinimized(false);

      const now = Date.now();
      setStartedAt(now);

      const callerName = profile?.full_name || profile?.username || 'Group Member';
      const callerAvatar = profile?.avatar_url || null;

      const otherMembers = targetMembers.filter(m => m.user_id !== user.id);
      otherMembers.forEach(m => {
        sendPushTo(m.user_id, {
          title: `${targetGroupName || 'Group'} 📞`,
          body: `${callerName} started a group ${requestedKind} call`,
          url: `/group/${targetGroupId}`,
          icon: targetAvatarUrl || '/images/logo/logo-icon.svg',
          tag: `group_call_${targetGroupId}`,
          isCall: true,
          channelId: 'calls',
          senderName: callerName,
          senderAvatar: callerAvatar,
          callType: requestedKind,
          groupId: targetGroupId,
          groupName: targetGroupName,
          callId: newCallId,
        }).catch(() => {});

        createNotification({
          user_id: m.user_id,
          type: 'call',
          title: `Group ${requestedKind} call`,
          content: `${callerName} started a group call in ${targetGroupName}`,
          reference_id: targetGroupId,
        }).catch(() => {});
      });

      sendGroupMessage(
        targetGroupId,
        `📞 Started a group ${requestedKind} call. Tap to join!`,
      ).catch(() => {});

      send({
        type: 'invite',
        callId: newCallId,
        from: user.id,
        kind: requestedKind,
        startedAt: now,
      });

      toast.success(`Group ${requestedKind} call started`);
    } catch (err: any) {
      cleanupMedia();
      toast.error(err?.message || 'Could not start group call');
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
    try {
      setGroupId(targetGroupId);
      setGroupName(targetGroupName);
      setGroupAvatarUrl(targetAvatarUrl || null);
      setKind(requestedKind);
      setCameraOff(requestedKind !== 'video');

      await getMedia(requestedKind);

      let effectiveCallId = targetCallId;
      if (!effectiveCallId) {
        const activeDb = await getActiveGroupCall(targetGroupId);
        if (activeDb) effectiveCallId = activeDb.id;
      }

      if (effectiveCallId) {
        await joinGroupCall(effectiveCallId);
        setCallId(effectiveCallId);
        activeCallRef.current = effectiveCallId;
      }

      setActive(true);
      setMinimized(false);
      setIncoming(null);

      const startTime = startedAtTime || Date.now();
      setStartedAt(startTime);

      send({
        type: 'join',
        callId: effectiveCallId || 'active',
        from: user.id,
        kind: requestedKind,
      });

      toast.success('Joined group call');
    } catch (err: any) {
      cleanupMedia();
      toast.error(err?.message || 'Could not join call');
    }
  };

  const cleanupMedia = () => {
    localStreamRef.current?.getTracks().forEach(t => {
      try { t.stop(); } catch {}
    });
    screenStreamRef.current?.getTracks().forEach(t => {
      try { t.stop(); } catch {}
    });
    localStreamRef.current = null;
    screenStreamRef.current = null;
    setLocalStream(null);
    setScreenStream(null);

    peersRef.current.forEach(pc => pc.close());
    peersRef.current.clear();

    setRemoteStreams(new Map());
    setRemoteLabels(new Map());
    setRemoteAvatars(new Map());
    setRemoteMuted(new Map());
    setRemoteCameraOff(new Map());
    setActive(false);
    setMinimized(false);
    setCallId(null);
    activeCallRef.current = null;
    setStartedAt(null);
    setElapsedSeconds(0);
    setScreenSharing(false);
    setCameraOff(false);
    setMuted(false);
  };

  const leaveCall = async () => {
    if (groupId) {
      dismissPhoneNotification(`group_call_${groupId}`);
    }
    dismissPhoneNotification(`group_call_ongoing`);

    if (activeCallRef.current && user) {
      send({
        type: 'leave',
        callId: activeCallRef.current,
        from: user.id,
      });
      try {
        await leaveGroupCall(activeCallRef.current);
      } catch (e) {
        console.warn('leaveGroupCall failed:', e);
      }
    }
    cleanupMedia();
  };

  leaveCallRef.current = leaveCall;

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

  // Turn Camera ON/OFF dynamically during audio or video call
  const toggleCamera = async () => {
    try {
      let currentStream = localStreamRef.current;
      const liveVideoTrack = currentStream?.getVideoTracks().find(
        t => (t.readyState === 'live' || (t.readyState as string) === 'active') && t.enabled !== false
      );

      if (cameraOff || !liveVideoTrack) {
        // === TURN CAMERA ON ===
        let videoStream: MediaStream | null = null;
        if (navigator.mediaDevices?.getUserMedia) {
          try {
            videoStream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: facingFront ? 'user' : 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
              audio: false,
            });
          } catch {
            try {
              videoStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            } catch (err: any) {
              console.warn('Camera getUserMedia failed:', err);
              toast.error('Camera access denied or camera is in use');
              return;
            }
          }
        }

        const newTrack = videoStream?.getVideoTracks()[0];
        if (newTrack) {
          if (!currentStream) {
            currentStream = new MediaStream();
          }
          // Remove old stopped video tracks
          currentStream.getVideoTracks().forEach(t => {
            try { t.stop(); } catch {}
            currentStream?.removeTrack(t);
          });
          currentStream.addTrack(newTrack);

          // Update peers
          peersRef.current.forEach(peer => {
            const senders = peer.getSenders();
            const vSender = senders.find(s => s.track?.kind === 'video' || (!s.track && s.dtlsTransport));
            if (vSender) {
              vSender.replaceTrack(newTrack).catch(() => {});
            } else {
              try { peer.addTrack(newTrack, currentStream!); } catch {}
            }
          });

          localStreamRef.current = currentStream;
          setLocalStream(new MediaStream(currentStream.getTracks()));
          setCameraOff(false);
          setKind('video');

          if (activeCallRef.current && user) {
            send({
              type: 'camera',
              callId: activeCallRef.current,
              from: user.id,
              cameraOff: false,
            });
          }

          toast.success('Camera on');
        }
      } else {
        // === TURN CAMERA OFF ===
        const tracks = currentStream?.getVideoTracks() || [];
        tracks.forEach(t => {
          t.enabled = false;
          try { t.stop(); } catch {}
          currentStream?.removeTrack(t);
        });

        peersRef.current.forEach(peer => {
          const senders = peer.getSenders();
          const vSender = senders.find(s => s.track?.kind === 'video');
          if (vSender) {
            vSender.replaceTrack(null).catch(() => {});
          }
        });

        if (currentStream) {
          localStreamRef.current = currentStream;
          setLocalStream(new MediaStream(currentStream.getTracks()));
        }

        setCameraOff(true);

        if (activeCallRef.current && user) {
          send({
            type: 'camera',
            callId: activeCallRef.current,
            from: user.id,
            cameraOff: true,
          });
        }

        toast.info('Camera off');
      }
    } catch (err: any) {
      console.warn('Camera toggle error:', err);
      toast.error(err?.message || 'Camera permission denied or unavailable');
    }
  };

  // Flip between front and back cameras
  const flipCamera = async () => {
    if (cameraOff || !localStreamRef.current) {
      toast.info('Turn on camera first to flip');
      return;
    }
    const nextFacing = !facingFront;
    setFacingFront(nextFacing);
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: nextFacing ? 'user' : 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      const newTrack = fresh.getVideoTracks()[0];
      if (!newTrack) return;

      const currentStream = localStreamRef.current;
      currentStream.getVideoTracks().forEach(t => {
        try { t.stop(); } catch {}
        currentStream.removeTrack(t);
      });
      currentStream.addTrack(newTrack);

      peersRef.current.forEach(peer => {
        const senders = peer.getSenders();
        const vSender = senders.find(s => s.track?.kind === 'video');
        if (vSender) {
          vSender.replaceTrack(newTrack).catch(() => {});
        }
      });

      localStreamRef.current = currentStream;
      setLocalStream(new MediaStream(currentStream.getTracks()));
      toast.success(nextFacing ? 'Front camera' : 'Back camera');
    } catch (err) {
      console.warn('Flip camera error:', err);
      toast.error('Could not switch camera');
    }
  };

  const toggleSpeaker = () => setSpeakerOn(v => !v);
  const toggleMinimize = () => setMinimized(m => !m);
  const dismissIncoming = () => setIncoming(null);

  const acceptIncoming = async () => {
    if (!incoming || !groupId) return;
    await joinCall(groupId, groupName, groupAvatarUrl, incoming.callId, incoming.kind || 'audio', incoming.startedAt);
  };

  const acceptIncomingRef = useRef<(() => Promise<void>) | null>(null);
  acceptIncomingRef.current = acceptIncoming;
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onAction = (event: Event) => {
      const detail = (event as CustomEvent<{ action?: string; groupId?: string }>).detail || {};
      if (detail.action === 'join') {
        void acceptIncomingRef.current?.();
      } else if (detail.action === 'decline') {
        setIncoming(null);
      }
    };
    window.addEventListener('appCallActionFromNotification', onAction);
    return () => window.removeEventListener('appCallActionFromNotification', onAction);
  }, []);

  const toggleScreenShare = async () => {
    if (!screenSharing) {
      try {
        if (!navigator.mediaDevices?.getDisplayMedia) {
          toast.error('Screen sharing is not supported on this device/browser');
          return;
        }
        const sStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = sStream;
        setScreenStream(sStream);
        setScreenSharing(true);

        const screenTrack = sStream.getVideoTracks()[0];
        if (screenTrack) {
          peersRef.current.forEach(peer => {
            const senders = peer.getSenders();
            const vSender = senders.find(s => s.track?.kind === 'video');
            if (vSender) vSender.replaceTrack(screenTrack);
            else peer.addTrack(screenTrack, sStream);
          });
          screenTrack.onended = () => {
            void toggleScreenShare();
          };
        }
        toast.success('Screen sharing started');
      } catch (err: any) {
        if (err?.name !== 'NotAllowedError') {
          console.warn('Screen share error:', err);
          toast.error('Could not share screen');
        }
      }
    } else {
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
      setScreenStream(null);
      setScreenSharing(false);

      const localCamTrack = localStreamRef.current?.getVideoTracks().find(t => t.readyState === 'live');
      peersRef.current.forEach(peer => {
        const senders = peer.getSenders();
        const vSender = senders.find(s => s.track?.kind === 'video');
        if (vSender) {
          vSender.replaceTrack(cameraOff ? null : (localCamTrack || null));
        }
      });
      toast.info('Screen sharing stopped');
    }
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
        remoteCameraOff,
        muted,
        cameraOff,
        facingFront,
        speakerOn,
        screenSharing,
        incoming,
        startCall,
        joinCall,
        leaveCall,
        toggleMute,
        toggleCamera,
        flipCamera,
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

export default GroupCallContext;
