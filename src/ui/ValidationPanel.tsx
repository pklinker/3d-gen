import type { ValidationResult } from "../contract/validate";
import type { ConformReport } from "../generation/conform";

interface Props {
  result: ValidationResult | null;
  report: ConformReport | null;
}

export default function ValidationPanel({ result, report }: Props) {
  if (!result) return <div className="muted">Generate a mesh to validate.</div>;
  return (
    <div className="validation">
      <ul>
        {result.checks.map((c) => (
          <li key={c.label} className={c.pass ? "ok" : "bad"}>
            <span className="mark">{c.pass ? "✓" : "✗"}</span>
            <span className="lbl">{c.label}</span>
            <span className="detail">{c.detail}</span>
          </li>
        ))}
      </ul>
      <div className={result.allPass ? "summary ok" : "summary bad"}>
        {result.allPass ? "Contract satisfied" : "Fix issues before export"}
      </div>
      {report && (
        <div className="report muted">
          conform: tris {report.triBefore} → {report.triAfter}
          {report.decimated ? " (decimated)" : ""} · scale ×
          {report.scaleApplied.toFixed(3)} · base drop {report.baseDrop.toFixed(3)}
        </div>
      )}
    </div>
  );
}
