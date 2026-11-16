import type { Plugin } from "vite";
export function optimizeDist(dir: string, log?: (msg: string) => void): Promise<void>;
export function optimizeDistPlugin(): Plugin;
