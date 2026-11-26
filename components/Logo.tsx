export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <rect width="512" height="512" rx="112" fill="var(--ink)" />
      <path
        d="M150 128h120c58 0 96 32 96 82 0 38-22 64-58 75l70 99h-62l-62-92h-50v92h-54V128zm54 46v76h62c28 0 44-14 44-38s-16-38-44-38h-62z"
        fill="var(--paper)"
      />
      <path d="M120 420c70-26 170-34 280-14" stroke="var(--red)" strokeWidth="22" strokeLinecap="round" fill="none" />
    </svg>
  );
}
