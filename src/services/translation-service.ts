import { getAdapter } from "../adapters/registry";
import type { TerminalProject } from "../domain/project";
import type { SharedConfig, TerminalId } from "../domain/shared-config";
import type {
  TranslationReport,
  TranslationReportItem,
} from "../domain/translation";

function createEmptySharedConfig(): SharedConfig {
  return {
    font: {
      family: null,
      boldFamily: null,
      italicFamily: null,
      boldItalicFamily: null,
      size: null,
    },
    colors: {
      foreground: null,
      background: null,
      cursor: null,
      cursorText: null,
      selectionBackground: null,
      selectionForeground: null,
      ansi: {},
    },
    window: {
      opacity: null,
      paddingX: null,
      paddingY: null,
      decorations: null,
    },
    cursor: {
      shape: null,
      blink: null,
    },
    behavior: {
      scrollbackLines: null,
      visualBell: null,
      attentionOnBell: null,
      copyOnSelect: null,
      middleClickPaste: null,
      confirmClose: null,
    },
  };
}

function getAtPath(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((accumulator, key) => {
    if (accumulator === null || typeof accumulator !== "object") {
      return undefined;
    }
    return (accumulator as Record<string, unknown>)[key];
  }, source);
}

function setAtPath(target: SharedConfig, path: string, value: unknown): void {
  const segments = path.split(".");
  const lastSegment = segments.pop();
  if (lastSegment === undefined) {
    return;
  }

  let cursor: Record<string, unknown> = target as unknown as Record<
    string,
    unknown
  >;
  for (const segment of segments) {
    cursor = cursor[segment] as Record<string, unknown>;
  }
  cursor[lastSegment] = value;
}

export function translateProject(
  source: TerminalProject,
  destinationTerminal: TerminalId,
  name: string,
): { project: TerminalProject; report: TranslationReport } {
  const sourceAdapter = getAdapter(source.terminal);
  const destinationAdapter = getAdapter(destinationTerminal);

  const sourcePaths = new Set(sourceAdapter.supportedSharedPaths());
  const destinationPaths = new Set(destinationAdapter.supportedSharedPaths());
  const allPaths = new Set([...sourcePaths, ...destinationPaths]);

  const destinationShared = createEmptySharedConfig();
  const items: TranslationReportItem[] = [];

  for (const modelPath of allPaths) {
    if (!destinationPaths.has(modelPath)) {
      items.push({
        modelPath,
        status: "omitted",
        sourceValue: getAtPath(source.shared, modelPath),
        destinationValue: null,
        explanation: `${destinationTerminal} has no equivalent setting for ${modelPath}.`,
      });
      continue;
    }

    if (!sourcePaths.has(modelPath)) {
      items.push({
        modelPath,
        status: "defaulted",
        sourceValue: undefined,
        destinationValue: null,
        explanation: `${source.terminal} has no equivalent setting for ${modelPath}; ${destinationTerminal} keeps its default.`,
      });
      continue;
    }

    const sourceValue = getAtPath(source.shared, modelPath);

    if (sourceValue === null) {
      items.push({
        modelPath,
        status: "exact",
        sourceValue: null,
        destinationValue: null,
        explanation: `${modelPath} is unset and stays unset.`,
      });
      continue;
    }

    setAtPath(destinationShared, modelPath, sourceValue);
    items.push({
      modelPath,
      status: "exact",
      sourceValue,
      destinationValue: sourceValue,
      explanation: `${modelPath} is supported identically by ${destinationTerminal}.`,
    });
  }

  const now = new Date().toISOString();
  const draft: TerminalProject = {
    id: crypto.randomUUID(),
    name,
    terminal: destinationTerminal,
    shared: destinationShared,
    overrides: destinationAdapter.createOverrides(),
    sourcePath: null,
    destinationPath: null,
    createdAt: now,
    updatedAt: now,
    document: [],
    unmappedNodeIds: [],
  };

  const generated = destinationAdapter.generate(draft);
  const parsed = destinationAdapter.parse(generated.source);

  const project: TerminalProject = {
    ...draft,
    shared: parsed.shared,
    overrides: parsed.overrides,
    document: parsed.document,
    unmappedNodeIds: parsed.unmappedNodeIds,
  };

  return {
    project,
    report: {
      sourceTerminal: source.terminal,
      destinationTerminal,
      items: items.sort((a, b) => a.modelPath.localeCompare(b.modelPath)),
    },
  };
}
