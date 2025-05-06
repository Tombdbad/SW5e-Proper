import { create } from 'zustand';
import { useCoreStore } from '../core/store';

interface AudioState {
  isMuted: boolean;
  soundVolume: number;
  musicVolume: number;
  currentMusic: string | null;
  soundEffects: Map<string, HTMLAudioElement>;
  toggleMute: () => void;
  playSound: (soundId: string) => void;
  playMusic: (musicPath: string) => void;
  stopMusic: () => void;
  setSoundVolume: (volume: number) => void;
  setMusicVolume: (volume: number) => void;
}

export const useAudio = create<AudioState>((set, get) => ({
  isMuted: false,
  soundVolume: 0.8,
  musicVolume: 0.5,
  currentMusic: null,
  soundEffects: new Map(),

  toggleMute: () => set(state => ({ isMuted: !state.isMuted })),

  playSound: (soundId: string) => {
    const { soundEffects, isMuted, soundVolume } = get();
    if (isMuted) return;

    let sound = soundEffects.get(soundId);
    if (!sound) {
      sound = new Audio(`/sounds/${soundId}.mp3`);
      sound.onerror = () => {
        console.error(`Failed to load sound effect: ${soundId}`);
      };
      soundEffects.set(soundId, sound);
    }

    sound.volume = soundVolume;
    sound.currentTime = 0;
    sound.play().catch(error => {
      console.error(`Error playing sound effect ${soundId}:`, error);
    });
  },

  playMusic: (musicPath: string) => {
    const { currentMusic, isMuted, musicVolume } = get();
    if (currentMusic === musicPath) return;

    const audio = new Audio(musicPath);
    audio.loop = true;
    audio.volume = isMuted ? 0 : musicVolume;
    audio.onerror = () => {
      console.error(`Failed to load music: ${musicPath}`);
    };
    
    const {stopMusic} = get()
    stopMusic();
    audio.play().catch(error => {
      console.error(`Error playing music ${musicPath}:`, error);
    });

    set({ currentMusic: musicPath });
  },

  stopMusic: () => {
    const { currentMusic } = get();
    if (currentMusic) {
      const audio = new Audio(currentMusic);
      audio.pause();
      set({ currentMusic: null });
    }
  },

  setSoundVolume: (volume: number) => set({ soundVolume: volume }),
  setMusicVolume: (volume: number) => set({ musicVolume: volume })
}));