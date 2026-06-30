type NexusIconProps = {
  className?: string;
  size?: number;
};

export function NexusIcon({ className, size = 20 }: NexusIconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden
    >
      <path d="M16 4L16 22L6 22Z" fill="currentColor" />
      <path d="M16 8L16 22L24 22Z" fill="currentColor" opacity="0.6" />
      <path
        d="M4 24Q10 20 16 24Q22 28 28 24"
        stroke="currentColor"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
