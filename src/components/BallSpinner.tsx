/**
 * Spinning soccer-ball loading indicator. Line-art in `currentColor`, so it reads
 * on any button variant (white on the green primary, ink on secondary, red on
 * danger) and scales with the surrounding font size. Decorative — callers convey
 * the loading state with an adjacent text label, so it is aria-hidden.
 *
 * Spins only when motion is allowed (`motion-safe:animate-spin`); the global
 * prefers-reduced-motion rule in globals.css also neutralizes it as a backstop.
 */
export function BallSpinner({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`h-[1.1em] w-[1.1em] motion-safe:animate-spin ${className}`.trim()}
    >
      {/* ball outline */}
      <circle cx="12" cy="12" r="9" />
      {/* central pentagon */}
      <path d="M12 8 15.8 10.76 14.35 15.24 9.65 15.24 8.2 10.76Z" />
      {/* seams radiating from each pentagon vertex to the rim */}
      <path d="M12 8V3M15.8 10.76 20.56 9.22M14.35 15.24 17.29 19.28M9.65 15.24 6.71 19.28M8.2 10.76 3.44 9.22" />
    </svg>
  );
}
