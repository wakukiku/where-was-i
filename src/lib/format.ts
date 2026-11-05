import type { MemoryPoint, MediaType, ProgressSnapshot } from "../types";

export const typeLabels: Record<MediaType, string> = {
  game: "Игра",
  series: "Сериал",
  book: "Книга",
};

export function relativeDate(value?: string) {
  if (!value) return "ещё не было";
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
  if (days <= 0) return "сегодня";
  if (days === 1) return "вчера";
  if (days < 7) return `${days} дн. назад`;
  return new Intl.DateTimeFormat("ru", {
    day: "numeric",
    month: "short",
    year:
      new Date(value).getFullYear() !== new Date().getFullYear()
        ? "numeric"
        : undefined,
  }).format(new Date(value));
}

export function progressLabel(type: MediaType, progress?: ProgressSnapshot) {
  if (!progress) return "Прогресс не указан";
  if (type === "game")
    return (
      [
        progress.percent != null ? `${progress.percent}%` : "",
        progress.hours != null ? `${progress.hours} ч` : "",
      ]
        .filter(Boolean)
        .join(" · ") || "Прогресс не указан"
    );
  if (type === "series")
    return (
      [
        progress.season != null
          ? `S${String(progress.season).padStart(2, "0")}`
          : "",
        progress.episode != null
          ? `E${String(progress.episode).padStart(2, "0")}`
          : "",
      ]
        .filter(Boolean)
        .join("") || "Прогресс не указан"
    );
  return (
    [
      progress.chapter ? `Глава ${progress.chapter}` : "",
      progress.page != null
        ? `стр. ${progress.page}${progress.totalPages ? ` из ${progress.totalPages}` : ""}`
        : "",
    ]
      .filter(Boolean)
      .join(" · ") || "Прогресс не указан"
  );
}

export function progressPercent(type: MediaType, point?: MemoryPoint) {
  if (!point) return 0;
  if (type === "game") return point.progress.percent ?? 0;
  if (type === "book" && point.progress.page && point.progress.totalPages)
    return Math.round((point.progress.page / point.progress.totalPages) * 100);
  return 0;
}
