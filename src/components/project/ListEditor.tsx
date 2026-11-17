import { useId } from "react";

/** Editors for the repeating parts of a project page (team, milestones, accounts rows…). */

export interface Field<T> {
  key: keyof T & string;
  label: string;
  type?: "text" | "number" | "textarea";
  placeholder?: string;
  /** Tailwind grid column width, e.g. "sm:w-32". */
  width?: string;
}

export function ListEditor<T extends object>({
  items, onChange, fields, blank, addLabel, emptyText,
}: {
  items: T[]; onChange: (items: T[]) => void; fields: Field<T>[]; blank: () => T; addLabel: string; emptyText?: string;
}) {
  const base = useId();
  const set = (i: number, key: keyof T, value: unknown) => onChange(items.map((row, j) => (j === i ? { ...row, [key]: value } : row)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...items];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {items.length === 0 && emptyText && <p className="text-sm text-slate-500">{emptyText}</p>}
      {items.map((row, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-start">
          <div className="grid flex-1 gap-2 sm:flex sm:flex-wrap">
            {fields.map((f) => {
              const id = `${base}-${i}-${f.key}`;
              const value = (row as Record<string, unknown>)[f.key];
              const common = {
                id, className: "input", placeholder: f.placeholder,
                value: value == null ? "" : String(value),
              };
              return (
                <div key={f.key} className={`min-w-0 ${f.width ?? "sm:flex-1"}`}>
                  <label htmlFor={id} className="mb-0.5 block text-xs font-medium text-slate-500">{f.label}</label>
                  {f.type === "textarea" ? (
                    <textarea {...common} rows={2} onChange={(e) => set(i, f.key, e.target.value)} />
                  ) : f.type === "number" ? (
                    <input {...common} type="number" inputMode="numeric" onChange={(e) => set(i, f.key, e.target.value === "" ? 0 : Number(e.target.value))} />
                  ) : (
                    <input {...common} onChange={(e) => set(i, f.key, e.target.value)} />
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex gap-1 sm:flex-col sm:pt-4">
            <button type="button" className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
            <button type="button" className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-30" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
            <button type="button" className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Remove">Remove</button>
          </div>
        </div>
      ))}
      <button type="button" className="btn-secondary" onClick={() => onChange([...items, blank()])}>+ {addLabel}</button>
    </div>
  );
}

/** A list of short texts (highlights, extra commitments). */
export function TextList({ items, onChange, addLabel, placeholder, label }: {
  items: string[]; onChange: (items: string[]) => void; addLabel: string; placeholder: string; label: string;
}) {
  return (
    <ListEditor
      items={items.map((text) => ({ text }))}
      onChange={(rows) => onChange(rows.map((r) => r.text))}
      fields={[{ key: "text", label, placeholder }]}
      blank={() => ({ text: "" })}
      addLabel={addLabel}
    />
  );
}
