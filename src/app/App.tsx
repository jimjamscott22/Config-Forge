import { isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "../components/layout/AppShell";
import {
  createStudioWorkflows,
  type StudioWorkflows,
} from "../services/studio-workflows";
import { createTemplateService } from "../services/template-service";
import { projectStore } from "../state/project-store";
import { AppRoutes, type AppRoutesProps } from "./routes";
import { loadStartupData, type StartupData } from "./startup";

export interface AppProps extends AppRoutesProps {
  /** Replaces desktop startup; used by tests. Defaults to the Tauri loader when running in the desktop shell. */
  startup?: () => Promise<StartupData>;
}

type StartupState =
  | { status: "loading" }
  | { status: "ready"; data: StartupData }
  | { status: "failed"; error: string };

export function App({ startup, ...props }: AppProps) {
  const load = startup ?? (isTauri() ? loadStartupData : undefined);
  // Browser sessions (development and e2e) have no database: drafts stay in memory.
  if (!load) return <AppRoutes {...props} />;
  return <DesktopApp load={load} {...props} />;
}

function DesktopApp({
  load,
  ...props
}: AppRoutesProps & { load: () => Promise<StartupData> }) {
  const [state, setState] = useState<StartupState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    load().then(
      (data) => {
        if (!active) return;
        (props.store ?? projectStore).setState({
          projects: data.recentProjects,
        });
        setState({ status: "ready", data });
      },
      (error: unknown) => {
        if (active)
          setState({
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
          });
      },
    );
    return () => {
      active = false;
    };
    // The loader is intentionally re-run only by Retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);
  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((value) => value + 1);
  }, []);

  if (state.status === "loading") {
    return (
      <AppShell onHome={() => undefined}>
        <p role="status">Starting Config Forge…</p>
      </AppShell>
    );
  }
  if (state.status === "failed") {
    return (
      <AppShell onHome={() => undefined}>
        <section className="panel" aria-labelledby="startup-error">
          <h1 id="startup-error">Config Forge could not start</h1>
          <p className="error-message" role="alert">
            {state.error}
          </p>
          <p className="muted">
            Nothing was changed. Your saved projects and backups are untouched.
          </p>
          <button className="button" type="button" onClick={retry}>
            Try again
          </button>
        </section>
      </AppShell>
    );
  }
  return <ReadyApp data={state.data} {...props} />;
}

function ReadyApp({ data, ...props }: AppRoutesProps & { data: StartupData }) {
  const workflows = useMemo<StudioWorkflows>(
    () => props.workflows ?? createStudioWorkflows(data.paths),
    [props.workflows, data.paths],
  );
  const templateService = useMemo(
    () => props.templateService ?? createTemplateService(),
    [props.templateService],
  );
  const loadInstallations = useCallback(async () => {
    if (data.detectionError) throw new Error(data.detectionError);
    return data.detectedTerminals;
  }, [data]);
  return (
    <AppRoutes
      {...props}
      workflows={workflows}
      templateService={templateService}
      loadInstallations={props.loadInstallations ?? loadInstallations}
    />
  );
}
