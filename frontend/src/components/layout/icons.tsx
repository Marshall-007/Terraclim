import type { SVGProps } from 'react';

type IconName =
  | 'map'
  | 'plan'
  | 'droplet'
  | 'crosshair'
  | 'slip'
  | 'scenario'
  | 'backtest'
  | 'print'
  | 'share'
  | 'location'
  | 'chevron-right'
  | 'chevron-left'
  | 'close'
  | 'info'
  | 'arrow-up'
  | 'arrow-down'
  | 'check'
  | 'sun'
  | 'refresh';

const PATHS: Record<IconName, JSX.Element> = {
  map: (
    <>
      <path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4Z" />
      <path d="M9 4v13M15 6.5v13" />
    </>
  ),
  plan: (
    <>
      <path d="M8 6h12M8 12h12M8 18h12" />
      <path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
    </>
  ),
  droplet: <path d="M12 3.5c-3.5 4.2-5.5 7-5.5 9.5a5.5 5.5 0 0 0 11 0c0-2.5-2-5.3-5.5-9.5Z" />,
  crosshair: (
    <>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),
  slip: (
    <>
      <path d="M6 3h9l3 3v15l-2-1.2L14 21l-2-1.2L10 21l-2-1.2L6 21V3Z" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </>
  ),
  scenario: (
    <>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="8" cy="17" r="2" />
    </>
  ),
  backtest: (
    <>
      <path d="M3 3v18h18" />
      <path d="M6 15l4-5 3 3 5-7" />
    </>
  ),
  print: (
    <>
      <path d="M7 9V3h10v6" />
      <path d="M5 9h14a2 2 0 0 1 2 2v6h-4v4H7v-4H3v-6a2 2 0 0 1 2-2Z" />
      <path d="M7 17h10" />
    </>
  ),
  share: (
    <>
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M8.2 10.8 15.8 7.2M8.2 13.2l7.6 3.6" />
    </>
  ),
  location: (
    <>
      <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  'chevron-right': <path d="m9 5 7 7-7 7" />,
  'chevron-left': <path d="m15 5-7 7 7 7" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8v.01" />
    </>
  ),
  'arrow-up': <path d="M12 19V5M6 11l6-6 6 6" />,
  'arrow-down': <path d="M12 5v14M6 13l6 6 6-6" />,
  check: <path d="m5 12 5 5 9-11" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11a8 8 0 1 0-.9 4.5" />
      <path d="M20 5v6h-6" />
    </>
  ),
};

export function Icon({
  name,
  size = 20,
  ...rest
}: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}

export type { IconName };
