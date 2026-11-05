import { Button, Card } from "@wakukiku/wak-ui";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import { WorkCard } from "../components/WorkCard";
import type { Notify } from "../App";
import type { MemoryPoint, Work } from "../types";

export function HomePage({ onAdd }: { notify: Notify; onAdd: () => void }) {
  const data = useLiveQuery(async () => {
    const works = (
      await db.works.where("status").equals("active").toArray()
    ).sort((a, b) => activity(b) - activity(a));
    const points = await db.points.toArray();
    const latest = new Map<string, MemoryPoint>();
    points
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .forEach((point) => {
        if (!latest.has(point.workId)) latest.set(point.workId, point);
      });
    const featured = works.find((work) => work.pinned) ?? works[0];
    return {
      featured,
      rest: works.filter((work) => work.id !== featured?.id),
      latest,
    };
  }, []);
  if (!data)
    return (
      <div className="page">
        <p>Загружаем библиотеку…</p>
      </div>
    );
  return (
    <div className="page page--home">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Главная</span>
          <h1>Where Was I?</h1>
          <p>Вернитесь ровно к тому месту, где остановились.</p>
        </div>
        <Button onClick={onAdd}>+ Добавить</Button>
      </div>
      {!data.featured ? (
        <Card className="empty-state" elevated>
          <h2>Библиотека пока пуста</h2>
          <p>
            Добавьте игру, сериал или книгу, а затем сохраните первую точку
            памяти.
          </p>
          <Button onClick={onAdd}>Добавить произведение</Button>
        </Card>
      ) : (
        <>
          <section>
            <div className="section-title">
              <h2>Продолжить</h2>
              <span>1 произведение</span>
            </div>
            <WorkCard
              work={data.featured}
              point={data.latest.get(data.featured.id)}
            />
          </section>
          <section>
            <div className="section-title">
              <h2>Остальные</h2>
              <span>{data.rest.length} произведений</span>
            </div>
            {data.rest.length ? (
              <div className="compact-list">
                {data.rest.map((work) => (
                  <WorkCard
                    key={work.id}
                    work={work}
                    point={data.latest.get(work.id)}
                    compact
                  />
                ))}
              </div>
            ) : (
              <Card>
                <p className="muted">Других активных произведений пока нет.</p>
              </Card>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function activity(work: Work) {
  return Math.max(
    ...[work.lastPointAt, work.lastResumedAt, work.createdAt]
      .filter(Boolean)
      .map((value) => new Date(value!).getTime()),
  );
}
