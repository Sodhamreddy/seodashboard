import type { SVGProps } from 'react';

/** Single stroke-based icon set so every glyph shares weight and cap style. */
const PATHS = {
  home: 'M3 10.7 12 4l9 6.7V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  tag: 'M3 12.5V5a2 2 0 0 1 2-2h7.5L21 11.5 13 20zM7.5 7.5h.01',
  code: 'm9 18-6-6 6-6m6 0 6 6-6 6',
  gauge: 'M4.2 18a9 9 0 1 1 15.6 0M12 12l3.8-3.2',
  sitemap:
    'M9 3h6v4H9zM3 17h5v4H3zm13 0h5v4h-5zM12 7v4M5.5 17v-2.5h13V17',
  link: 'M9.5 14.5a4.5 4.5 0 0 0 6.4 0l2.6-2.6a4.5 4.5 0 0 0-6.4-6.4l-1 1m-1 4a4.5 4.5 0 0 0-6.4 0L1.1 13.1a4.5 4.5 0 0 0 6.4 6.4l1-1',
  bars: 'M4 20V11m5 9V5m5 15v-6m5 6V8M3 20.5h18',
  bell: 'M18 8.5a6 6 0 1 0-12 0c0 6.5-2.5 8.5-2.5 8.5h17S18 15 18 8.5M13.7 20.5a2 2 0 0 1-3.4 0',
  search: 'm21 21-5.3-5.3M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0',
  logout: 'M15 21h4a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-4M10 17l-5-5 5-5M5 12h11',
  sun: 'M12 4V2m0 20v-2m8-8h2M2 12h2m13.7-5.7 1.4-1.4M4.9 19.1l1.4-1.4m11.4 0 1.4 1.4M4.9 4.9l1.4 1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5',
  copy: 'M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
  check: 'm4.5 12.5 5 5 10-11',
  close: 'M6 6l12 12M18 6 6 18',
  alert: 'M12 3.5 2.5 20.5h19zM12 9.5v4.5m0 3h.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 8h.01M11.5 12h.75v4.5H13',
  arrowUp: 'M12 20V4m0 0-6.5 6.5M12 4l6.5 6.5',
  arrowDown: 'M12 4v16m0 0 6.5-6.5M12 20l-6.5-6.5',
  external: 'M14 3.5h6.5V10M20.5 3.5 11 13M18.5 13.5v5.5a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 19V7.5A1.5 1.5 0 0 1 5.5 6H11',
  download: 'M12 3.5v12m0 0-4.5-4.5M12 15.5l4.5-4.5M4 20h16',
  refresh: 'M20.5 12a8.5 8.5 0 1 1-3.1-6.6M20.5 4v5.5H15',
  shield: 'M12 3 4.5 6v6c0 4.5 3.2 7.8 7.5 9 4.3-1.2 7.5-4.5 7.5-9V6z',
  doc: 'M14 3.5V9h5.5M6.5 3.5h7.5L19.5 9v11a1.5 1.5 0 0 1-1.5 1.5H6.5A1.5 1.5 0 0 1 5 20V5a1.5 1.5 0 0 1 1.5-1.5',
  chevronRight: 'm9.5 6 6 6-6 6',
  chevronDown: 'm6 9.5 6 6 6-6',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13.5h9L17.5 7',
  play: 'M7 4.5 19 12 7 19.5z',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18m0-4.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9M12 12h.01',
  layers: 'm12 3 9 5-9 5-9-5zm9 9-9 5-9-5m18 4-9 5-9-5',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18m0-13v5l3.5 2',
  send: 'M21.5 3.5 2.5 10.5l7 2.5 2.5 7z M21.5 3.5 9.5 13',

  /* Report-builder chrome and widget-kind glyphs. */
  chartLine: 'M3.5 19.5h17M6 15l4-5 3 3 5-7',
  chartArea: 'M3.5 19.5h17M4.5 19.5V13l5-4 4 3 6-7v14.5z',
  donut: 'M12 3a9 9 0 1 0 9 9h-9zm0 5.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7',
  grid: 'M3.5 5.5h17v13h-17zM3.5 10h17M3.5 14.5h17M9.5 10v8.5M15 10v8.5',
  heading: 'M6.5 4.5v15M17.5 4.5v15M6.5 12h11',
  text: 'M4.5 6.5h15M4.5 11.5h15M4.5 16.5h10',
  minus: 'M5 12h14',
  expand: 'M4 9.5V4h5.5M20 14.5V20h-5.5M4 14.5V20h5.5M20 9.5V4h-5.5',
  image:
    'M3.5 5.5h17v13h-17zM8.5 11.5a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5M4 17.5l5.5-5 3.5 3 3-2.5 4.5 4',
  undo: 'M4 9.5h9.5a5 5 0 0 1 0 10H8M4 9.5 8 5.5M4 9.5l4 4',
  redo: 'M20 9.5h-9.5a5 5 0 0 0 0 10H16M20 9.5 16 5.5M20 9.5l-4 4',
  desktop: 'M3.5 5h17v10.5h-17zM9 19.5h6M12 15.5v4',
  mobile: 'M8 3.5h8a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1M10.5 17.5h3',
  calendar: 'M4.5 6.5h15v13h-15zM8.5 3.5v4M15.5 3.5v4M4.5 11h15',
  history: 'M3.5 12a8.5 8.5 0 1 0 3-6.5M3.5 4.5V10H9M12 8v4.5l3.5 2',
  cloud: 'M7 18.5h10a3.6 3.6 0 0 0 .5-7.2 5.6 5.6 0 0 0-10.8.7A3.3 3.3 0 0 0 7 18.5',
  sparkles:
    'M11 3.5l1.7 4.3 4.3 1.7-4.3 1.7L11 15.5 9.3 11.2 5 9.5l4.3-1.7zM17.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z',
  settings:
    'M12 15.4a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8M9.6 3.5h4.8l.4 2.4 2 1.2 2.2-1 2.4 4.1-1.9 1.5v2.6l1.9 1.5-2.4 4.1-2.2-1-2 1.2-.4 2.4H9.6l-.4-2.4-2-1.2-2.2 1L2.6 15.4l1.9-1.5v-2.6L2.6 9.8l2.4-4.1 2.2 1 2-1.2z',
  drag: 'M9.5 6h.01M9.5 12h.01M9.5 18h.01M14.5 6h.01M14.5 12h.01M14.5 18h.01',
  palette:
    'M12 20.5a8.5 8.5 0 1 1 8.5-8.5c0 2.1-1.7 3-3.4 3h-1.3a1.9 1.9 0 0 0-1.4 3.2c.5.6.2 1.6-.6 1.9M7.5 10.5h.01M11 7.5h.01M15.5 9.5h.01',
  eye: 'M12 5.5c5 0 8.4 4 9.4 6.5-1 2.5-4.4 6.5-9.4 6.5S3.6 14.5 2.6 12C3.6 9.5 7 5.5 12 5.5m0 3.6a2.9 2.9 0 1 0 0 5.8 2.9 2.9 0 0 0 0-5.8',
  upload: 'M12 20.5V8.5m0 0-4.5 4.5M12 8.5l4.5 4.5M4 4h16',
  dots: 'M6 12h.01M12 12h.01M18 12h.01',
  chevronLeft: 'm14.5 6-6 6 6 6',
  printer:
    'M7 8.5V3.5h10v5M7 17.5H5.5A1.5 1.5 0 0 1 4 16v-5A1.5 1.5 0 0 1 5.5 9.5h13A1.5 1.5 0 0 1 20 11v5a1.5 1.5 0 0 1-1.5 1.5H17M7 14h10v6.5H7z',
  pencil: 'M4 20h4L20 8l-4-4L4 16zM14.5 5.5l4 4',
  sliders: 'M4 8h10M18 8h2M4 16h4M12 16h8M14 5.5v5M8 13.5v5',
} as const;

export type IconName = keyof typeof PATHS;

type IconProps = SVGProps<SVGSVGElement> & { name: IconName; size?: number };

export function Icon({ name, size = 18, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
