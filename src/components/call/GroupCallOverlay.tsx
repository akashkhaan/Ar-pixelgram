import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useGroupCall } from '@/contexts/GroupCallContext';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  PhoneOff,
  RefreshCw,
  ChevronDown,
} from 'lucide-react';
import { MessengerCallBubble } from './MessengerCallBubble';
import { Button } from '@/components/ui/button';

// Helper component for persistent background remote audio playback
const PersistentAudioTrack: React.FC<{ stream: MediaStream; speakerOn: boolean }> = ({
  stream,
  speakerOn,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (audioRef.current && stream) {
      if (audioRef.current.srcObject !== stream) {
        audioRef.current.srcObject = stream;
      }
      audioRef.current.play().catch(() => {});
    }
  }, [stream]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = speakerOn ? 1.0 : 0.4;
    }
  }, [speakerOn]);

  return <audio ref={audioRef} autoPlay playsInline />;
};

// Fun click emoji bursts on participant tile
const EMOJI_BURSTS = ['🔥', '❤️', '👏', '⚡', '✨', '🎉', '🚀'];

// Participant Tile Component matching the Cyber-Space UI
const CallTile: React.FC<{
  id: string;
  stream: MediaStream | null;
  username: string;
  avatarUrl?: string | null;
  isLocal: boolean;
  isMuted: boolean;
  isSpeaker: boolean;
  hasVideo: boolean;
  isSpeaking: boolean;
  tag: string;
  themeIndex: number;
  wide?: boolean;
}> = ({
  stream,
  username,
  avatarUrl,
  isLocal,
  isMuted,
  isSpeaker,
  hasVideo,
  isSpeaking,
  tag,
  themeIndex,
  wide = false,
}) => {
  const tileRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoRef.current && stream && hasVideo) {
      if (videoRef.current.srcObject !== stream) {
        videoRef.current.srcObject = stream;
      }
      videoRef.current.play().catch(() => {});
    }
  }, [stream, hasVideo]);

  const handleTileClick = () => {
    for (let j = 0; j < 5; j++) {
      setTimeout(() => {
        if (!tileRef.current) return;
        const span = document.createElement('span');
        span.className = 'gcall-fx';
        span.textContent = EMOJI_BURSTS[Math.floor(Math.random() * EMOJI_BURSTS.length)];
        span.style.left = `${15 + Math.random() * 70}%`;
        tileRef.current.appendChild(span);
        setTimeout(() => span.remove(), 1900);
      }, j * 160);
    }
  };

  const themeClass = `gcall-t${themeIndex % 5}`;

  return (
    <div
      ref={tileRef}
      onClick={handleTileClick}
      className={`gcall-tile ${themeClass} ${wide ? 'wide' : ''} ${isSpeaking ? 'speak' : ''}`}
    >
      {/* Participant Tag */}
      <i className="gcall-tag">{tag}</i>

      {/* Video Stream or Avatar Center */}
      {hasVideo && stream ? (
        <div className="absolute inset-0 w-full h-full overflow-hidden rounded-[24px] z-[1] bg-black">
          <video
            ref={el => {
              videoRef.current = el;
              if (el && stream && hasVideo) {
                if (el.srcObject !== stream) {
                  el.srcObject = stream;
                }
                el.play().catch(() => {});
              }
            }}
            autoPlay
            playsInline
            muted={isLocal}
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <div
          className="av"
          style={{
            backgroundImage: avatarUrl ? `url(${avatarUrl})` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          {!avatarUrl && (
            <span className="text-white drop-shadow-md">
              {(username?.[0] || 'U').toUpperCase()}
            </span>
          )}
        </div>
      )}

      {/* Bottom Name Bar */}
      <div className="gcall-name">
        <span>
          <span className="truncate max-w-[120px]">@{username}</span>
          {/* Mute indicator: shows 'Mute' when muted */}
          {isMuted && (
            <span className="gcall-badge-mute">
              <MicOff className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Mute</span>
            </span>
          )}
          {/* Speaker indicator: shows 'Speaker' when on speaker */}
          {isSpeaker && (
            <span className="gcall-badge-spk">
              <Volume2 className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Speaker</span>
            </span>
          )}
        </span>

        {/* Audio Wave Visualizer */}
        <div className="gcall-wv">
          <u />
          <u />
          <u />
        </div>
      </div>
    </div>
  );
};

export const GroupCallOverlay: React.FC = () => {
  const { user, profile } = useAuth();
  const groupCall = useGroupCall();

  const {
    active,
    minimized,
    groupName,
    groupAvatarUrl,
    members,
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
    speakerOn,
    incoming,
    leaveCall,
    toggleMute,
    toggleCamera,
    flipCamera,
    toggleSpeaker,
    setMinimized,
    acceptIncoming,
    dismissIncoming,
  } = groupCall;

  const [toastMsg, setToastMsg] = useState<string>('');
  const [toastActive, setToastActive] = useState<boolean>(false);
  const toastTimer = useRef<NodeJS.Timeout | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setToastActive(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastActive(false), 1400);
  };

  const formatTime = (seconds: number) =>
    Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0') +
    ':' +
    (seconds % 60).toString().padStart(2, '0');

  const localUsername = profile?.username || user?.email?.split('@')[0] || 'You';

  // Camera toggle handler with toast
  const handleToggleCamera = async () => {
    const nextState = cameraOff; // cameraOff is true right now, so it will turn on
    await toggleCamera();
    showToast(nextState ? 'Camera on' : 'Camera off');
  };

  // Mic toggle handler with toast
  const handleToggleMute = () => {
    toggleMute();
    showToast(muted ? 'Mic on' : 'You are muted');
  };

  // Speaker toggle handler with toast
  const handleToggleSpeaker = () => {
    toggleSpeaker();
    showToast(speakerOn ? 'Speaker off' : 'Speaker on');
  };

  // Flip camera handler
  const handleFlipCamera = async () => {
    await flipCamera();
  };

  // End call handler
  const handleEndCall = async () => {
    showToast('Call ended');
    await leaveCall();
  };

  // Real other members from group (used only for metadata lookup like admin role/avatar)
  const otherMembers = (members || []).filter(m => m.user_id !== user?.id);

  // ONLY SHOW PARTICIPANTS WHO HAVE ACTUALLY JOINED THE CALL:
  const joinedRemotePeerIds = Array.from(
    new Set([
      ...Array.from(remoteStreams.keys()),
      ...Array.from(remoteLabels.keys()),
    ])
  ).filter(peerId => Boolean(peerId && peerId !== user?.id));

  // Determine if local user has an active camera stream
  const hasLocalVideo = !cameraOff && Boolean(
    (screenStream || localStream)?.getVideoTracks().some(
      t => (t.readyState === 'live' || (t.readyState as string) === 'active') && t.enabled !== false
    )
  );

  // Build slots strictly for members who have joined the call:
  const remoteSlots = joinedRemotePeerIds.map((peerId, i) => {
    const stream = remoteStreams.get(peerId) || null;
    const memberObj = otherMembers.find(m => m.user_id === peerId);
    const peerName =
      remoteLabels.get(peerId) ||
      memberObj?.profile?.username ||
      memberObj?.profile?.full_name ||
      `Member ${i + 1}`;
    const peerAvatar =
      remoteAvatars.get(peerId) ||
      memberObj?.profile?.avatar_url ||
      null;
    const isPeerMuted = remoteMuted.get(peerId) || false;
    const isPeerCamOff = remoteCameraOff?.get(peerId);
    const hasPeerVideoTrack = Boolean(
      stream &&
      stream.getVideoTracks().some(
        t => (t.readyState === 'live' || (t.readyState as string) === 'active') && t.enabled !== false
      )
    );
    // Remote slot has video if not marked off AND has active video track, or if camera explicitly on
    const hasVideo = isPeerCamOff === false || (!isPeerCamOff && hasPeerVideoTrack);

    return {
      id: peerId,
      stream,
      username: peerName,
      avatarUrl: peerAvatar,
      isMuted: isPeerMuted,
      hasVideo,
      tag: memberObj?.role === 'admin' ? 'ADMIN' : 'MEMBER',
    };
  });

  const totalInCall = 1 + remoteSlots.length;
  const gridCountClass = `gcall-grid-${Math.min(totalInCall, 5)}`;
  const hasAnyVideo = hasLocalVideo || remoteSlots.some(s => s.hasVideo);
  const callModeLabel = hasAnyVideo ? 'video' : 'audio';

  // Floating Incoming Call Banner
  if (incoming && !active) {
    return (
      <div className="fixed top-3 inset-x-3 z-[100] mx-auto max-w-md animate-in fade-in slide-in-from-top-4 duration-300">
        <div className="flex items-center gap-3 rounded-2xl border border-white/20 bg-card/95 p-3 shadow-2xl backdrop-blur-md text-foreground">
          <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-primary/20 font-semibold text-primary shrink-0 ring-2 ring-primary/30">
            {groupAvatarUrl ? (
              <img src={groupAvatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              (groupName || 'G')[0]?.toUpperCase()
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {groupName || 'Group Call'}
            </p>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Incoming group {incoming.kind || 'audio'} call
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              size="sm"
              onClick={() => void acceptIncoming()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-8 px-3 text-xs font-semibold shadow-sm"
            >
              Join
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={dismissIncoming}
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

  return (
    <>
      {/* Background audio playback for remote participants */}
      <div className="hidden pointer-events-none" aria-hidden="true">
        {Array.from(remoteStreams.entries()).map(([peerId, stream]) => (
          <PersistentAudioTrack key={`audio-${peerId}`} stream={stream} speakerOn={speakerOn} />
        ))}
      </div>

      {minimized ? (
        <MessengerCallBubble
          avatarUrl={groupAvatarUrl}
          title={groupName || 'Group'}
          kind={callModeLabel}
          elapsedSeconds={elapsedSeconds}
          videoStream={hasAnyVideo ? remoteStreams.values().next().value || localStream : null}
          muted={muted}
          onToggleMute={toggleMute}
          onMaximize={() => setMinimized(false)}
          onEndCall={() => void leaveCall()}
        />
      ) : (
        /* Full Screen Cyber-Space Call Screen */
        <div className="gcall-phone gcall-screen">
          {/* Top Header */}
          <div className="gcall-top">
            <div className="gcall-user">
              <div
                className="gcall-uav"
                style={{
                  backgroundImage: groupAvatarUrl ? `url(${groupAvatarUrl})` : undefined,
                  backgroundSize: 'cover',
                }}
              >
                {!groupAvatarUrl && (
                  <span className="text-white text-xs font-bold">
                    {(groupName || 'G')[0]?.toUpperCase()}
                  </span>
                )}
              </div>
              <div className="gcall-bt">
                <b>{groupName || 'Group Call'}</b>
                <span>
                  Group {callModeLabel} call · {totalInCall} in call{members && members.length > 0 ? ` (${members.length} members)` : ''}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="gcall-time">
                <i />
                <span>{formatTime(elapsedSeconds)}</span>
              </div>
              <button
                type="button"
                onClick={() => setMinimized(true)}
                className="gcall-min-btn"
                title="Minimize call"
              >
                <ChevronDown className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Participant Tiles Grid - ONLY real joined callers */}
          <div className={`gcall-grid ${gridCountClass}`}>
            {/* Tile 0: Local User (You) */}
            <CallTile
              id="local-user"
              stream={screenStream || localStream}
              username={localUsername}
              avatarUrl={profile?.avatar_url}
              isLocal={true}
              isMuted={muted}
              isSpeaker={speakerOn}
              hasVideo={hasLocalVideo}
              isSpeaking={!muted}
              tag="YOU"
              themeIndex={0}
              wide={totalInCall === 3}
            />

            {/* Waiting indicator when only YOU are in the call */}
            {remoteSlots.length === 0 && (
              <div className="gcall-waiting-pill">
                <span className="gcall-waiting-dot" />
                <span>Waiting for members to join...</span>
              </div>
            )}

            {/* Tiles for Joined Remote Participants ONLY */}
            {remoteSlots.map((slot, i) => (
              <CallTile
                key={slot.id}
                id={slot.id}
                stream={slot.stream}
                username={slot.username}
                avatarUrl={slot.avatarUrl}
                isLocal={false}
                isMuted={slot.isMuted}
                isSpeaker={speakerOn}
                hasVideo={slot.hasVideo}
                isSpeaking={!slot.isMuted}
                tag={slot.tag}
                themeIndex={i + 1}
                wide={totalInCall === 5 && i === remoteSlots.length - 1}
              />
            ))}
          </div>

          {/* Bottom Floating Glass Control Bar */}
          <div className="gcall-bar">
            {/* Video / Camera Button */}
            <button
              type="button"
              className={`gcall-ctl ${cameraOff ? 'off' : ''}`}
              onClick={() => void handleToggleCamera()}
            >
              <div className="gcall-cb">
                {cameraOff ? <VideoOff /> : <Video />}
              </div>
              <span>{cameraOff ? 'Camera on' : 'Camera off'}</span>
            </button>

            {/* Mute Button */}
            <button
              type="button"
              className={`gcall-ctl ${muted ? 'off' : ''}`}
              onClick={handleToggleMute}
            >
              <div className="gcall-cb">
                {muted ? <MicOff /> : <Mic />}
              </div>
              <span>{muted ? 'Unmute' : 'Mute'}</span>
            </button>

            {/* Speaker Button */}
            <button
              type="button"
              className={`gcall-ctl ${speakerOn ? '' : 'off'}`}
              onClick={handleToggleSpeaker}
            >
              <div className="gcall-cb">
                {speakerOn ? <Volume2 /> : <VolumeX />}
              </div>
              <span>Speaker</span>
            </button>

            {/* Flip Camera Button */}
            <button
              type="button"
              className="gcall-ctl"
              onClick={() => void handleFlipCamera()}
            >
              <div className="gcall-cb">
                <RefreshCw />
              </div>
              <span>Flip</span>
            </button>

            {/* End Call Button */}
            <button
              type="button"
              className="gcall-ctl end"
              onClick={() => void handleEndCall()}
            >
              <div className="gcall-cb">
                <PhoneOff />
              </div>
              <span>End</span>
            </button>
          </div>

          {/* Action Toast Notification */}
          <div className={`gcall-toast ${toastActive ? 'on' : ''}`}>
            {toastMsg}
          </div>
        </div>
      )}
    </>
  );
};

export default GroupCallOverlay;
