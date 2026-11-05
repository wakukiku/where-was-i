import { describe, expect, it } from "vitest";
import { progressLabel, progressPercent } from "./format";
import type { MemoryPoint } from "../types";

const point = (progress: MemoryPoint["progress"]): MemoryPoint => ({
  id: "p",
  workId: "w",
  stoppedAt: "Здесь",
  next: "Дальше",
  progress,
  createdAt: "2025-01-01",
  updatedAt: "2025-01-01",
});

describe("progress formatting", () => {
  it("formats each media category", () => {
    expect(progressLabel("game", { percent: 38, hours: 12 })).toBe(
      "38% · 12 ч",
    );
    expect(progressLabel("series", { season: 1, episode: 6 })).toBe("S01E06");
    expect(
      progressLabel("book", { chapter: "18", page: 180, totalPages: 600 }),
    ).toBe("Глава 18 · стр. 180 из 600");
  });
  it("calculates book percentage without changing the snapshot", () => {
    const memory = point({ page: 150, totalPages: 600 });
    expect(progressPercent("book", memory)).toBe(25);
    expect(memory.progress.page).toBe(150);
  });
});
