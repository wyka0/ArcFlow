/**
 * Shared ArcFlow brand mark.
 *
 * A workflow-split glyph: one incoming payment node branching into two
 * recipient nodes, with an ArcFlow-orange accent node. Used in the landing
 * page, the app header, and any other surface that shows the ArcFlow
 * wordmark.
 */
export function BrandMark({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "text-foreground"}
      aria-hidden="true"
    >
      {/* ArcFlow mark: payment in, split out to two recipients */}
      <circle cx={4} cy={12} r={2} strokeWidth={2} />
      <circle cx={20} cy={6} r={2} strokeWidth={2} />
      <circle cx={20} cy={18} r={2} strokeWidth={2} />
      {/* Input node accent (brand orange) */}
      <circle cx={4} cy={12} r={0.75} fill="#EA580C" stroke="none" />
      <path d="M6 12C10 12 12 12 13.5 10.5" strokeWidth={1.75} />
      <path d="M6 12C10 12 12 12 13.5 13.5" strokeWidth={1.75} />
      <path d="M15.6 9.6L18 7.2" strokeWidth={1.75} />
      <path d="M15.6 14.4L18 16.8" strokeWidth={1.75} />
    </svg>
  );
}
