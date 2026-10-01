import React, { useEffect, useRef, useState } from 'react';
import { Mic, Square, Trash2, Send, Play, Pause, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface VoiceRecorderProps {
  onSendAudio: (audioBlob: Blob, durationSecs: number) => Promise<void> | void;
  onCancel: () => void;
  isSending?: boolean;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({
  onSendAudio,
  onCancel,
  isSending = false,
}) => {
  const [status, setStatus] = useState<'recording' | 'stopped'>('recording');
  const [duration, setDuration] = useState<number>(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState<boolean>(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const recordedBlobRef = useRef<Blob | null>(null);

  // Start recording on mount
  useEffect(() => {
    let isCancelled = false;

    async function startRecording() {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          toast.error('Voice recording is not supported in this browser.');
          onCancel();
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (isCancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        audioChunksRef.current = [];

        // Check supported audio mime types
        let mimeType = '';
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
          mimeType = 'audio/ogg';
        }

        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };

        recorder.onstop = () => {
          const mime = recorder.mimeType || 'audio/webm';
          const blob = new Blob(audioChunksRef.current, { type: mime });
          recordedBlobRef.current = blob;
          const url = URL.createObjectURL(blob);
          setAudioUrl(url);
          setStatus('stopped');
        };

        recorder.start(100);

        // Timer interval
        timerRef.current = setInterval(() => {
          setDuration((prev) => prev + 1);
        }, 1000);
      } catch (err: any) {
        console.error('Microphone access failed:', err);
        toast.error('Microphone permission required for voice notes.');
        onCancel();
      }
    }

    startRecording();

    return () => {
      isCancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {}
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, []);

  const handleStopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
  };

  const handleTogglePreview = () => {
    if (!audioUrl) return;

    if (!previewAudioRef.current) {
      const audio = new Audio(audioUrl);
      previewAudioRef.current = audio;
      audio.onended = () => setIsPlayingPreview(false);
    }

    if (isPlayingPreview) {
      previewAudioRef.current.pause();
      setIsPlayingPreview(false);
    } else {
      previewAudioRef.current
        .play()
        .then(() => setIsPlayingPreview(true))
        .catch((err) => console.error('Preview failed:', err));
    }
  };

  const handleSend = async () => {
    if (!recordedBlobRef.current) {
      // If still recording, stop and wait
      handleStopRecording();
      return;
    }
    await onSendAudio(recordedBlobRef.current, duration);
  };

  const handleDiscard = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
    }
    onCancel();
  };

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="flex-1 flex items-center justify-between gap-2 px-2 py-1 bg-card/95 backdrop-blur-md rounded-full border border-border/60 shadow-lg min-h-[42px] animate-in slide-in-from-bottom-2 duration-200">
      <style>{`
        @keyframes rainbowShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes waveBounce {
          0%, 100% { transform: scaleY(0.3); }
          50% { transform: scaleY(1); }
        }
        .rainbow-animated-gradient {
          background: linear-gradient(90deg, #ff007f, #ff7700, #ffdd00, #00ff88, #00d4ff, #7928ca, #ff007f);
          background-size: 300% 300%;
          animation: rainbowShift 2.5s ease infinite;
        }
      `}</style>

      {/* Delete / Cancel Button */}
      <button
        type="button"
        onClick={handleDiscard}
        className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-500/10 active:scale-90 transition-all shrink-0"
        title="Discard voice message"
        disabled={isSending}
      >
        <Trash2 className="w-4.5 h-4.5" />
      </button>

      {/* Center Waveform & Timer */}
      <div className="flex-1 flex items-center gap-2.5 min-w-0 px-1">
        {/* Pulsing Dot / Mic Icon */}
        <div className="relative flex items-center justify-center shrink-0">
          <span className="w-3 h-3 rounded-full bg-red-500 animate-ping absolute opacity-75" />
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 relative" />
        </div>

        {/* Live Elapsed Counter */}
        <span className="text-xs font-bold text-foreground font-mono shrink-0">
          {formatTimer(duration)}
        </span>

        {/* Dynamic Rainbow Shifting Waveform Bars */}
        <div className="flex-1 flex items-center gap-[3px] h-6 overflow-hidden">
          {status === 'recording' ? (
            // Live dancing rainbow equalizer bars
            Array.from({ length: 18 }).map((_, i) => (
              <span
                key={i}
                className="w-1 rounded-full rainbow-animated-gradient"
                style={{
                  height: '100%',
                  animation: `waveBounce 0.8s ease-in-out infinite alternate`,
                  animationDelay: `${(i % 6) * 0.12}s`,
                }}
              />
            ))
          ) : (
            // Recorded preview static/playable bars
            <div className="flex-1 flex items-center gap-[3px] h-6">
              {Array.from({ length: 18 }).map((_, i) => (
                <span
                  key={i}
                  className="w-1 rounded-full bg-[#0084FF]"
                  style={{
                    height: `${25 + ((i * 13) % 70)}%`,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons: Stop (while recording) OR Play Preview & Send (when stopped) */}
      {status === 'recording' ? (
        <button
          type="button"
          onClick={handleStopRecording}
          className="w-8 h-8 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-md active:scale-90 transition-transform shrink-0"
          title="Stop recording"
        >
          <Square className="w-3.5 h-3.5 fill-current" />
        </button>
      ) : (
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Play/Pause Preview */}
          <button
            type="button"
            onClick={handleTogglePreview}
            className="w-8 h-8 rounded-full bg-muted hover:bg-muted/80 text-foreground flex items-center justify-center active:scale-90 transition-transform"
            title={isPlayingPreview ? 'Pause' : 'Play preview'}
          >
            {isPlayingPreview ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current ml-0.5" />
            )}
          </button>

          {/* Send Recorded Voice Note Button */}
          <button
            type="button"
            onClick={handleSend}
            disabled={isSending}
            className="px-3.5 h-8 rounded-full bg-[#0084FF] hover:bg-[#0073e6] text-white flex items-center gap-1 text-xs font-bold shadow-md active:scale-95 transition-all"
            title="Send voice note"
          >
            {isSending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <span>Send</span>
                <Send className="w-3.5 h-3.5 ml-0.5" />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
