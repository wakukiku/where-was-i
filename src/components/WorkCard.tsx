import { Badge, Button, Card, Progress } from "@wakukiku/wak-ui";
import { useNavigate } from "react-router-dom";
import type { MemoryPoint, Work } from "../types";
import {
  progressLabel,
  progressPercent,
  relativeDate,
  typeLabels,
} from "../lib/format";
import { Cover } from "./Cover";

export function WorkCard({
  work,
  point,
  compact = false,
}: {
  work: Work;
  point?: MemoryPoint;
  compact?: boolean;
}) {
  const navigate = useNavigate();
  return (
    <Card
      className={`work-card tactile-card ${compact ? "work-card--compact" : ""}`}
      elevated
    >
      <button
        className="work-card__hit"
        aria-label={`Открыть ${work.title}`}
        onClick={() => navigate(`/work/${work.id}`)}
      />
      <Cover work={work} size={compact ? "sm" : "md"} />
      <div className="work-card__body">
        <div className="row row--wrap">
          <Badge tone="accent">{typeLabels[work.type]}</Badge>
          {work.pinned && <Badge tone="warning">Закреплено</Badge>}
          <small>{relativeDate(work.lastPointAt ?? work.updatedAt)}</small>
        </div>
        <h3>{work.title}</h3>
        <p className="muted clamp">
          {point?.stoppedAt ?? "Создайте первую точку памяти."}
        </p>
        {!compact && (
          <>
            <div className="progress-line">
              <Progress
                value={progressPercent(work.type, point)}
                label={`Прогресс: ${progressLabel(work.type, point?.progress)}`}
              />
              <strong>{progressLabel(work.type, point?.progress)}</strong>
            </div>
            <div className="row work-card__actions">
              <Button
                size="sm"
                disabled={!point}
                onClick={() => navigate(`/remember/${work.id}`)}
              >
                Вспомнить
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => navigate(`/work/${work.id}?point=new`)}
              >
                Сохранить точку
              </Button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
