/**
 * Small confirmation checkmark in `currentColor`, sized to the surrounding text.
 * At rest the stroke is fully drawn, so it reads as a static "done" mark on first
 * paint and under prefers-reduced-motion. When `animate` is true it draws itself
 * in once (the stroke-dashoffset keyframe lives in globals.css) — the quiet
 * "palpite salvo" moment. Decorative: the adjacent "feito" text is the label.
 */
export function CheckDraw({
  animate = false,
  className = "",
}: {
  animate?: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`h-[1em] w-[1em] ${animate ? "check-draw--in" : ""} ${className}`.trim()}
    >
      <path className="check-draw__path" d="M5 13 10 18 19 7" />
    </svg>
  );
}
