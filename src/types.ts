export type MediaType = "game" | "series" | "book";
export type WorkStatus = "active" | "completed" | "archived";
export type ThemeMode = "light" | "dark" | "system";

export interface ProgressSnapshot {
  percent?: number;
  hours?: number;
  season?: number;
  episode?: number;
  chapter?: string;
  page?: number;
  totalPages?: number;
}

export interface Work {
  id: string;
  type: MediaType;
  title: string;
  subtitle?: string;
  cover?: string;
  coverBlob?: Blob;
  source?: string;
  sourceUrl?: string;
  status: WorkStatus;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  lastPointAt?: string;
  lastResumedAt?: string;
}

export interface MemoryPoint {
  id: string;
  workId: string;
  stoppedAt: string;
  next: string;
  happened?: string;
  remember?: string;
  progress: ProgressSnapshot;
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  id: "settings";
  theme: ThemeMode;
}

export interface Draft {
  id: string;
  workId: string;
  payload: Partial<MemoryPoint>;
  updatedAt: string;
}

export interface CatalogResult {
  externalId: string;
  title: string;
  subtitle?: string;
  cover?: string;
  source: string;
  sourceUrl: string;
}

export interface BackupV1 {
  format: "where-was-i";
  version: 1;
  exportedAt: string;
  works: Array<Omit<Work, "coverBlob"> & { coverDataUrl?: string }>;
  points: MemoryPoint[];
  settings: Settings;
}
