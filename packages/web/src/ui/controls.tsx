import type { ReactNode } from 'react';
import { errorMessage } from '../api/client';
import { ChevronLeft } from './icons';
import { Link } from '../lib/router';

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}

/** 버튼 몇 개 중 하나를 고르는 컨트롤. 선택 상태는 aria-pressed로 알린다. */
export function Segmented<T extends string>({ label, value, options, onChange, disabled }: SegmentedProps<T>) {
  return (
    <div role="group" aria-label={label} className="segmented">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function SectionGroup({ title, hint, children }: { title?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="section-group">
      {title && <h2 className="section-title">{title}</h2>}
      {children}
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" role="switch" aria-label={label} checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span />
    </label>
  );
}

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="back-link">
      <ChevronLeft size={22} />
      {children}
    </Link>
  );
}

export function ErrorAlert({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p role="alert" className="alert">
      {errorMessage(error)}
    </p>
  );
}

export function Loading() {
  return <p className="loading">불러오는 중…</p>;
}
