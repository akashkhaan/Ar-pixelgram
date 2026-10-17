import { useEffect, useState } from 'react';
import { audioPlayerService, type AudioPlayerState } from '@/services/audioPlayerService';

export function useAudioPlayer(): AudioPlayerState & {
  playTrack: typeof audioPlayerService.playTrack;
  togglePlay: typeof audioPlayerService.togglePlay;
  pause: typeof audioPlayerService.pause;
  resume: typeof audioPlayerService.resume;
  stop: typeof audioPlayerService.stop;
  playNext: typeof audioPlayerService.playNext;
  playPrevious: typeof audioPlayerService.playPrevious;
  seek: typeof audioPlayerService.seek;
} {
  const [state, setState] = useState<AudioPlayerState>(() => audioPlayerService.getState());

  useEffect(() => {
    return audioPlayerService.subscribe(setState);
  }, []);

  return {
    ...state,
    playTrack: audioPlayerService.playTrack.bind(audioPlayerService),
    togglePlay: audioPlayerService.togglePlay.bind(audioPlayerService),
    pause: audioPlayerService.pause.bind(audioPlayerService),
    resume: audioPlayerService.resume.bind(audioPlayerService),
    stop: audioPlayerService.stop.bind(audioPlayerService),
    playNext: audioPlayerService.playNext.bind(audioPlayerService),
    playPrevious: audioPlayerService.playPrevious.bind(audioPlayerService),
    seek: audioPlayerService.seek.bind(audioPlayerService),
  };
}
