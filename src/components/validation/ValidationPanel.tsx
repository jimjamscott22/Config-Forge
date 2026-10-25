import type {
  ValidationIssue,
  ValidationSeverity,
} from "../../domain/validation";

const groups: Array<{ severity: ValidationSeverity; title: string }> = [
  { severity: "error", title: "Errors" },
  { severity: "warning", title: "Warnings" },
  { severity: "info", title: "Information" },
];

export function ValidationPanel({ issues }: { issues: ValidationIssue[] }) {
  const blocking = issues.some((issue) => issue.severity === "error");
  return (
    <>
      <div className="workspace-heading">
        <h2>Validation</h2>
        <span>{blocking ? "Needs attention" : "No blocking issues"}</span>
      </div>
      {issues.length ? (
        groups.map(({ severity, title }) => {
          const items = issues.filter((issue) => issue.severity === severity);
          if (!items.length) return null;
          return (
            <section key={severity} className="validation-group">
              <h3>
                {title} ({items.length})
              </h3>
              <ul className="validation-list">
                {items.map((issue, index) => (
                  <li
                    key={`${issue.id}-${index}`}
                    className={`issue-${issue.severity}`}
                  >
                    <strong>
                      {issue.severity}
                      {issue.sourceLine ? ` · line ${issue.sourceLine}` : ""}
                    </strong>
                    <p>{issue.message}</p>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      ) : (
        <div className="empty-state">
          <strong>Internal checks passed.</strong>
          <p>Native validation runs before applying a config.</p>
        </div>
      )}
    </>
  );
}
