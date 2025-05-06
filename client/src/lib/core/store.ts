
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

export interface CoreState {
  audioEnabled: boolean;
  performanceMetrics: {
    fps: number;
    memory: number;
    latency: number;
  };
  settings: {
    graphicsQuality: 'low' | 'medium' | 'high';
    soundVolume: number;
    musicVolume: number;
  };
}

export const createCoreStore = () => 
  create<CoreState>()(
    persist(
      immer((set) => ({
        audioEnabled: true,
        performanceMetrics: {
          fps: 60,
          memory: 0,
          latency: 0
        },
        settings: {
          graphicsQuality: 'medium',
          soundVolume: 0.8,
          musicVolume: 0.5
        }
      })),
      {
        name: 'sw5e-core-store'
      }
    )
  );

export const useCoreStore = createCoreStore();
