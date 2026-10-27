import type { TranslationReport } from "../../domain/translation";

const labels = {
  exact: "Exact",
  approximate: "Approximate",
  omitted: "Omitted",
  defaulted: "Defaulted",
} as const;

function show(value: unknown) {
  return value === undefined || value === null ? "—" : JSON.stringify(value);
}

export function TranslationReportView({
  report,
}: {
  report: TranslationReport;
}) {
  const counts = report.items.reduce<Record<string, number>>((all, item) => {
    all[item.status] = (all[item.status] ?? 0) + 1;
    return all;
  }, {});
  return (
    <section className="translation-report" aria-label="Translation report">
      <h3>
        {report.sourceTerminal} → {report.destinationTerminal}
      </h3>
      <p role="status">
        {Object.entries(counts)
          .map(([status, count]) => `${count} ${status}`)
          .join(" · ") || "Nothing to translate."}
      </p>
      <ul>
        {report.items
          .filter((item) => item.status !== "exact")
          .map((item) => (
            <li key={item.modelPath}>
              <strong>{labels[item.status]}</strong>{" "}
              <code>{item.modelPath}</code>: {item.explanation} (source{" "}
              {show(item.sourceValue)})
            </li>
          ))}
      </ul>
    </section>
  );
}
