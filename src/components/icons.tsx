// Small drawn icons for Moot. Decorative unless labelled by their button.

export function GavelIcon(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" {...props}>
      <rect x="8.5" y="2.8" width="9" height="5" rx="1" transform="rotate(45 13 5.3)" />
      <path d="M10.6 10.4 3.5 17.5" />
      <path d="M13 20.5h8" />
    </svg>
  );
}

export function MicIcon(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" {...props}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </svg>
  );
}

export function SendIcon(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" {...props}>
      <path d="M5 12h12M12 6l6 6-6 6" />
    </svg>
  );
}

/** The ink texture used by the rubber stamp. Rendered once per page. */
export function InkFilter() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <filter id="ink" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="2" result="rough" />
        <feTurbulence type="fractalNoise" baseFrequency="0.35" numOctaves="1" seed="3" result="blots" />
        <feColorMatrix in="blots" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.3 1.55" result="mask" />
        <feComposite in="rough" in2="mask" operator="in" />
      </filter>
    </svg>
  );
}
