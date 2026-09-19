import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Mic, MicOff, Monitor, Phone, PhoneOff, Users, Video, VideoOff, Volume2, VolumeX, X } from 'lucide-react';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { createGroupCall, endGroupCall, joinGroupCall, leaveGroupCall } from '@/services/groups';
import type { GroupMember } from '@/types/groups';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

type CallKind = 'audio' | 'video';
type Signal = { type: 'invite' | 'join' | 'offer' | 'answer' | 'ice' | 'leave'; callId: string; from: string; to?: string; kind?: CallKind; startedAt?: number; offer?: RTCSessionDescriptionInit; answer?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };

type GroupCallPanelProps = {
  groupId: string;
  groupName?: string;
  members: GroupMember[];
};

const TILE_COLORS = ['from-slate-800 via-slate-700 to-slate-900', 'from-rose-900 via-red-800 to-orange-900', 'from-violet-900 via-fuchsia-800 to-pink-900', 'from-emerald-900 via-teal-800 to-cyan-900', 'from-amber-900 via-yellow-800 to-orange-900', 'from-blue-900 via-indigo-800 to-violet-900'];

const initials = (name: string) => name.trim().slice(0, 1).toUpperCase() || '?';

const ParticipantTile: React.FC<{ stream: MediaStream | null; label: string; avatarUrl?: string | null; muted?: boolean; showVideo: boolean; speakerOn: boolean; index: number; local?: boolean }> = ({ stream, label, avatarUrl, muted, showVideo, speakerOn, index, local }) => {
  const ref = useRef<HTMLVideoElement>(null);
  const hasVideo = Boolean(stream && showVideo);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.srcObject = stream;
    ref.current.volume = speakerOn ? 1 : 0;
  }, [stream, speakerOn]);
  return <div className={'relative min-h-[190px] overflow-hidden rounded-2xl bg-gradient-to-br ' + TILE_COLORS[index % TILE_COLORS.length]}>
    {hasVideo ? <video ref={ref} autoPlay playsInline muted={muted} className="h-full min-h-[190px] w-full object-cover" /> : <div className="flex h-full min-h-[190px] items-center justify-center"><div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-white/20 text-3xl font-semibold text-white ring-2 ring-white/25">{avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : initials(label)}</div></div>}
    <div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/75 to-transparent px-3 pb-3 pt-10 text-white"><span className="truncate text-sm font-medium">{local ? 'You' : label}</span>{local && <span className="rounded-full bg-black/35 px-2 py-0.5 text-[10px]">{showVideo ? 'Camera' : 'Audio'}</span>}</div>
  </div>;
};

const Control: React.FC<{ label: string; onClick: () => void; active?: boolean; danger?: boolean; disabled?: boolean; children: React.ReactNode }> = ({ label, onClick, active, danger, disabled, children }) => <button type="button" onClick={onClick} disabled={disabled} aria-label={label} className={'flex min-w-[52px] flex-col items-center gap-1 rounded-xl px-2 py-2 text-white transition disabled:cursor-not-allowed disabled:opacity-35 ' + (danger ? 'bg-red-600 hover:bg-red-500' : active ? 'bg-white text-black' : 'bg-white/12 hover:bg-white/20')}><span>{children}</span><span className="text-[10px] font-medium">{label}</span></button>;

export const GroupCallPanel: React.FC<GroupCallPanelProps> = ({ groupId, groupName, members }) => {
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
  const send = useCallback((signal: Signal) => { void channelRef.current?.send({ type: 'broadcast', event: 'signal', payload: signal }); }, []);
  const waitForChannel = useCallback(async () => {
    for (let attempt = 0; attempt < 30 && !channelReadyRef.current; attempt += 1) await new Promise(resolve => window.setTimeout(resolve, 100));
    if (!channelReadyRef.current) throw new Error('Call connection is still starting. Please try again.');
  }, []);

  const closePeer = useCallback((peerId: string) => {
    peersRef.current.get(peerId)?.close();
    peersRef.current.delete(peerId);
    setRemoteStreams(current => { const next = new Map(current); next.delete(peerId); return next; });
    setRemoteLabels(current => { const next = new Map(current); next.delete(peerId); return next; });
    setRemoteAvatars(current => { const next = new Map(current); next.delete(peerId); return next; });
  }, []);

  const createPeer = useCallback(async (peerId: string, isInitiator: boolean, activeId: string, activeKind: CallKind) => {
    if (!user || peersRef.current.has(peerId)) return;
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] });
    peersRef.current.set(peerId, pc);
    localStreamRef.current?.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current as MediaStream));
    pc.onicecandidate = event => { if (event.candidate) send({ type: 'ice', callId: activeId, from: user.id, to: peerId, candidate: event.candidate.toJSON() }); };
    pc.ontrack = event => {
      const stream = event.streams[0];
      if (!stream) return;
      const person = memberFor(peerId);
      setRemoteStreams(current => new Map(current).set(peerId, stream));
      setRemoteLabels(current => new Map(current).set(peerId, person?.username || person?.full_name || 'Participant'));
      setRemoteAvatars(current => new Map(current).set(peerId, person?.avatar_url || null));
    };
    pc.onconnectionstatechange = () => { if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) closePeer(peerId); };
    if (isInitiator) {
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: activeKind === 'video' });
      await pc.setLocalDescription(offer);
      send({ type: 'offer', callId: activeId, from: user.id, to: peerId, kind: activeKind, offer });
    }
  }, [closePeer, memberFor, send, user]);

  const handleSignal = useCallback(async (signal: Signal) => {
    if (!user || signal.from === user.id || (signal.to && signal.to !== user.id)) return;
    if (signal.type === 'invite') { if (!active && !incoming) setIncoming(signal); return; }
    if (signal.type === 'join') {
      if (starterRef.current && signal.callId === activeCallRef.current) await createPeer(signal.from, true, signal.callId, signal.kind || kind);
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
    if (signal.type === 'answer' && signal.answer) { const pc = peersRef.current.get(signal.from); if (pc) await pc.setRemoteDescription(signal.answer); return; }
    if (signal.type === 'ice' && signal.candidate) { const pc = peersRef.current.get(signal.from); if (pc) await pc.addIceCandidate(signal.candidate); return; }
    if (signal.type === 'leave') closePeer(signal.from);
  }, [active, closePeer, createPeer, incoming, kind, send, user]);

  useEffect(() => {
    const channel = supabase.channel('group-call-signal-' + groupId);
    channel.on('broadcast', { event: 'signal' }, payload => { void handleSignal(payload.payload as Signal); });
    channel.subscribe(status => { channelReadyRef.current = status === 'SUBSCRIBED'; });
    channelRef.current = channel;
    return () => { channelReadyRef.current = false; void channel.unsubscribe(); channelRef.current = null; };
  }, [groupId, handleSignal]);

  useEffect(() => {
    if (!active || !startedAt) return;
    const update = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [active, startedAt]);

  const getMedia = async (requestedKind: CallKind) => {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Audio/video calls need HTTPS and browser microphone/camera permission');
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
      activeCallRef.current = id; starterRef.current = true; setCallId(id); setKind(requestedKind); setStartedAt(callStarted); setActive(true);
      send({ type: 'invite', callId: id, from: user.id, kind: requestedKind, startedAt: callStarted });
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Call start nahi hui'); }
  };

  const accept = async () => {
    if (!incoming || !user) return;
    try {
      await waitForChannel();
      await getMedia(incoming.kind || 'audio');
      await joinGroupCall(incoming.callId);
      activeCallRef.current = incoming.callId; starterRef.current = false; setCallId(incoming.callId); setKind(incoming.kind || 'audio'); setStartedAt(incoming.startedAt || Date.now()); setActive(true); setIncoming(null);
      send({ type: 'join', callId: incoming.callId, from: user.id, to: incoming.from, kind: incoming.kind });
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Call join nahi hui'); }
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
    if (kind !== 'video') { toast.info('Screen share video call me available hai'); return; }
    if (screenSharing) { await stopScreenShare(); return; }
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('Screen share browser me available nahi hai');
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = display.getVideoTracks()[0];
      for (const pc of peersRef.current.values()) {
        const sender = pc.getSenders().find(item => item.track?.kind === 'video');
        if (sender) await sender.replaceTrack(track);
      }
      screenStreamRef.current = display;
      setScreenStream(display);
      setScreenSharing(true);
      track.onended = () => { void stopScreenShare(); };
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Screen share start nahi hua'); }
  };

  const leave = async () => {
    const id = activeCallRef.current;
    if (id && user) { send({ type: 'leave', callId: id, from: user.id }); try { await leaveGroupCall(id); if (starterRef.current) await endGroupCall(id); } catch { /* cleanup continues */ } }
    screenStreamRef.current?.getTracks().forEach(track => track.stop());
    peersRef.current.forEach(peer => peer.close()); peersRef.current.clear();
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    localStreamRef.current = null; screenStreamRef.current = null; activeCallRef.current = null; starterRef.current = false;
    setRemoteStreams(new Map()); setRemoteLabels(new Map()); setRemoteAvatars(new Map()); setScreenStream(null); setLocalStream(null); setCallId(null); setStartedAt(null); setElapsedSeconds(0); setScreenSharing(false); setActive(false); setIncoming(null);
  };

  const toggleMute = () => { const next = !muted; localStreamRef.current?.getAudioTracks().forEach(track => { track.enabled = !next; }); setMuted(next); };
  const toggleCamera = () => { const next = !cameraOff; if (!screenSharing) localStreamRef.current?.getVideoTracks().forEach(track => { track.enabled = !next; }); setCameraOff(next); };
  const formatTime = (seconds: number) => Math.floor(seconds / 60).toString().padStart(2, '0') + ':' + (seconds % 60).toString().padStart(2, '0');
  const participantCount = remoteStreams.size + 1;
  const localLabel = profile?.username || profile?.full_name || user?.email?.split('@')[0] || 'You';

  if (incoming) {
    const caller = memberFor(incoming.from);
    return <div className="border-b border-border bg-primary/10 px-3 py-2"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-primary/20 font-semibold text-primary">{caller?.avatar_url ? <img src={caller.avatar_url} alt="" className="h-full w-full object-cover" /> : initials(caller?.username || caller?.full_name || 'Member')}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{caller?.username || caller?.full_name || 'A member'} is calling</p><p className="text-xs text-muted-foreground">Incoming group {incoming.kind || 'audio'} call</p></div><Button size="sm" onClick={() => void accept()}>Join</Button><Button size="sm" variant="outline" onClick={() => setIncoming(null)}>Dismiss</Button></div></div>;
  }

  if (!active) return <div className="flex items-center gap-1 border-b border-border bg-card px-3 py-1.5"><span className="mr-auto text-xs text-muted-foreground">Group call</span><Button type="button" variant="ghost" size="sm" onClick={() => void start('audio')}><Phone className="mr-1 h-3.5 w-3.5" />Audio</Button><Button type="button" variant="ghost" size="sm" onClick={() => void start('video')}><Video className="mr-1 h-3.5 w-3.5" />Video</Button></div>;

  const localPreview = screenStream || localStream;
  return <div className="fixed inset-0 z-[80] flex flex-col overflow-hidden bg-[#101114] text-white">
    <header className="flex shrink-0 items-center gap-3 border-b border-white/10 bg-[#17181c] px-4 py-3 pt-[max(env(safe-area-inset-top),12px)]"><button type="button" onClick={() => void leave()} className="rounded-full p-2 text-white/80 hover:bg-white/10" aria-label="End call"><X className="h-5 w-5" /></button><div className="min-w-0 flex-1"><p className="truncate text-base font-semibold">{groupName || 'Group call'}</p><p className="flex items-center gap-1 text-xs text-white/60"><Users className="h-3 w-3" />{participantCount} participant{participantCount === 1 ? '' : 's'} · {formatTime(elapsedSeconds)}</p></div><span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px]">{kind === 'video' ? 'Video call' : 'Audio call'}</span></header>
    <main className="min-h-0 flex-1 overflow-y-auto p-2"><div className="grid min-h-full grid-cols-1 gap-2 sm:grid-cols-2"><ParticipantTile stream={localPreview} muted label={localLabel} avatarUrl={profile?.avatar_url} showVideo={kind === 'video' && !cameraOff} speakerOn={speakerOn} index={0} local />{Array.from(remoteStreams.entries()).map(([peerId, stream], index) => <ParticipantTile key={peerId} stream={stream} label={remoteLabels.get(peerId) || 'Participant'} avatarUrl={remoteAvatars.get(peerId)} showVideo={kind === 'video'} speakerOn={speakerOn} index={index + 1} />)}</div></main>
    <footer className="flex shrink-0 justify-center gap-2 border-t border-white/10 bg-[#17181c] px-3 py-3 pb-[max(env(safe-area-inset-bottom),12px)]"><Control label={muted ? 'Unmute' : 'Mute'} onClick={toggleMute} active={muted}>{muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}</Control>{kind === 'video' && <Control label={cameraOff ? 'Camera on' : 'Camera off'} onClick={toggleCamera} active={cameraOff}>{cameraOff ? <CameraOff className="h-5 w-5" /> : <Camera className="h-5 w-5" />}</Control>}<Control label={screenSharing ? 'Stop share' : 'Share screen'} onClick={() => void toggleScreenShare()} active={screenSharing} disabled={kind !== 'video'}><Monitor className="h-5 w-5" /></Control><Control label={speakerOn ? 'Speaker' : 'Earpiece'} onClick={() => setSpeakerOn(value => !value)} active={speakerOn}>{speakerOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}</Control><Control label="End" onClick={() => void leave()} danger><PhoneOff className="h-5 w-5" /></Control></footer>
  </div>;
};

export default GroupCallPanel;
