import { useEffect, useMemo, useState } from "react";
import { FloatingDock, PixelIcon, Toast } from "@wakukiku/wak-ui";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, ensureSettings } from "./lib/db";
import { HomePage } from "./pages/HomePage";
import { LibraryPage } from "./pages/LibraryPage";
import { WorkPage } from "./pages/WorkPage";
import { RememberPage } from "./pages/RememberPage";
import { SettingsPage } from "./pages/SettingsPage";
import { AddWorkDialog } from "./components/AddWorkDialog";
import type { ThemeMode } from "./types";

export type Notify = (
  title: string,
  tone?: "neutral" | "success" | "warning" | "danger",
  description?: string,
) => void;

function useTheme(theme: ThemeMode) {
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      (document.documentElement.dataset.wakTheme =
        theme === "system" ? (media.matches ? "dark" : "light") : theme);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
}

export function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const settings = useLiveQuery(() => db.settings.get("settings"));
  const [addOpen, setAddOpen] = useState(false);
  const [toast, setToast] = useState<{
    open: boolean;
    title: string;
    tone: "neutral" | "success" | "warning" | "danger";
    description?: string;
  }>({ open: false, title: "", tone: "neutral" });
  useEffect(() => {
    void ensureSettings();
  }, []);
  useTheme(settings?.theme ?? "system");

  const notify: Notify = (title, tone = "neutral", description) =>
    setToast({ open: true, title, tone, description });
  const activeId =
    location.pathname.startsWith("/library") ||
    location.pathname.startsWith("/work") ||
    location.pathname.startsWith("/remember")
      ? "library"
      : location.pathname.startsWith("/settings")
        ? "settings"
        : "home";
  const items = useMemo(
    () => [
      { id: "home", label: "Главная", icon: <PixelIcon name="patterns" /> },
      {
        id: "library",
        label: "Библиотека",
        icon: <PixelIcon name="components" />,
      },
      {
        id: "settings",
        label: "Настройки",
        icon: <PixelIcon name="theming" />,
      },
    ],
    [],
  );
  const onDock = (id: string) => navigate(id === "home" ? "/" : `/${id}`);

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => navigate("/")}>
          <span>Where Was I?</span>
        </button>
        <nav className="dock-wrap" aria-label="Основная навигация">
          <FloatingDock
            items={items}
            activeId={activeId}
            onActiveChange={onDock}
            ariaLabel="Основная навигация"
          />
        </nav>
      </header>
      <main className="app-main">
        <Routes>
          <Route
            path="/"
            element={
              <HomePage notify={notify} onAdd={() => setAddOpen(true)} />
            }
          />
          <Route
            path="/library"
            element={
              <LibraryPage notify={notify} onAdd={() => setAddOpen(true)} />
            }
          />
          <Route path="/work/:id" element={<WorkPage notify={notify} />} />
          <Route
            path="/remember/:id"
            element={<RememberPage notify={notify} />}
          />
          <Route path="/settings" element={<SettingsPage notify={notify} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="app-footer">
        <a
          className="author-tag"
          href="https://github.com/wakukiku"
          target="_blank"
          rel="noopener noreferrer"
        >
          wakukiku
        </a>
      </footer>
      <AddWorkDialog open={addOpen} onOpenChange={setAddOpen} notify={notify} />
      <Toast
        open={toast.open}
        title={toast.title}
        description={toast.description}
        tone={toast.tone}
        duration={4200}
        onOpenChange={(open) => setToast((prev) => ({ ...prev, open }))}
        closeLabel="Закрыть"
      />
    </div>
  );
}
