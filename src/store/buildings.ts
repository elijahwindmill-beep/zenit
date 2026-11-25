import { create } from 'zustand';

/** Where the 3D buildings come from right now, for the layer panel. */
export interface BuildingsState {
  /** 'free' = OpenFreeMap (no key), 'maptiler' = MapTiler Buildings with the viewer's key. */
  source: 'free' | 'maptiler';
  /** Set when MapTiler turned the key down and the free data is shown instead. */
  problem: string;
}

export const useBuildings = create<BuildingsState>()(() => ({ source: 'free', problem: '' }));
