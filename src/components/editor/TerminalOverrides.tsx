import type { TerminalProject } from "../../domain/project";

export function TerminalOverrides({ project }: { project: TerminalProject }) {
  const preserved = project.document.filter(
    (node) =>
      project.unmappedNodeIds.includes(node.id) ||
      node.kind === "unknown-setting" ||
      node.kind === "include" ||
      node.kind === "malformed",
  );
  return (
    <div className="preserved-settings">
      <p>
        Terminal-specific and unsupported content is preserved verbatim. These
        settings are read-only.
      </p>
      {preserved.length ? (
        <ul>
          {preserved.map((node) => (
            <li key={node.id}>
              <span>
                Line {node.originalLine} · {node.kind}
              </span>
              <code>{node.originalText}</code>
            </li>
          ))}
        </ul>
      ) : (
        <p>No unmapped lines in this draft.</p>
      )}
      {Object.keys(project.overrides).length ? (
        <pre>{JSON.stringify(project.overrides, null, 2)}</pre>
      ) : null}
    </div>
  );
}
