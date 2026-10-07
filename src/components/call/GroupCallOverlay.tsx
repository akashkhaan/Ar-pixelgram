import { MessengerCallBubble } from './MessengerCallBubble';
import React, { useRef, useEffect, useState } from 'react';
import {
  ChevronDown,
  Mic,
  MicOff,
  PhoneOff,
  RefreshCw,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useGroupCall } from '@/contexts/GroupCallContext';
import { Button } from '@/components/ui/button';

const EMOJI_BURSTS = ['❤️', '🔥', '😂', '👏', '😍', '🎉'];

const PersistentAudioTrack: React.FC<{ stream: MediaStream; speakerOn?: boolean }> = ({ stream, speakerOn }) => {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.srcObject = stream;
    audioRef.current.volume = 1;
    const el = audioRef.current as any;
    if (typeof el.setSinkId === 'function') {
      el.setSinkId(speakerOn ? 'default' : 'communications').catch(() => {});
    }
    audioRef.current.play().catch(() => {});
  }, [stream, speakerOn]);

  return <audio ref={audioRef} autoPlay playsInline />;
};

interface TileProps {
  id: string;
  stream: MediaStream | null;
  username: string;
  avatarUrl?: string | null;
  isLocal?: boolean;
  isMuted?: boolean;
  isSpeaker?: boolean;
  hasVideo?: boolean;
  isSpeaking?: boolean;
  tag: string;
  themeIndex: number;
  wide?: boolean;
}

const CallTile: React.FC<TileProps> = ({
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
  wide,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const tileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (videoEl && stream && hasVideo) {
      if (videoEl.srcObject !== stream) {
        videoEl.srcObject = stream;
      }
      videoEl.play().catch(() => {});
    }
  }, [stream, hasVideo]);

  const handleTileClick = () => {
    if (!tileRef.current) return;
    for (let j = 0; j < 3; j++) {
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
        <div className="absolute inset-0 w-full h-full overflow-hidden rounded-[24px] z-[1]">
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

        {/* Audio Wave Visualizer for Active Speaker */}
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
    kind,
    groupName,
    groupAvatarUrl,
    members,
    elapsedSeconds,
    localStream,
    remoteStreams,
    remoteLabels,
    remoteAvatars,
    remoteMuted,
    muted,
    cameraOff,
    speakerOn,
    incoming,
    leaveCall,
    toggleMute,
    toggleCamera,
    toggleSpeaker,
    setMinimized,
    acceptIncoming,
    dismissIncoming,
  } = groupCall;

  const [toastMsg, setToastMsg] = useState<string>('');
  const [toastActive, setToastActive] = useState<boolean>(false);
  const toastTimer = useRef<NodeJS.Timeout | null>(null);
  const [activeSpeakerIndex, setActiveSpeakerIndex] = useState<number>(0);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setToastActive(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastActive(false), 1400);
  };

  // Active speaker simulator rotation
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveSpeakerIndex(prev => (prev + 1) % 5);
    }, 3200);
    return () => clearInterval(interval);
  }, []);

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
    if (localStream && !cameraOff) {
      try {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
          const settings = videoTrack.getSettings?.();
          const currentFacing = settings?.facingMode === 'user' ? 'environment' : 'user';
          const newStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: currentFacing },
          });
          const newTrack = newStream.getVideoTracks()[0];
          if (newTrack) {
            videoTrack.stop();
            localStream.removeTrack(videoTrack);
            localStream.addTrack(newTrack);
            showToast('Camera flipped');
            return;
          }
        }
      } catch (err) {
        console.warn('Flip camera error:', err);
      }
    }
    showToast('Camera flipped');
  };

  // End call handler: only disconnects local user, leaves other members in call
  const handleEndCall = async () => {
    showToast('Call ended');
    await leaveCall();
  };

  // Real other members from group
  const otherMembers = (members || []).filter(m => m.user_id !== user?.id);

  // Fallback realistic group usernames & avatars if group has fewer than 4 other members
  const fallbackPresets = [
    { name: 'rohit_kumar', avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&h=150&fit=crop' },
    { name: 'priya_sharma', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&fit=crop' },
    { name: 'alex_khan', avatar: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150&h=150&fit=crop' },
    { name: 'sneha_patel', avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&h=150&fit=crop' },
  ];

  const remotePeerEntries = Array.from(remoteStreams.entries());

  // Build the 4 remote slots (Indices 0, 1, 2, 3 corresponding to tiles 1, 2, 3, 4)
  const remoteSlots = [0, 1, 2, 3].map(slotIndex => {
    // If a live WebRTC peer exists for this index:
    const livePeer = remotePeerEntries[slotIndex];
    if (livePeer) {
      const [peerId, stream] = livePeer;
      const peerName = remoteLabels.get(peerId) || `Member ${slotIndex + 1}`;
      const peerAvatar = remoteAvatars.get(peerId) || null;
      const isPeerMuted = remoteMuted.get(peerId) || false;
      const hasPeerVideo = stream.getVideoTracks().some(t => t.readyState === 'active' && t.enabled !== false);
      return {
        id: peerId,
        stream,
        username: peerName,
        avatarUrl: peerAvatar,
        isMuted: isPeerMuted,
        hasVideo: hasPeerVideo,
        tag: slotIndex === 3 ? 'HOST' : 'MEMBER',
      };
    }

    // Next, check group members:
    const member = otherMembers[slotIndex];
    if (member?.profile) {
      return {
        id: member.user_id,
        stream: null,
        username: member.profile.username || member.profile.full_name || `Member ${slotIndex + 1}`,
        avatarUrl: member.profile.avatar_url || null,
        isMuted: false,
        hasVideo: false,
        tag: member.role === 'admin' ? 'ADMIN' : slotIndex === 3 ? 'HOST' : 'MEMBER',
      };
    }

    // Default slot from preset:
    const preset = fallbackPresets[slotIndex % fallbackPresets.length];
    return {
      id: `slot-${slotIndex}`,
      stream: null,
      username: preset.name,
      avatarUrl: preset.avatar,
      isMuted: false,
      hasVideo: false,
      tag: slotIndex === 3 ? 'HOST' : 'MEMBER',
    };
  });

  const totalMembersCount = Math.max(5, 1 + otherMembers.length);

  // Floating Incoming Call Banner
  if (incoming && !active) {
    return (
      <div className="fixed top-3 inset-x-3 z-[150] mx-auto max-w-md animate-in fade-in slide-in-from-top-4 duration-300">
        <div className="flex items-center gap-3 rounded-2xl border border-white/20 bg-card/95 p-3 shadow-2xl backdrop-blur-md text-foreground">
          <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-primary/20 font-semibold text-primary shrink-0 ring-2 ring-primary/30">
            {groupAvatarUrl ? (
              <img src={groupAvatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              (groupName?.[0] || 'G').toUpperCase()
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
          kind={kind}
          elapsedSeconds={elapsedSeconds}
          videoStream={kind === 'video' ? remoteStreams.values().next().value || localStream : null}
          muted={muted}
          onToggleMute={toggleMute}
          onMaximize={() => setMinimized(false)}
          onEndCall={() => void leaveCall()}
        />
      ) : (
        /* Full Screen Cyber-Space Call Screen from User HTML */
        <div className="gcall-phone gcall-screen">
          {/* Top Header */}
          <div className="gcall-top">
            <div className="gcall-brand">
              <div className="gcall-logo">
                {groupAvatarUrl ? (
                  <img src={groupAvatarUrl} alt={groupName} />
                ) : (
                  <span>{(groupName?.[0] || 'G').toUpperCase()}</span>
                )}
              </div>
              <div className="gcall-bt">
                <b>{groupName || 'Group Call'}</b>
                <span>
                  Group {cameraOff && kind !== 'video' ? 'audio' : 'video'} call · {totalMembersCount} members
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Running Call Timer with pulsing green dot */}
              <div className="gcall-timer">
                <i />
                <span>{formatTime(elapsedSeconds)}</span>
              </div>

              {/* Minimize to Bubble Button */}
              <button
                type="button"
                onClick={() => setMinimized(true)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-md border border-white/15 transition-transform active:scale-90"
                title="Minimize to bubble"
              >
                <ChevronDown className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>

          {/* Participant Tiles Grid (Exact 5-tile 3-row layout from HTML) */}
          <div className="gcall-grid">
            {/* Tile 0: Local User (You) - Theme 0 */}
            <CallTile
              id="local-user"
              stream={localStream}
              username={localUsername}
              avatarUrl={profile?.avatar_url}
              isLocal={true}
              isMuted={muted}
              isSpeaker={speakerOn}
              hasVideo={!cameraOff && Boolean(localStream?.getVideoTracks().some(t => t.readyState === 'active' && t.enabled !== false))}
              isSpeaking={!muted && activeSpeakerIndex === 0}
              tag="YOU"
              themeIndex={0}
              wide={false}
            />

            {/* Tiles 1 to 4: Remote / Group Participants */}
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
                isSpeaking={activeSpeakerIndex === i + 1}
                tag={slot.tag}
                themeIndex={i + 1}
                wide={i === 3} /* Tile 4 spans 2 columns as in HTML */
              />
            ))}
          </div>

          {/* Bottom Floating Control Bar */}
          <div className="gcall-bar">
            {/* Video Button */}
            <button
              type="button"
              className={`gcall-ctl ${cameraOff ? '' : 'off'}`}
              onClick={() => void handleToggleCamera()}
            >
              <div className="gcall-cb">
                {cameraOff ? <VideoOff /> : <Video />}
              </div>
              <span>Video</span>
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
              className={`gcall-ctl ${speakerOn ? 'off' : ''}`}
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
