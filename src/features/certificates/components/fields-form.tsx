import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { asText, type FieldDef, type Values } from "../model";
import { dateDe } from "@/features/export/pdf/text";

/** Formularfelder in Gruppen; Pflichtfelder mit Stern. */
export function FieldsForm({ fields, values, onChange, required, disabled, idPrefix }: {
  fields: FieldDef[]; values: Values; onChange: (key: string, v: string) => void; required: string[]; disabled?: boolean; idPrefix: string;
}) {
  const groups = [...new Set(fields.map((f) => f.group))];
  return <div className="space-y-6">
    {groups.map((g) => <fieldset key={g} className="space-y-4">
      <legend className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{g}</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.filter((f) => f.group === g).map((f) => {
          const id = `${idPrefix}-${f.key}`;
          const req = required.includes(f.key);
          return <div key={f.key} className={f.type === "textarea" ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}>
            <Label htmlFor={id}>{f.label}{req && <span className="text-destructive"> *</span>}</Label>
            {f.type === "textarea"
              ? <Textarea id={id} value={asText(values[f.key])} onChange={(e) => onChange(f.key, e.target.value)} disabled={disabled} rows={5} maxLength={8000} />
              : <Input id={id} type={f.type === "date" ? "date" : "text"} value={asText(values[f.key])} onChange={(e) => onChange(f.key, e.target.value)} disabled={disabled} maxLength={300} className="h-11" />}
            {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
          </div>;
        })}
      </div>
    </fieldset>)}
  </div>;
}

/** Nur-Lese-Ansicht derselben Felder. */
export function FieldsView({ fields, values }: { fields: FieldDef[]; values: Values }) {
  const groups = [...new Set(fields.map((f) => f.group))];
  return <div className="space-y-6">
    {groups.map((g) => {
      const items = fields.filter((f) => f.group === g && asText(values[f.key]).trim());
      if (!items.length) return null;
      return <section key={g} className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{g}</h3>
        <dl className="grid gap-3 sm:grid-cols-2">
          {items.map((f) => <div key={f.key} className={f.type === "textarea" ? "sm:col-span-2" : undefined}>
            <dt className="text-xs text-muted-foreground">{f.label}</dt>
            <dd className="whitespace-pre-wrap break-words text-sm">{f.type === "date" ? dateDe(asText(values[f.key])) : asText(values[f.key])}</dd>
          </div>)}
        </dl>
      </section>;
    })}
  </div>;
}
