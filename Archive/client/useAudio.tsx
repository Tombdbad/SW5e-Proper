import { create } from 'zustand';
import { Howl } from 'howler';

interface AudioState {
  sounds: Record<string, Howl>;
  backgroundMusic?: Howl;
  isMuted: boolean;
  volume: number;
  initializeAudio: () => void;
  playSound: (soundId: string) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
}

export const useAudio = create<AudioState>((set, get) => ({
  sounds: {},
  isMuted: false,
  volume: 0.5,

  initializeAudio: () => {
    const sounds = {
      hit: new Howl({ src: ['/sounds/hit.mp3'] }),
      success: new Howl({ src: ['/sounds/success.mp3'] }),
      background: new Howl({ 
        src: ['/sounds/background.mp3'],
        loop: true,
        volume: 0.3
      })
    };
    set({ sounds });
  },

  playSound: (soundId) => {
    const { sounds, isMuted } = get();
    if (!isMuted && sounds[soundId]) {
      sounds[soundId].play();
    }
  },

  setVolume: (volume) => {
    const { sounds } = get();
    Object.values(sounds).forEach(sound => sound.volume(volume));
    set({ volume });
  },

  toggleMute: () => {
    const { isMuted, volume } = get();
    const { sounds } = get();
    Object.values(sounds).forEach(sound => {
      sound.volume(isMuted ? volume : 0);
    });
    set({ isMuted: !isMuted });
  }
}));