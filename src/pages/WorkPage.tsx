import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogTitle,
  Dropdown,
  Input,
  PixelIcon,
  Progress,
  Textarea,
} from "@wakukiku/wak-ui";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Cover } from "../components/Cover";
import { PointDialog } from "../components/PointDialog";
import {
  db,
  deletePoint,
  deleteWork,
  getPointsNewestFirst,
  upsertWork,
} from "../lib/db";
import {
  progressLabel,
  progressPercent,
  relativeDate,
  typeLabels,
} from "../lib/format";
import type { MemoryPoint, Work, WorkStatus } from "../types";
import type { Notify } from "../App";

export function WorkPage({ notify }: { notify: Notify }) {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const data = useLiveQuery(
    async () => ({
      work: await db.works.get(id),
      points: await getPointsNewestFirst(id),
    }),
    [id],
  );
  const [pointOpen, setPointOpen] = useState(params.get("point") === "new");
  const [editPoint, setEditPoint] = useState<MemoryPoint>();
  const [editOpen, setEditOpen] = useState(false);
  const [confirm, setConfirm] = useState<"work" | "point">();
  const [deletePointId, setDeletePointId] = useState<string>();
  useEffect(() => {
    if (params.get("point") === "new") setParams({}, { replace: true });
  }, [params, setParams]);
  if (!data)
    return (
      <div className="page">
        <p>Загружаем…</p>
      </div>
    );
  if (!data.work)
    return (
      <div className="page">
        <Card className="empty-state">
          <h1>Произведение не найдено</h1>
          <Button onClick={() => navigate("/library")}>К библиотеке</Button>
        </Card>
      </div>
    );
  const work = data.work;
  const latest = data.points[0];
  async function setStatus(status: WorkStatus) {
    await db.works.update(work.id, {
      status,
      updatedAt: new Date().toISOString(),
    });
    notify(
      status === "active"
        ? "Возвращено в активные"
        : status === "completed"
          ? "Отмечено завершённым"
          : "Перемещено в архив",
      "success",
    );
  }
  function menu(action: string) {
    if (action === "edit") setEditOpen(true);
    else if (action === "delete") setConfirm("work");
    else if (
      action === "active" ||
      action === "completed" ||
      action === "archived"
    )
      void setStatus(action);
  }
  const actions = [
    { id: "edit", label: "Редактировать" },
    ...(work.status === "active"
      ? [
          { id: "completed", label: "Завершить" },
          { id: "archived", label: "В архив" },
        ]
      : [{ id: "active", label: "Вернуть в активные" }]),
    { id: "delete", label: "Удалить", danger: true },
  ];
  return (
    <div className="page">
      <button className="back-link" onClick={() => navigate(-1)}>
        ← Назад
      </button>
      <section className="work-hero">
        <Cover work={work} size="lg" />
        <div className="work-hero__content">
          <div className="row row--wrap">
            <Badge tone="accent">{typeLabels[work.type]}</Badge>
            <Badge tone={work.status === "active" ? "success" : "neutral"}>
              {work.status === "active"
                ? "Активно"
                : work.status === "completed"
                  ? "Завершено"
                  : "Архив"}
            </Badge>
            {work.sourceUrl && (
              <a
                className="source-link"
                href={work.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                {work.source}
              </a>
            )}
          </div>
          <h1>{work.title}</h1>
          {work.subtitle && <p className="muted">{work.subtitle}</p>}
          <div className="progress-line">
            <Progress
              value={progressPercent(work.type, latest)}
              label={`Прогресс: ${progressLabel(work.type, latest?.progress)}`}
            />
            <strong>{progressLabel(work.type, latest?.progress)}</strong>
          </div>
          <div className="row row--wrap">
            <Button
              disabled={!latest}
              onClick={() => navigate(`/remember/${work.id}`)}
            >
              Вспомнить
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setEditPoint(undefined);
                setPointOpen(true);
              }}
            >
              Новая точка
            </Button>
            <Button
              variant="ghost"
              aria-label={work.pinned ? "Открепить" : "Закрепить"}
              onClick={() =>
                void db.works.update(work.id, {
                  pinned: !work.pinned,
                  updatedAt: new Date().toISOString(),
                })
              }
            >
              <PixelIcon name="pin" /> {work.pinned ? "Открепить" : "Закрепить"}
            </Button>
            <Dropdown
              label="Действия с произведением"
              trigger={<span>•••</span>}
              items={actions}
              onSelect={menu}
            />
          </div>
        </div>
      </section>
      <section>
        <div className="section-title">
          <h2>Последняя точка</h2>
          <span>
            {work.lastResumedAt
              ? `Возвращались ${relativeDate(work.lastResumedAt)}`
              : "Ещё не возвращались"}
          </span>
        </div>
        {latest ? (
          <Card>
            <div className="point-summary">
              <div>
                <strong>{latest.stoppedAt}</strong>
                <p className="muted">
                  {latest.happened || "Без дополнительного описания"}
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => navigate(`/remember/${work.id}`)}
              >
                Вспомнить
              </Button>
            </div>
          </Card>
        ) : (
          <Card>
            <p className="muted">
              Точек памяти пока нет. Сохраните, где остановились и что хотите
              сделать дальше.
            </p>
          </Card>
        )}
      </section>
      <section>
        <div className="section-title">
          <h2>История точек</h2>
          <Badge>{data.points.length}</Badge>
        </div>
        <div className="history-list">
          {data.points.map((point) => (
            <Card key={point.id} className="history-card">
              <div>
                <small>
                  {relativeDate(point.createdAt)} ·{" "}
                  {progressLabel(work.type, point.progress)}
                </small>
                <h3>{point.stoppedAt}</h3>
                <p className="muted clamp">Дальше: {point.next}</p>
              </div>
              <Dropdown
                label="Действия с точкой"
                trigger={<span>•••</span>}
                items={[
                  { id: "edit", label: "Редактировать" },
                  { id: "delete", label: "Удалить", danger: true },
                ]}
                onSelect={(action) => {
                  if (action === "edit") {
                    setEditPoint(point);
                    setPointOpen(true);
                  } else {
                    setDeletePointId(point.id);
                    setConfirm("point");
                  }
                }}
              />
            </Card>
          ))}
        </div>
      </section>
      {pointOpen && (
        <PointDialog
          key={editPoint?.id ?? "new"}
          work={work}
          point={editPoint}
          previous={latest}
          open
          onOpenChange={setPointOpen}
          notify={notify}
        />
      )}
      {editOpen && (
        <EditWorkDialog
          key={work.updatedAt}
          work={work}
          open
          onOpenChange={setEditOpen}
          notify={notify}
        />
      )}
      <ConfirmDialog
        open={confirm === "work"}
        title="Удалить произведение?"
        description="Все связанные точки памяти будут удалены без возможности восстановления."
        confirmLabel="Удалить"
        danger
        onOpenChange={(open) => !open && setConfirm(undefined)}
        onConfirm={async () => {
          await deleteWork(work.id);
          navigate("/library");
          notify("Произведение удалено", "success");
        }}
      />
      <ConfirmDialog
        open={confirm === "point"}
        title="Удалить точку?"
        description="Исторический снимок будет удалён без возможности восстановления."
        confirmLabel="Удалить"
        danger
        onOpenChange={(open) => !open && setConfirm(undefined)}
        onConfirm={async () => {
          if (deletePointId) await deletePoint(deletePointId);
          notify("Точка удалена", "success");
        }}
      />
    </div>
  );
}

function EditWorkDialog({
  work,
  open,
  onOpenChange,
  notify,
}: {
  work: Work;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notify: Notify;
}) {
  const [title, setTitle] = useState(work.title);
  const [subtitle, setSubtitle] = useState(work.subtitle ?? "");
  const [cover, setCover] = useState(work.cover ?? "");
  const [coverBlob, setCoverBlob] = useState<Blob | undefined>(work.coverBlob);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await upsertWork({ ...work, title, subtitle, cover, coverBlob });
    notify("Изменения сохранены", "success");
    onOpenChange(false);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Редактировать</DialogTitle>
        <form className="form-stack" onSubmit={submit}>
          <Input
            label="Название"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <Textarea
            label="Подпись"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
          />
          <Input
            label="URL обложки"
            type="url"
            value={cover}
            onChange={(e) => setCover(e.target.value)}
          />
          <label className="file-field">
            <strong>Своя обложка</strong>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setCoverBlob(e.target.files?.[0])}
            />
          </label>
          <div className="dialog-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
            >
              Отмена
            </Button>
            <Button type="submit" disabled={!title.trim()}>
              Сохранить
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
