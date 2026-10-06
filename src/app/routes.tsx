import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { useStore } from "zustand";
import type { DetectedInstallation } from "../adapters/terminal-adapter";
import { AppShell } from "../components/layout/AppShell";
import { HomeScreen } from "../components/layout/HomeScreen";
import { ProjectDraftForm } from "../components/layout/ProjectDraftForm";
import { SplitStudio } from "../components/layout/SplitStudio";
import type { TerminalProject } from "../domain/project";
import type { TerminalId } from "../domain/shared-config";
import type { ConfigTemplate } from "../domain/template";
import { detectTerminals } from "../services/tauri-client";
import { projectStore, type createProjectStore } from "../state/project-store";

export type AppRoute =
  | { page: "home" }
  | { page: "studio" }
  | {
      page: "create" | "import";
      terminal: TerminalId;
      template?: ConfigTemplate;
    };
const emptyTemplates: ConfigTemplate[] = [];
export interface AppRoutesProps {
  store?: ReturnType<typeof createProjectStore>;
  templates?: ConfigTemplate[];
  loadInstallations?: () => Promise<DetectedInstallation[]>;
}

export function AppRoutes({
  store = projectStore,
  templates = emptyTemplates,
  loadInstallations = isTauri() ? detectTerminals : undefined,
}: AppRoutesProps) {
  const [route, setRoute] = useState<AppRoute>({ page: "home" });
  const [error, setError] = useState<string | null>(null);
  const [detection, setDetection] = useState<{
    status: "unavailable" | "loading" | "ready" | "failed";
    installations: DetectedInstallation[];
  }>({
    status: loadInstallations ? "loading" : "unavailable",
    installations: [],
  });
  const current = useStore(store, (state) => state.current);
  const projects = useStore(store, (state) => state.projects);
  const busy = useStore(store, (state) => state.busy);
  const storeError = useStore(store, (state) => state.error);
  useEffect(() => {
    if (!loadInstallations) return;
    let active = true;
    loadInstallations()
      .then((installations) => {
        if (active) setDetection({ status: "ready", installations });
      })
      .catch((error) => {
        if (active) {
          setDetection({ status: "failed", installations: [] });
          setError(
            `Terminal detection failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      });
    return () => {
      active = false;
    };
  }, [loadInstallations]);
  useEffect(() => {
    document.getElementById("view-title")?.focus();
  }, [route]);
  function home() {
    setError(null);
    setRoute({ page: "home" });
  }
  function canReplace() {
    return (
      !store.getState().dirty ||
      window.confirm(
        "Replace your current draft? Unsaved changes in this session will be lost.",
      )
    );
  }
  function openDraft(project: TerminalProject) {
    if (!canReplace()) return false;
    store.getState().startDraft(project, true);
    setError(null);
    setRoute({ page: "studio" });
    return true;
  }
  async function openProject(id: string) {
    if (!canReplace()) return;
    setError(null);
    try {
      await store.getState().open(id, true);
      setRoute({ page: "studio" });
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }
  return (
    <AppShell onHome={home}>
      {error || storeError ? (
        <p className="error-message app-error" role="alert">
          {error ?? storeError}
        </p>
      ) : null}
      {route.page === "home" ? (
        <HomeScreen
          projects={projects}
          current={current}
          busy={busy}
          installations={detection.installations}
          detectionStatus={detection.status}
          templates={templates}
          onCreate={(terminal = "ghostty") =>
            setRoute({ page: "create", terminal })
          }
          onImport={() => setRoute({ page: "import", terminal: "ghostty" })}
          onOpen={(id) => {
            void openProject(id);
          }}
          onResume={() => setRoute({ page: "studio" })}
          onTemplate={(template) =>
            setRoute({
              page: "create",
              terminal:
                template.terminal === "portable"
                  ? "ghostty"
                  : template.terminal,
              template,
            })
          }
        />
      ) : route.page === "studio" && current ? (
        <SplitStudio
          project={current}
          projects={projects}
          busy={busy}
          onOpen={(id) => {
            void openProject(id);
          }}
          onHome={home}
          onSharedChange={(shared) => {
            const latest = store.getState().current;
            if (latest?.id === current.id) {
              store.getState().edit({
                ...latest,
                shared,
                updatedAt: new Date().toISOString(),
              });
            }
          }}
        />
      ) : route.page === "create" || route.page === "import" ? (
        <ProjectDraftForm
          key={`${route.page}-${route.terminal}-${route.template?.id ?? "blank"}`}
          mode={route.page}
          initialTerminal={route.terminal}
          template={route.template}
          onOpen={openDraft}
          onCancel={home}
        />
      ) : (
        <p role="status">
          No project is open. Return to the workbench to create a draft.
        </p>
      )}
    </AppShell>
  );
}
