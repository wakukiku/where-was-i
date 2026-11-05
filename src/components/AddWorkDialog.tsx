import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Input,
  RadioGroup,
} from "@wakukiku/wak-ui";
import { useNavigate } from "react-router-dom";
import { searchCatalogProgressive } from "../lib/catalog";
import { cacheCoverForWork, warmCover } from "../lib/covers";
import { upsertWork } from "../lib/db";
import type { CatalogResult, MediaType } from "../types";
import type { Notify } from "../App";

export function AddWorkDialog({
  open,
  onOpenChange,
  notify,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notify: Notify;
}) {
  const navigate = useNavigate();
  const [type, setType] = useState<MediaType>("game");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogResult[]>([]);
  const [selected, setSelected] = useState<CatalogResult>();
  const [coverUrl, setCoverUrl] = useState("");
  const [coverBlob, setCoverBlob] = useState<Blob>();
  const [loading, setLoading] = useState(false);
  const [refining, setRefining] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open || query.trim().length < 2 || selected?.title === query) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setRefining(false);
      setError("");
      try {
        await searchCatalogProgressive(
          type,
          query,
          (items, progress) => {
            if (!controller.signal.aborted) {
              setResults(items);
              setRefining(!progress.complete && items.length > 0);
              if (progress.complete) setLoading(false);
            }
          },
          controller.signal,
        );
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : "Поиск недоступен.",
          );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setRefining(false);
        }
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, type, query, selected?.title]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    try {
      const remoteCover = coverUrl || selected?.cover;
      const work = await upsertWork({
        type,
        title: selected?.title ?? query,
        subtitle: selected?.subtitle,
        cover: remoteCover,
        coverBlob,
        source: selected?.source,
        sourceUrl: selected?.sourceUrl,
      });
      if (!coverBlob && remoteCover)
        void cacheCoverForWork(work.id, remoteCover);
      notify("Произведение добавлено", "success");
      onOpenChange(false);
      setQuery("");
      setCoverUrl("");
      setCoverBlob(undefined);
      setSelected(undefined);
      navigate(`/work/${work.id}?point=new`);
    } catch {
      notify("Не удалось добавить произведение", "danger");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Добавить произведение</DialogTitle>
        <form className="form-stack" onSubmit={submit}>
          <RadioGroup
            label="Категория"
            name="media-type"
            value={type}
            onValueChange={(value) => {
              setType(value as MediaType);
              setSelected(undefined);
              setResults([]);
              setError("");
            }}
            options={[
              { value: "game", label: "Игра" },
              { value: "series", label: "Сериал" },
              { value: "book", label: "Книга" },
            ]}
          />
          <Input
            label="Название"
            placeholder="Поиск или ручной ввод"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected(undefined);
              setResults([]);
              setError("");
            }}
          />
          <div className="search-status" aria-live="polite">
            {refining
              ? "Первые результаты готовы — уточняем алиасы и обложки…"
              : loading
                ? "Ищем совпадения…"
                : error ||
                  (query.length >= 2 && !results.length
                    ? "Совпадений не найдено — можно добавить вручную."
                    : "")}
          </div>
          {query.trim().length >= 2 && results.length > 0 && (
            <div
              className="catalog-results"
              role="listbox"
              aria-label="Результаты поиска"
            >
              {results.map((item) => (
                <button
                  key={item.externalId}
                  type="button"
                  className={`catalog-result ${selected?.externalId === item.externalId ? "is-selected" : ""}`}
                  onClick={() => {
                    setSelected(item);
                    setQuery(item.title);
                    setCoverUrl(item.cover ?? "");
                    setResults([]);
                    if (item.cover) void warmCover(item.cover);
                  }}
                >
                  <div className="catalog-thumb">
                    {item.cover && (
                      <img
                        src={item.cover}
                        alt=""
                        loading="lazy"
                        decoding="async"
                      />
                    )}
                  </div>
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.subtitle || "Без описания"}</small>
                    <Badge tone="neutral">{item.source}</Badge>
                  </span>
                </button>
              ))}
            </div>
          )}
          <details>
            <summary>Обложка</summary>
            <div className="form-stack compact-fields">
              <Input
                label="URL изображения"
                type="url"
                value={coverUrl}
                onChange={(e) => setCoverUrl(e.target.value)}
              />
              <label className="file-field">
                <strong>Загрузить файл</strong>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setCoverBlob(e.target.files?.[0])}
                />
                <small>
                  {coverBlob
                    ? `Выбрано: ${(coverBlob as File).name ?? "изображение"}`
                    : "PNG, JPG, WebP или другой формат браузера"}
                </small>
              </label>
              {(coverBlob || coverUrl) && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setCoverBlob(undefined);
                    setCoverUrl("");
                  }}
                >
                  Оставить без обложки
                </Button>
              )}
            </div>
          </details>
          {selected?.sourceUrl && (
            <p className="source-note">
              Источник данных:{" "}
              <a href={selected.sourceUrl} target="_blank" rel="noreferrer">
                {selected.source}
              </a>
            </p>
          )}
          <div className="dialog-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
            >
              Отмена
            </Button>
            <Button type="submit" loading={busy} disabled={!query.trim()}>
              Добавить
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
