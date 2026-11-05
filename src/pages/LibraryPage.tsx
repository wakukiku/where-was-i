import { useMemo, useState } from "react";
import { Button, Card, Input, Tabs } from "@wakukiku/wak-ui";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import { WorkCard } from "../components/WorkCard";
import type { MediaType, MemoryPoint, WorkStatus } from "../types";
import type { Notify } from "../App";

export function LibraryPage({ onAdd }: { notify: Notify; onAdd: () => void }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"all" | MediaType>("all");
  const [status, setStatus] = useState<WorkStatus>("active");
  const data = useLiveQuery(async () => {
    const works = await db.works.toArray();
    const points = await db.points.toArray();
    const latest = new Map<string, MemoryPoint>();
    points
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .forEach((point) => {
        if (!latest.has(point.workId)) latest.set(point.workId, point);
      });
    return { works, latest };
  }, []);
  const filtered = useMemo(
    () =>
      (data?.works ?? [])
        .filter(
          (work) =>
            work.status === status &&
            (type === "all" || work.type === type) &&
            work.title
              .toLocaleLowerCase("ru")
              .includes(query.toLocaleLowerCase("ru")),
        )
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [data, status, type, query],
  );
  const typeTabs = [
    { value: "all", label: "Все", content: null },
    { value: "game", label: "Игры", content: null },
    { value: "series", label: "Сериалы", content: null },
    { value: "book", label: "Книги", content: null },
  ];
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Коллекция</span>
          <h1>Библиотека</h1>
        </div>
        <Button onClick={onAdd}>+ Добавить</Button>
      </div>
      <div className="library-controls">
        <Tabs
          items={typeTabs}
          value={type}
          onValueChange={(value) => setType(value as typeof type)}
          label="Категория"
        />
        <Input
          aria-label="Поиск в библиотеке"
          placeholder="Поиск по названию…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div
        className="status-tabs"
        role="group"
        aria-label="Статус произведений"
      >
        {(
          [
            ["active", "Активные"],
            ["completed", "Завершённые"],
            ["archived", "Архив"],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            size="sm"
            variant={status === value ? "primary" : "secondary"}
            onClick={() => setStatus(value)}
          >
            {label}
          </Button>
        ))}
      </div>
      {filtered.length ? (
        <div className="library-grid">
          {filtered.map((work) => (
            <WorkCard
              key={work.id}
              work={work}
              point={data?.latest.get(work.id)}
            />
          ))}
        </div>
      ) : (
        <Card className="empty-state">
          <h2>Ничего не найдено</h2>
          <p>
            {query
              ? "Измените запрос или фильтры."
              : status === "active"
                ? "Добавьте произведение или верните его из архива."
                : "В этом разделе пока нет произведений."}
          </p>
          {status === "active" && !query && (
            <Button onClick={onAdd}>Добавить произведение</Button>
          )}
        </Card>
      )}
    </div>
  );
}
