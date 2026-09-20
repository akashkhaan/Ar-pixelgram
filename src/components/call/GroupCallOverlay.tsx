import { MessengerCallBubble } from './MessengerCallBubble';
import React, { useRef, useEffect } from 'react';
import {
  Camera,
  CameraOff,
  ChevronDown,
  Maximize2,
  Mic,
  MicOff,
  Monitor,
  PhoneOff,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useGroupCall } from '@/contexts/GroupCallContext';
import { Button } from '@/components/ui/button';

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


const PersistentAudioTrack: React.FC<{ stream: MediaStream; speakerOn?: boolean }> = ({ stream, speakerOn }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.srcObject = stream;
    audioRef.current.volume = 1;
    const el = audioRef.current as any;
    if (typeof el.setSinkId === "function") {
      el.setSinkId(speakerOn ? "default" : "communications").catch(() => {});
    }
    audioRef.current.play().catch(() => {});
  }, [stream, speakerOn]);
  return <audio ref={audioRef} autoPlay playsInline />;
};

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
            muted={true}
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

export const GroupCallOverlay: React.FC = () => {
  const { user, profile } = useAuth();
  const groupCall = useGroupCall();

  const {
    active,
    minimized,
    kind,
    groupName,
    groupAvatarUrl,
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
    leaveCall,
    toggleMute,
    toggleCamera,
    toggleSpeaker,
    toggleScreenShare,
    setMinimized,
    acceptIncoming,
    dismissIncoming,
  } = groupCall;

  const formatTime = (seconds: number) =>
    Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0') +
    ':' +
    (seconds % 60).toString().padStart(2, '0');

  const participantCount = remoteStreams.size + 1;
  const localLabel = profile?.username || profile?.full_name || user?.email?.split('@')[0] || 'You';

  /* Floating Incoming Call Banner */
  if (incoming && !active) {
    return (
      <div className="fixed top-3 inset-x-3 z-[100] mx-auto max-w-md animate-in fade-in slide-in-from-top-4 duration-300">
        <div className="flex items-center gap-3 rounded-2xl border border-white/20 bg-card/95 p-3 shadow-2xl backdrop-blur-md text-foreground">
          <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-primary/20 font-semibold text-primary shrink-0 ring-2 ring-primary/30">
            {groupAvatarUrl ? (
              <img src={groupAvatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              initials(groupName || 'G')
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
      {/* Permanent background audio playback for all remote participants */}
      <div className="hidden pointer-events-none" aria-hidden="true">
        {Array.from(remoteStreams.entries()).map(([peerId, stream]) => (
          <PersistentAudioTrack key={`audio-${peerId}`} stream={stream} speakerOn={speakerOn} />
        ))}
      </div>

      {minimized ? (
        <MessengerCallBubble
          avatarUrl={groupAvatarUrl}
          title={groupName || "Group"}
          kind={kind}
          elapsedSeconds={elapsedSeconds}
          videoStream={kind === "video" ? (remoteStreams.values().next().value || localStream) : null}
          muted={muted}
          onToggleMute={toggleMute}
          onMaximize={() => setMinimized(false)}
          onEndCall={() => void leaveCall()}
        />
      ) : (
        /* Full Screen Group Call View (Messenger Style) */
    <div className="fixed inset-0 z-[120] flex flex-col select-none overflow-hidden animate-in fade-in duration-200 bg-[#0b141a]">
      {/* BACKGROUND GRADIENT (Messenger look) */}
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(180deg,#1b3a4b_0%,#0f2a36_45%,#0b141a_100%)]" />

      {/* TOP HEADER */}
      <div className="relative z-30 flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),16px)] pb-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
        <button
          type="button"
          onClick={() => setMinimized(true)}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-md border border-white/15 transition-transform active:scale-95"
          title="Back / Minimize to bubble"
        >
          <ChevronDown className="h-6 w-6" />
        </button>

        <div className="flex flex-col items-center text-center">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="text-sm font-bold text-white drop-shadow">
              {groupName || 'Group Call'}
            </span>
          </div>
          <span className="text-xs font-medium text-white/70">
            {formatTime(elapsedSeconds)} · {participantCount} {participantCount === 1 ? 'member' : 'members'}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="flex h-10 items-center gap-1.5 rounded-full bg-white/10 px-3 text-white backdrop-blur-md border border-white/15">
            <Users className="h-4.5 w-4.5 text-white/80" />
            <span className="text-xs font-semibold text-white/90">{participantCount}</span>
          </div>
        </div>
      </div>

      {/* CALL TILES & WAITING SCREEN */}
      {remoteStreams.size === 0 ? (
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 pb-28">
          <div className="relative flex items-center justify-center">
            {/* Animated Breathing Calling Ripples */}
            <span className="absolute h-48 w-48 rounded-full bg-emerald-500/10 animate-ping duration-1000" />
            <span className="absolute h-40 w-40 rounded-full bg-emerald-500/20 animate-pulse duration-700" />

            <div className="relative z-10 flex h-28 w-28 sm:h-32 sm:w-32 items-center justify-center overflow-hidden rounded-full bg-white/15 text-3xl sm:text-4xl font-bold text-white ring-4 ring-emerald-500/50 shadow-2xl backdrop-blur-md">
              {groupAvatarUrl ? (
                <img src={groupAvatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                initials(groupName || 'G')
              )}
            </div>
          </div>

          <h3 className="mt-6 text-2xl font-bold text-white tracking-tight drop-shadow">
            {groupName || 'Group'}
          </h3>
          <p className="mt-2 text-sm font-medium text-white/70">
            Ringing&hellip;
          </p>
          <p className="mt-1 text-xs text-white/50">
            {kind === 'video' ? 'Group video call' : 'Group audio call'} &middot; {formatTime(elapsedSeconds)}
          </p>
        </div>
      ) : (
        <div className="relative z-10 flex-1 overflow-y-auto px-3 py-2 pb-32">
          <div className="grid h-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <ParticipantTile
              stream={screenStream || localStream}
              label={localLabel}
              avatarUrl={profile?.avatar_url}
              videoMuted={true}
              isMicMuted={muted}
              showVideo={kind === 'video' && (!cameraOff || Boolean(screenStream))}
              speakerOn={speakerOn}
              index={0}
              local
            />

            {Array.from(remoteStreams.entries()).map(([peerId, stream], index) => {
              const peerAvatar = remoteAvatars.get(peerId);
              const peerName = remoteLabels.get(peerId) || 'Participant';
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

      {/* FLOATING CONTROLS BOTTOM BAR */}
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
            onClick={toggleSpeaker}
            variant={speakerOn ? 'active' : 'normal'}
          >
            {speakerOn ? <Volume2 className="h-6 w-6 text-white" /> : <VolumeX className="h-6 w-6 text-white" />}
          </RoundCallButton>
        </div>

        {/* End Call Button */}
        <div className="pointer-events-auto">
          <RoundCallButton
            label="End"
            onClick={() => void leaveCall()}
            variant="danger"
          >
            <PhoneOff className="h-6 w-6 text-white" />
          </RoundCallButton>
        </div>
      </div>
    </div>
      )}
    </>
  );
};

export default GroupCallOverlay;
