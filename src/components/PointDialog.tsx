import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Input,
  Slider,
  Textarea,
} from "@wakukiku/wak-ui";
import { db, savePoint } from "../lib/db";
import type { MemoryPoint, ProgressSnapshot, Work } from "../types";
import type { Notify } from "../App";

const num = (value: string) => (value === "" ? undefined : Number(value));

export function PointDialog({
  work,
  point,
  previous,
  open,
  onOpenChange,
  notify,
}: {
  work: Work;
  point?: MemoryPoint;
  previous?: MemoryPoint;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notify: Notify;
}) {
  const initial = point ?? previous;
  const [stoppedAt, setStoppedAt] = useState(point?.stoppedAt ?? "");
  const [next, setNext] = useState(point?.next ?? "");
  const [happened, setHappened] = useState(point?.happened ?? "");
  const [remember, setRemember] = useState(point?.remember ?? "");
  const [progress, setProgress] = useState<ProgressSnapshot>(
    initial?.progress ?? {},
  );
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open || point) return;
    const timer = setTimeout(() => {
      void db.drafts.put({
        id: `point:${work.id}`,
        workId: work.id,
        payload: { stoppedAt, next, happened, remember, progress },
        updatedAt: new Date().toISOString(),
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [open, point, work.id, stoppedAt, next, happened, remember, progress]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!stoppedAt.trim() || !next.trim()) return;
    setBusy(true);
    try {
      await savePoint({
        id: point?.id,
        createdAt: point?.createdAt,
        workId: work.id,
        stoppedAt: stoppedAt.trim(),
        next: next.trim(),
        happened: happened.trim() || undefined,
        remember: remember.trim() || undefined,
        progress,
      });
      notify(point ? "Точка обновлена" : "Точка сохранена", "success");
      onOpenChange(false);
    } catch {
      notify(
        "Не удалось сохранить точку",
        "danger",
        "Проверьте доступ к локальному хранилищу.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>
          {point ? "Редактировать точку" : "Новая точка"}
        </DialogTitle>
        <form className="form-stack" onSubmit={submit}>
          <Textarea
            label="Где остановился? *"
            value={stoppedAt}
            onChange={(e) => setStoppedAt(e.target.value)}
            required
          />
          <Textarea
            label="Что дальше? *"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
          />
          <Textarea
            label="Что произошло?"
            value={happened}
            onChange={(e) => setHappened(e.target.value)}
          />
          <Textarea
            label="Важно не забыть"
            value={remember}
            onChange={(e) => setRemember(e.target.value)}
          />
          {work.type === "game" && (
            <div className="progress-fields">
              <Slider
                label={`Прохождение: ${progress.percent ?? 0}%`}
                min={0}
                max={100}
                value={progress.percent ?? 0}
                onValueChange={(percent) =>
                  setProgress((p) => ({ ...p, percent }))
                }
              />
              <Input
                label="Часы"
                type="number"
                min="0"
                value={progress.hours ?? ""}
                onChange={(e) =>
                  setProgress((p) => ({ ...p, hours: num(e.target.value) }))
                }
              />
            </div>
          )}
          {work.type === "series" && (
            <div className="progress-fields">
              <Input
                label="Сезон"
                type="number"
                min="1"
                value={progress.season ?? ""}
                onChange={(e) =>
                  setProgress((p) => ({ ...p, season: num(e.target.value) }))
                }
              />
              <Input
                label="Серия"
                type="number"
                min="1"
                value={progress.episode ?? ""}
                onChange={(e) =>
                  setProgress((p) => ({ ...p, episode: num(e.target.value) }))
                }
              />
            </div>
          )}
          {work.type === "book" && (
            <div className="progress-fields progress-fields--three">
              <Input
                label="Глава"
                value={progress.chapter ?? ""}
                onChange={(e) =>
                  setProgress((p) => ({
                    ...p,
                    chapter: e.target.value || undefined,
                  }))
                }
              />
              <Input
                label="Страница"
                type="number"
                min="0"
                value={progress.page ?? ""}
                onChange={(e) =>
                  setProgress((p) => ({ ...p, page: num(e.target.value) }))
                }
              />
              <Input
                label="Всего страниц"
                type="number"
                min="1"
                value={progress.totalPages ?? ""}
                onChange={(e) =>
                  setProgress((p) => ({
                    ...p,
                    totalPages: num(e.target.value),
                  }))
                }
              />
            </div>
          )}
          <div className="dialog-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
            >
              Отмена
            </Button>
            <Button
              type="submit"
              loading={busy}
              disabled={!stoppedAt.trim() || !next.trim()}
            >
              Сохранить
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
