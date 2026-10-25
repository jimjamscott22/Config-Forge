import { getAdapter } from "../../adapters/registry";
import type { DocumentNode } from "../../domain/document-node";
import type { TerminalProject } from "../../domain/project";
import { isPreservedNode } from "./source-reconcile";

type Group = "terminal-specific" | "unknown" | "malformed" | "include";

const groupTitles: Record<Group, string> = {
  "terminal-specific": "Terminal-specific",
  unknown: "Unknown",
  malformed: "Malformed",
  include: "Include / directive",
};

function groupOf(node: DocumentNode): Group {
  return node.kind === "unknown-setting"
    ? "unknown"
    : node.kind === "malformed"
      ? "malformed"
      : node.kind === "include"
        ? "include"
        : "terminal-specific";
}

export function UnmappedSettings({ project }: { project: TerminalProject }) {
  const preserved = project.document.filter((node) =>
    isPreservedNode(node, project.unmappedNodeIds),
  );
  const omitted = getAdapter(project.terminal).extractPortable(project).omitted;
  const hasOverrides = Object.keys(project.overrides).length > 0;
  return (
    <div className="preserved-settings">
      <p>
        Terminal-specific and unsupported content is preserved verbatim. These
        settings are read-only.
      </p>
      {preserved.length || hasOverrides ? (
        (Object.keys(groupTitles) as Group[]).map((group) => {
          const nodes = preserved.filter((node) => groupOf(node) === group);
          const showOverrides = group === "terminal-specific" && hasOverrides;
          if (!nodes.length && !showOverrides) return null;
          return (
            <section key={group} className="unmapped-group">
              <h3>
                {groupTitles[group]} ({nodes.length})
              </h3>
              <ul>
                {nodes.map((node) => (
                  <li key={node.id}>
                    <span>
                      Line {node.originalLine} · {node.kind}
                    </span>
                    <code>{node.originalText}</code>
                  </li>
                ))}
              </ul>
              {showOverrides ? (
                <pre>{JSON.stringify(project.overrides, null, 2)}</pre>
              ) : null}
            </section>
          );
        })
      ) : (
        <p>No unmapped lines in this draft.</p>
      )}
      {omitted.length ? (
        <section className="unmapped-group unmapped-translation">
          <h3>Translation-only warning ({omitted.length})</h3>
          <p>
            These settings are kept in this {project.terminal} config but will
            not carry over if you translate the project to another terminal.
          </p>
          <ul>
            {omitted.map((item) => (
              <li key={item.key}>
                <span>{item.reason}</span>
                <code>{item.key}</code>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
