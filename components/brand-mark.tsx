/**
 * Shared AgentPay brand mark.
 *
 * Angular A/P monogram with a vertical payment-flow accent line
 * and an orange terminal dot. Used in the landing nav, the app
 * header, and any other surface that shows the AgentPay wordmark.
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
      {/* AgentPay mark: Angular A/P monogram with payment flow arrow */}
      <path d="M6 18L12 6L18 18" strokeWidth={2.5} />
      <path d="M6 13H18" strokeWidth={2.5} />
      <path d="M12 6V18" strokeWidth={1.5} stroke="#EA580C" strokeLinecap="round" />
      <circle cx={12} cy={18} r={1.5} fill="#EA580C" />
    </svg>
  );
}
