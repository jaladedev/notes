// Small inline SVG icons for the table-editing controls in NoteToolbar
// (via NoteEditor's floating table menu). Not ported from school_app --
// it used a third-party icon set this app doesn't depend on. Kept as
// plain 16x16 stroke icons, no extra dependency.

type IconProps = { className?: string };

const base = "h-4 w-4";

export function AddRowAboveIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className={className}>
      <path d="M8 1v6M5.5 4.5 8 2l2.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="2" y="9" width="12" height="5" rx="0.5" />
      <path d="M2 11.5h12" />
    </svg>
  );
}

export function AddRowBelowIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className={className}>
      <path d="M8 15V9M5.5 11.5 8 14l2.5-2.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="2" y="2" width="12" height="5" rx="0.5" />
      <path d="M2 4.5h12" />
    </svg>
  );
}

export function DeleteRowIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className={className}>
      <rect x="1.5" y="5.5" width="13" height="5" rx="0.5" />
      <path d="M1.5 8h13" />
      <path d="M6 2.5l4 4M10 2.5l-4 4" strokeLinecap="round" />
    </svg>
  );
}

export function AddColLeftIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className={className}>
      <path d="M1 8h6M4.5 5.5 2 8l2.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="9" y="2" width="5" height="12" rx="0.5" />
      <path d="M11.5 2v12" />
    </svg>
  );
}

export function AddColRightIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className={className}>
      <path d="M15 8H9M11.5 5.5 14 8l-2.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="2" y="2" width="5" height="12" rx="0.5" />
      <path d="M4.5 2v12" />
    </svg>
  );
}

export function DeleteColIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className={className}>
      <rect x="5.5" y="1.5" width="5" height="13" rx="0.5" />
      <path d="M8 1.5v13" />
      <path d="M2.5 6l4 4M6.5 6l-4 4" strokeLinecap="round" />
    </svg>
  );
}

export function MergeCellsIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className={className}>
      <rect x="1.5" y="1.5" width="13" height="13" rx="0.5" />
      <path d="M8 1.5v13M4 6l-2 2 2 2M12 6l2 2-2 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SplitCellIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className={className}>
      <rect x="1.5" y="1.5" width="13" height="13" rx="0.5" />
      <path d="M8 1.5v13" strokeDasharray="2 1.5" />
      <path d="M5 6 3 8l2 2M11 6l2 2-2 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function HeaderRowIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className={className}>
      <rect x="1.5" y="2.5" width="13" height="11" rx="0.5" />
      <path d="M1.5 6h13" />
      <rect x="1.5" y="2.5" width="13" height="3.5" fill="currentColor" opacity="0.25" stroke="none" />
    </svg>
  );
}

export function DeleteTableIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className={className}>
      <rect x="1.5" y="1.5" width="9" height="9" rx="0.5" />
      <path d="M1.5 5h9M5 1.5v9" />
      <path d="M10.5 10.5l4 4M14.5 10.5l-4 4" strokeLinecap="round" />
    </svg>
  );
}
