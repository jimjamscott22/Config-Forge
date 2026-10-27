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
import type { TemplateService } from "../services/template-service";
import { detectTerminals } from "../services/tauri-client";
import { builtinTemplates } from "../templates/builtins";
import { projectStore, type createProjectStore } from "../state/project-store";
import type { StudioWorkflows } from "../services/studio-workflows";
import { ProjectActions } from "../components/workflows/ProjectActions";

export type AppRoute =
  | { page: "home" }
  | { page: "studio" }
  | {
      page: "create" | "import";
      terminal: TerminalId;
      template?: ConfigTemplate;
    };
export interface AppRoutesProps {
  store?: ReturnType<typeof createProjectStore>;
  templates?: readonly ConfigTemplate[];
  /** Enables personal templates; omitted until desktop persistence is wired. */
  templateService?: TemplateService;
  loadInstallations?: () => Promise<DetectedInstallation[]>;
  /** Enables Save, Apply, export, translation, and history; supplied by desktop startup. */
  workflows?: StudioWorkflows;
}

export function AppRoutes({
  store = projectStore,
  templates = builtinTemplates,
  templateService,
  loadInstallations = isTauri() ? detectTerminals : undefined,
  workflows,
}: AppRoutesProps) {
  const [route, setRoute] = useState<AppRoute>({ page: "home" });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
  const persisted = useStore(store, (state) => state.persisted);
  const dirty = useStore(store, (state) => state.dirty);
  const snapshots = useStore(store, (state) => state.snapshots);
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
    setNotice(null);
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
      {notice ? <p role="status">{notice}</p> : null}
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
          templates={[...templates]}
          templateService={templateService}
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
          onSaveAsTemplate={
            templateService
              ? (project) => {
                  setNotice(null);
                  templateService
                    .createFromProject(project, `${project.name} template`)
                    .then((saved) =>
                      setNotice(`Saved template "${saved.name}".`),
                    )
                    .catch((reason) =>
                      setError(
                        reason instanceof Error
                          ? reason.message
                          : String(reason),
                      ),
                    );
                }
              : undefined
          }
          onProjectChange={(next) => {
            const latest = store.getState().current;
            if (latest?.id === current.id) store.getState().edit(next);
          }}
          persistence={
            workflows
              ? {
                  persisted,
                  dirty,
                  onSave: () => {
                    store
                      .getState()
                      .save()
                      .catch(() => undefined);
                  },
                }
              : undefined
          }
          actions={
            workflows ? (
              <ProjectActions
                project={current}
                workflows={workflows}
                snapshots={snapshots}
                ready={persisted && !dirty && !busy}
                destinationSuggestions={
                  detection.installations.find(
                    (item) => item.terminal === current.terminal,
                  )?.configPaths ?? []
                }
                onApplied={async (destination) => {
                  try {
                    const latest = store.getState().current;
                    if (latest?.id === current.id) {
                      if (latest.destinationPath !== destination) {
                        store
                          .getState()
                          .edit({ ...latest, destinationPath: destination });
                        await store.getState().save();
                      }
                      await store.getState().refreshSnapshots();
                    }
                  } catch (reason) {
                    throw new Error(
                      `The file was written, but the project could not be updated: ${
                        reason instanceof Error
                          ? reason.message
                          : String(reason)
                      }`,
                      { cause: reason },
                    );
                  }
                }}
                onSnapshotsChanged={() => store.getState().refreshSnapshots()}
                onRestored={(restored) => store.getState().adopt(restored)}
                onProjectsChanged={() => {
                  store
                    .getState()
                    .refresh()
                    .catch(() => undefined);
                }}
                onOpenProject={(id) => {
                  void openProject(id);
                }}
              />
            ) : undefined
          }
        />
      ) : route.page === "create" || route.page === "import" ? (
        <ProjectDraftForm
          key={`${route.page}-${route.terminal}-${route.template?.id ?? "blank"}`}
          mode={route.page}
          initialTerminal={route.terminal}
          template={route.template}
          onOpen={openDraft}
          onCancel={home}
          persistent={Boolean(workflows)}
        />
      ) : (
        <p role="status">
          No project is open. Return to the workbench to create a draft.
        </p>
      )}
    </AppShell>
  );
}
