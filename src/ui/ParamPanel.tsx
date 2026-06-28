import type { ParamSpec, ParamValues } from "../types";

interface Props {
  specs: ParamSpec[];
  values: ParamValues;
  onChange: (key: string, value: number | boolean | string) => void;
}

export default function ParamPanel({ specs, values, onChange }: Props) {
  return (
    <div className="params">
      {specs.map((s) => (
        <div className="param-row" key={s.key}>
          <label>{s.label}</label>
          {s.kind === "bool" ? (
            <input
              type="checkbox"
              checked={Boolean(values[s.key])}
              onChange={(e) => onChange(s.key, e.target.checked)}
            />
          ) : s.kind === "color" ? (
            <input
              type="color"
              value={String(values[s.key])}
              onChange={(e) => onChange(s.key, e.target.value)}
            />
          ) : (
            <div className="slider">
              <input
                type="range"
                min={s.min}
                max={s.max}
                step={s.step ?? (s.kind === "int" ? 1 : 0.01)}
                value={Number(values[s.key])}
                onChange={(e) => onChange(s.key, Number(e.target.value))}
              />
              <span className="val">
                {s.kind === "int"
                  ? Number(values[s.key])
                  : Number(values[s.key]).toFixed(2)}
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
