import { create } from "zustand";

export interface SensorReading {
  timestamp: string;
  flow_in_m3h: number;
  flow_out_m3h: number;
  volume_in_m3: number;
  volume_out_m3: number;
  pressure_psi: number;
}

interface SensorState {
  latest: SensorReading | null;
  history: SensorReading[];
  connected: boolean;
  lastSeen: string | null;

  setLatest: (r: SensorReading) => void;
  setConnected: (v: boolean) => void;
  loadHistory: (data: SensorReading[]) => void;
}

const HISTORY_LIMIT = 60;

export const useSensorStore = create<SensorState>((set) => ({
  latest: null,
  history: [],
  connected: false,
  lastSeen: null,

  setLatest: (r) =>
    set((state) => ({
      latest: r,
      lastSeen: r.timestamp,
      history: [...state.history, r].slice(-HISTORY_LIMIT),
    })),

  setConnected: (v) => set({ connected: v }),

  loadHistory: (data) => set({ history: data.slice(-HISTORY_LIMIT) }),
}));
