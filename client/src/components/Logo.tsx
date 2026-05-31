type Props = { className?: string; size?: number };

export function Logo({ className, size = 40 }: Props) {
  return (
    <svg
      role="img"
      aria-label="Hailstones logo"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
    >
      {/* Falling hailstones spiral — 3 dots descending into 1 */}
      <circle cx="34" cy="10" r="4.5" fill="currentColor" opacity="0.35" />
      <circle cx="18" cy="20" r="5.5" fill="currentColor" opacity="0.6" />
      <circle cx="30" cy="32" r="6.5" fill="currentColor" opacity="0.85" />
      <circle cx="20" cy="40" r="3" fill="currentColor" />
      {/* Connecting line */}
      <path
        d="M34 10 Q 22 16 18 20 Q 26 26 30 32 Q 22 36 20 40"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.4"
        fill="none"
      />
    </svg>
  );
}
