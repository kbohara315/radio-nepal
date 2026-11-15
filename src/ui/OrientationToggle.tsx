import './ui.css'

interface Props {
  rotated: boolean
  onToggle: () => void
}

/** Round button: flip between the rotated landscape scene and real portrait. Only mounted where it applies. */
export function OrientationToggle({ rotated, onToggle }: Props) {
  return (
    <button
      type="button"
      className="strip__btn strip__btn--round orientation-toggle"
      aria-label={rotated ? 'Show portrait' : 'Show landscape'}
      aria-pressed={rotated}
      onClick={onToggle}
      data-rotated={rotated || undefined}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <rect className="orientation-toggle__phone" x="8" y="5" width="8" height="14" rx="1.6" />
        <path d="M5 8.2A8 8 0 0 1 11 3.3M19 15.8A8 8 0 0 1 13 20.7" />
        <path d="M11.2 1.6L11 3.4 9.2 3.9M12.8 22.4L13 20.6 14.8 20.1" />
      </svg>
    </button>
  )
}
