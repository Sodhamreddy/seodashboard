/**
 * The SitePilot mark.
 *
 * Deliberately the same geometry as `src/app/icon.svg` so the browser tab and
 * the in-app logo are recognisably one thing. Previously the sidebar rendered a
 * generic gauge glyph from the icon set while the favicon drew a different
 * shape in a different blue, so the product had two unrelated marks.
 *
 * The gradient is referenced from the accent tokens rather than hardcoded, so a
 * future re-theme carries the logo with it — and so the mark is correct in dark
 * mode without a second copy.
 */
export function BrandMark({
  size = 32,
  rounded = true,
  className,
}: {
  size?: number;
  /** Off for contexts that already clip, like a circular avatar. */
  rounded?: boolean;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      role="img"
      aria-label="SitePilot"
    >
      <defs>
        {/* The id is scoped per size so two marks on one page cannot collide. */}
        <linearGradient
          id={`sitepilot-mark-${size}`}
          x1="0"
          y1="0"
          x2="32"
          y2="32"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="var(--accent-from)" />
          <stop offset="1" stopColor="var(--accent-to)" />
        </linearGradient>
      </defs>
      <rect
        width="32"
        height="32"
        rx={rounded ? 8 : 0}
        fill={`url(#sitepilot-mark-${size})`}
      />
      {/* A navigation arrow: piloting a site. Chosen because it stays legible
          at 16px, where anything with interior detail turns to mush. */}
      <path d="M16 6.6 24 24.4l-8-4.1-8 4.1z" fill="#ffffff" />
    </svg>
  );
}
