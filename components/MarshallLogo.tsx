export default function MarshallLogo({
  size = 44,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="MARshall OS"
    >
      {/* Simple “spray gun + beams” mark (placeholder). Swap paths with your real SVG anytime. */}
      <path
        d="M72 112c0-8 6-14 14-14h42c8 0 14 6 14 14v10H72v-10Z"
        fill="white"
        opacity="0.9"
      />
      <path d="M66 122h86v16H66v-16Z" fill="white" opacity="0.85" />
      <path
        d="M60 138h28c2 0 4 2 4 4v18c0 6-5 11-11 11H60c-2 0-4-2-4-4v-25c0-2 2-4 4-4Z"
        fill="white"
        opacity="0.95"
      />
      <path d="M92 150h18v10H92v-10Z" fill="white" opacity="0.75" />
      <path d="M156 116h70v10h-70v-10Z" fill="white" opacity="0.55" />
      <path d="M156 136h60v10h-60v-10Z" fill="white" opacity="0.4" />
      <path d="M156 156h50v10h-50v-10Z" fill="white" opacity="0.28" />
      <path
        d="M120 90c0-10 8-18 18-18h22c10 0 18 8 18 18v6h-58v-6Z"
        fill="white"
        opacity="0.65"
      />
      <path d="M126 72h8v28h-8V72Z" fill="white" opacity="0.55" />
    </svg>
  );
}