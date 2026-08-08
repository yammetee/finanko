interface ChoiceGroupProps {
  label: string;
  value?: string;
  options: Array<{ value: string; label: React.ReactNode }>;
  onChange?: (value: string) => void;
}

export function ChoiceGroup({ label, value, options, onChange }: ChoiceGroupProps) {
  return <div className="choice-group" role="group" aria-label={label}><span>{label}</span><div>{options.map((option) => <button aria-pressed={value === option.value} className={value === option.value ? "active" : ""} key={option.value} type="button" onClick={() => onChange?.(option.value)}>{option.label}</button>)}</div></div>;
}
