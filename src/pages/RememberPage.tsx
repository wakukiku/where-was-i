import { useEffect, useRef, useState } from "react";
import { Badge, Button, Card } from "@wakukiku/wak-ui";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate, useParams } from "react-router-dom";
import { Cover } from "../components/Cover";
import { db, getPointsNewestFirst } from "../lib/db";
import { progressLabel, relativeDate, typeLabels } from "../lib/format";
import type { Notify } from "../App";

export function RememberPage({ notify }: { notify: Notify }) {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const data = useLiveQuery(
    async () => ({
      work: await db.works.get(id),
      point: (await getPointsNewestFirst(id))[0],
    }),
    [id],
  );
  const [confirmed, setConfirmed] = useState(false);
  const previous = useRef<string>();
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!data)
    return (
      <div className="page">
        <p>Загружаем контекст…</p>
      </div>
    );
  if (!data.work || !data.point)
    return (
      <div className="page">
        <Card className="empty-state">
          <h1>Пока нечего вспоминать</h1>
          <p>Сначала сохраните точку памяти.</p>
          <Button onClick={() => navigate(`/work/${id}`)}>
            К произведению
          </Button>
        </Card>
      </div>
    );
  const { work, point } = data;
  async function remember() {
    previous.current = work.lastResumedAt;
    await db.works.update(work.id, {
      lastResumedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setConfirmed(true);
    notify(
      "Возвращение отмечено",
      "success",
      "Можно отменить отметку до перехода.",
    );
    timer.current = setTimeout(() => navigate(`/work/${work.id}`), 4500);
  }
  async function undo() {
    clearTimeout(timer.current);
    await db.works.update(work.id, {
      lastResumedAt: previous.current,
      updatedAt: new Date().toISOString(),
    });
    setConfirmed(false);
    notify("Отметка отменена", "neutral");
  }
  return (
    <div className="page remember-page">
      <button
        className="back-link"
        onClick={() => navigate(`/work/${work.id}`)}
      >
        ← Отмена
      </button>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Вернуться к сохранённому контексту</span>
          <h1>Вспомнить</h1>
        </div>
      </div>
      <Card className="remember-header">
        <Cover work={work} size="sm" />
        <div>
          <div className="row">
            <Badge tone="accent">{typeLabels[work.type]}</Badge>
            <small>{relativeDate(point.createdAt)}</small>
          </div>
          <h2>{work.title}</h2>
          <p className="muted">{progressLabel(work.type, point.progress)}</p>
        </div>
      </Card>
      <div className="memory-grid">
        <MemoryBlock title="Где остановился" text={point.stoppedAt} />
        <MemoryBlock
          title="Что произошло"
          text={point.happened || "Не указано"}
        />
        <MemoryBlock title="Что дальше" text={point.next} />
        <MemoryBlock
          title="Важно не забыть"
          text={point.remember || "Не указано"}
        />
      </div>
      {confirmed ? (
        <Card className="confirm-banner">
          <strong>Готово — возвращение отмечено.</strong>
          <div className="row">
            <Button variant="secondary" onClick={() => void undo()}>
              Отменить отметку
            </Button>
            <Button onClick={() => navigate(`/work/${work.id}`)}>
              К произведению
            </Button>
          </div>
        </Card>
      ) : (
        <div className="remember-actions">
          <Button
            variant="secondary"
            onClick={() => navigate(`/work/${work.id}`)}
          >
            Отмена
          </Button>
          <Button size="lg" onClick={() => void remember()}>
            Вспомнил
          </Button>
        </div>
      )}
    </div>
  );
}

function MemoryBlock({ title, text }: { title: string; text: string }) {
  return (
    <Card>
      <h2>{title}</h2>
      <p>{text}</p>
    </Card>
  );
}
