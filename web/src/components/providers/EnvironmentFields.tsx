import { CloseIcon, PlusIcon } from "../icons/marks.tsx";

export type Variable = { key: string; value: string };

export function toVariables(environment: Record<string, string>): Variable[] {
  return Object.entries(environment).map(([key, value]) => ({ key, value }));
}

export function toEnvironment(variables: Variable[]): Record<string, string> {
  return Object.fromEntries(variables.filter(variable => variable.key.trim()).map(variable => [variable.key.trim(), variable.value]));
}

export function EnvironmentFields({ variables, onChange }: { variables: Variable[]; onChange: (variables: Variable[]) => void }) {
  const update = (index: number, patch: Partial<Variable>) => onChange(variables.map((variable, at) => at === index ? { ...variable, ...patch } : variable));
  return (
    <fieldset className="environment-fields">
      <legend>Environment variables</legend>
      {variables.map((variable, index) => (
        <div className="environment-field" key={index}>
          <input aria-label="Name" value={variable.key} placeholder="NAME" spellCheck={false} autoComplete="off" onChange={event => update(index, { key: event.target.value })} />
          <input aria-label="Value" value={variable.value} placeholder="value" spellCheck={false} autoComplete="off" onChange={event => update(index, { value: event.target.value })} />
          <button type="button" className="icon-btn" aria-label={`Remove ${variable.key || "variable"}`} onClick={() => onChange(variables.filter((_, at) => at !== index))}><CloseIcon size={14} /></button>
        </div>
      ))}
      <button type="button" className="btn" data-variant="ghost" onClick={() => onChange([...variables, { key: "", value: "" }])}><PlusIcon size={14} />Add variable</button>
    </fieldset>
  );
}
