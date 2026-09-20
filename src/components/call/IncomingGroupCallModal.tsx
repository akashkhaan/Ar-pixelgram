import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { notifyPhone, dismissPhoneNotification } from '@/lib/notifyPhone';
import { useGroupCall } from '@/contexts/GroupCallContext';

interface IncomingGroupCallData {
  groupId: string;
  groupName: string;
  groupAvatarUrl?: string | null;
  callId: string;
  kind: 'audio' | 'video';
  from: string;
  fromName: string;
  fromAvatar?: string | null;
}

function initials(name: string) {
  return (name || 'G')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase())
    .join('');
}

export const IncomingGroupCallModal: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const groupCall = useGroupCall();
  const location = useLocation();
  const [callData, setCallData] = useState<IncomingGroupCallData | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const ringtoneIntervalRef = useRef<number | null>(null);

  const stopRingtone = useCallback(() => {
    if (ringtoneIntervalRef.current) {
      clearInterval(ringtoneIntervalRef.current);
      ringtoneIntervalRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        void audioContextRef.current.close();
      } catch {
        /* ignore */
      }
      audioContextRef.current = null;
    }
  }, []);

  const playRingtone = useCallback(() => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      audioContextRef.current = ctx;

      const playBurst = () => {
        if (ctx.state === 'closed') return;
        const now = ctx.currentTime;
        // Pleasant dual-frequency telephone chime (440Hz + 480Hz)
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(440, now);
        osc2.frequency.setValueAtTime(480, now);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 1.2);
      };

      playBurst();
      ringtoneIntervalRef.current = window.setInterval(playBurst, 2500);

      // Vibrate phone if supported
      if ('vibrate' in navigator) {
        navigator.vibrate([400, 200, 400, 200, 400]);
      }
    } catch {
      /* ignore audio autoplay restriction if un-interacted */
    }
  }, []);

  useEffect(() => {
    if (!user) return;

    const channel = supabase.channel(`calls:${user.id}`);
    channel
      .on('broadcast', { event: 'group-call-invite' }, payload => {
        const data = payload.payload as IncomingGroupCallData;
        if (!data || !data.groupId || data.from === user.id) return;

        // If user is already inside this group's chat page, don't obstruct with full modal
        if (location.pathname === `/group/${data.groupId}`) return;

        setCallData(data);
        playRingtone();

        // Android Phone notification with Receive & End buttons
        notifyPhone({
          title: `📞 ${data.groupName || 'Group'} · Incoming ${data.kind === 'video' ? 'Video' : 'Audio'} Call`,
          body: `${data.fromName || 'A member'} is calling the group · Tap Receive or End`,
          tag: `group_call_${data.groupId}`,
          url: `/group/${data.groupId}?autoJoin=1&kind=${data.kind || 'audio'}`,
          icon: data.groupAvatarUrl || data.fromAvatar || '/images/logo/logo-icon.svg',
          isCall: true,
          actions: [
            { action: 'join_call', title: '📞 Receive' },
            { action: 'decline_call', title: '❌ End' },
          ],
        });
      })
      .on('broadcast', { event: 'group-call-end' }, payload => {
        const endedCallId = payload.payload?.callId;
        const endedGroupId = payload.payload?.groupId;
        if (
          (endedCallId && callData?.callId === endedCallId) ||
          (endedGroupId && callData?.groupId === endedGroupId)
        ) {
          stopRingtone();
          if (callData) {
            dismissPhoneNotification(`group_call_${callData.groupId}`);
          }
          setCallData(null);
        }
      })
      .subscribe();

    return () => {
      stopRingtone();
      void channel.unsubscribe();
    };
  }, [user, location.pathname, playRingtone, stopRingtone, callData?.callId, callData?.groupId]);

  const handleDecline = () => {
    stopRingtone();
    if (callData) {
      dismissPhoneNotification(`group_call_${callData.groupId}`);
    }
    setCallData(null);
  };

  const handleAccept = () => {
    if (!callData) return;
    const targetGroup = callData.groupId;
    const targetKind = callData.kind || "audio";
    const targetCallId = callData.callId;
    const targetName = callData.groupName;
    const targetAvatar = callData.groupAvatarUrl;
    stopRingtone();
    dismissPhoneNotification(`group_call_${targetGroup}`);
    setCallData(null);
    void groupCall.joinCall(targetGroup, targetName, targetAvatar, targetCallId, targetKind);
    navigate(`/group/${targetGroup}`);
  };

  if (!callData) return null;

  return (
    <div className="fixed inset-0 z-[101] text-white flex flex-col overflow-hidden bg-[#0d0e12] select-none animate-in fade-in duration-300">
      {/* Full Screen Background Image (Clear, dimmed for readability) */}
      <div className="absolute inset-0 overflow-hidden">
        {callData.groupAvatarUrl ? (
          <img
            src={callData.groupAvatarUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover brightness-[0.45] select-none"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-neutral-900 via-indigo-950 to-black" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/30 to-black/90" />
      </div>

      {/* Center Details */}
      <div className="relative flex-1 flex flex-col items-center justify-center gap-6 px-6 text-center z-10">
        <div className="relative flex items-center justify-center">
          {/* Breathing ripple circles */}
          <span className="absolute h-36 w-36 sm:h-44 sm:w-44 rounded-full bg-emerald-500/20 animate-ping" />
          <span className="absolute h-44 w-44 sm:h-52 sm:w-52 rounded-full bg-white/5 animate-ping [animation-delay:350ms]" />

          <div className="relative flex h-28 w-28 sm:h-36 sm:w-36 items-center justify-center overflow-hidden rounded-full bg-white/15 text-4xl sm:text-5xl font-bold text-white ring-4 ring-white/35 shadow-2xl backdrop-blur-md">
            {callData.groupAvatarUrl ? (
              <img src={callData.groupAvatarUrl} alt={callData.groupName} className="h-full w-full object-cover" />
            ) : (
              initials(callData.groupName || 'G')
            )}
          </div>
        </div>

        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white drop-shadow-md">
            {callData.groupName || 'Group Call'}
          </h2>
          <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-black/40 border border-white/15 px-3.5 py-1 text-xs font-semibold backdrop-blur-md text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Incoming group {callData.kind === 'video' ? 'video' : 'audio'} call</span>
          </div>
          <p className="mt-2 text-xs sm:text-sm text-white/80 drop-shadow">
            <span className="font-semibold text-white">{callData.fromName || 'A member'}</span> is calling the group
          </p>
        </div>
      </div>

      {/* Action Buttons (End / Receive) */}
      <div
        className="relative z-10 px-10 pb-12 flex items-center justify-around max-w-sm mx-auto w-full"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 48px)' }}
      >
        {/* End / Decline Button */}
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={handleDecline}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 hover:bg-red-700 text-white shadow-2xl shadow-red-600/50 transition-all active:scale-95 border border-red-400/40 cursor-pointer"
            aria-label="End call"
          >
            <PhoneOff className="h-7 w-7 text-white" />
          </button>
          <span className="text-xs font-semibold text-white/90 drop-shadow">End</span>
        </div>

        {/* Receive / Accept Button */}
        <div className="flex flex-col items-center gap-2 animate-bounce">
          <button
            type="button"
            onClick={handleAccept}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xl shadow-emerald-600/50 transition-all active:scale-95 border border-emerald-400/40 cursor-pointer"
            aria-label="Receive call"
          >
            {callData.kind === 'video' ? (
              <Video className="h-7 w-7 text-white" />
            ) : (
              <Phone className="h-7 w-7 text-white" />
            )}
          </button>
          <span className="text-xs font-semibold text-white/90 drop-shadow">Receive</span>
        </div>
      </div>
    </div>
  );
};

export default IncomingGroupCallModal;
