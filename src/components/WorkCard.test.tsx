import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkCard } from "./WorkCard";
import type { MemoryPoint, Work } from "../types";

const mocks = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useNavigate: () => mocks.navigate,
}));

const work: Work = {
  id: "work-1",
  type: "game",
  title: "Elden Ring",
  status: "active",
  pinned: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const point: MemoryPoint = {
  id: "point-1",
  workId: work.id,
  stoppedAt: "Академия Райи Лукарии",
  next: "Найти Ренналу",
  progress: { percent: 38 },
  createdAt: "2026-01-02T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

describe("WorkCard navigation", () => {
  beforeEach(() => mocks.navigate.mockClear());

  it("opens the work exactly once from the card surface", () => {
    render(<WorkCard work={work} point={point} />);
    fireEvent.click(screen.getByRole("button", { name: "Открыть Elden Ring" }));
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenCalledWith("/work/work-1");
  });

  it("keeps nested actions independent from the card surface", () => {
    render(<WorkCard work={work} point={point} />);
    fireEvent.click(screen.getByRole("button", { name: "Вспомнить" }));
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenCalledWith("/remember/work-1");
  });
});
