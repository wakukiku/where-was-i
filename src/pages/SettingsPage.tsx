import { useRef, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogTitle,
  RadioGroup,
} from "@wakukiku/wak-ui";
import { useLiveQuery } from "dexie-react-hooks";
import { createBackup, restoreBackup, validateBackup } from "../lib/backup";
import { db } from "../lib/db";
import type { BackupV1, ThemeMode } from "../types";
import type { Notify } from "../App";

export function SettingsPage({ notify }: { notify: Notify }) {
  const settings = useLiveQuery(() => db.settings.get("settings"));
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<BackupV1>();
  const [importOpen, setImportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  async function setTheme(theme: ThemeMode) {
    await db.settings.put({ id: "settings", theme });
  }
  async function downloadBackup() {
    try {
      const backup = await createBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `where-was-i-backup-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify("Резервная копия создана", "success");
    } catch {
      notify("Не удалось создать копию", "danger");
    }
  }
  async function pickFile(file?: File) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const checked = validateBackup(parsed);
      setPreview(checked);
      setImportOpen(true);
    } catch (cause) {
      notify(
        "Файл не подходит",
        "danger",
        cause instanceof Error ? cause.message : "Повреждённая копия.",
      );
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  async function replaceData() {
    if (!preview) return;
    setBusy(true);
    try {
      await restoreBackup(preview);
      notify("Библиотека восстановлена", "success");
      setImportOpen(false);
    } catch (cause) {
      notify(
        "Импорт не выполнен",
        "danger",
        cause instanceof Error ? cause.message : "Данные не изменены.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Приложение</span>
          <h1>Настройки</h1>
        </div>
      </div>
      <div className="settings-grid">
        <Card>
          <h2>Оформление</h2>
          <RadioGroup
            label="Тема"
            name="theme"
            value={settings?.theme ?? "system"}
            onValueChange={(value) => void setTheme(value as ThemeMode)}
            options={[
              { value: "light", label: "Светлая" },
              { value: "dark", label: "Тёмная" },
              { value: "system", label: "Системная" },
            ]}
          />
        </Card>
        <Card>
          <h2>Резервная копия</h2>
          <p className="muted">
            Экспорт включает произведения, точки, настройки и загруженные
            обложки.
          </p>
          <div className="row row--wrap">
            <Button onClick={() => void downloadBackup()}>
              Экспортировать
            </Button>
            <Button
              variant="secondary"
              onClick={() => fileRef.current?.click()}
            >
              Импортировать
            </Button>
            <input
              ref={fileRef}
              className="visually-hidden"
              type="file"
              accept="application/json,.json"
              onChange={(e) => void pickFile(e.target.files?.[0])}
            />
          </div>
        </Card>
        <Card>
          <h2>Локальное хранение</h2>
          <p>
            Все пользовательские данные хранятся в IndexedDB этого браузера.
            После первой загрузки локальные сценарии работают без интернета.
          </p>
          <Badge tone="success">Без регистрации</Badge>
        </Card>
        <Card>
          <h2>О приложении</h2>
          <p>
            Where Was I? помогает сохранять собственные точки памяти для игр,
            сериалов и книг.
          </p>
          <p className="muted">
            Версия 1.0 · автор wakukiku · интерфейс на WAK UI 0.1.0.
          </p>
        </Card>
      </div>
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogTitle>Предпросмотр импорта</DialogTitle>
          {preview && (
            <div className="form-stack">
              <Card>
                <p>
                  <strong>{preview.works.length}</strong> произведений
                </p>
                <p>
                  <strong>{preview.points.length}</strong> точек памяти
                </p>
                <p className="muted">
                  Копия от{" "}
                  {new Intl.DateTimeFormat("ru", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(preview.exportedAt))}
                </p>
              </Card>
              <p className="muted">
                Импорт полностью заменит текущую библиотеку. Проверка файла уже
                выполнена; при ошибке восстановления текущие данные останутся
                без частичных изменений.
              </p>
              <Button variant="secondary" onClick={() => void downloadBackup()}>
                Сначала экспортировать текущие данные
              </Button>
              <div className="dialog-actions">
                <Button
                  variant="secondary"
                  onClick={() => setImportOpen(false)}
                >
                  Отмена
                </Button>
                <Button
                  variant="danger"
                  loading={busy}
                  onClick={() => void replaceData()}
                >
                  Заменить библиотеку
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
