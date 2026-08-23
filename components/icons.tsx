import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

export function PawMark({ size = 38, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        d="M24 20.8c-6.9 0-13.1 7.1-13.1 13.3 0 4.4 3.3 7 7.3 7 2.3 0 3.7-1.3 5.8-1.3s3.5 1.3 5.8 1.3c4 0 7.3-2.6 7.3-7C37.1 27.9 30.9 20.8 24 20.8Z"
      />
      <ellipse cx="9.7" cy="22.6" rx="5.1" ry="6.6" transform="rotate(-27 9.7 22.6)" fill="currentColor" />
      <ellipse cx="18.2" cy="11.2" rx="5.3" ry="7.1" transform="rotate(-8 18.2 11.2)" fill="currentColor" />
      <ellipse cx="29.8" cy="11.2" rx="5.3" ry="7.1" transform="rotate(8 29.8 11.2)" fill="currentColor" />
      <ellipse cx="38.3" cy="22.6" rx="5.1" ry="6.6" transform="rotate(27 38.3 22.6)" fill="currentColor" />
    </svg>
  );
}

export function SearchIcon({ size = 22, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  );
}

export function MenuIcon({ size = 24, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function CloseIcon({ size = 24, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" {...props}>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

export function BookmarkIcon({ size = 21, filled = false, ...props }: IconProps & { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M6.5 4.7A1.7 1.7 0 0 1 8.2 3h7.6a1.7 1.7 0 0 1 1.7 1.7V21L12 17.4 6.5 21V4.7Z" />
    </svg>
  );
}

export function ArrowIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M5 12h14m-5-5 5 5-5 5" />
    </svg>
  );
}

export function CheckIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

export function HeartIcon({ size = 25, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M20.8 4.7a5.3 5.3 0 0 0-7.5 0L12 6l-1.3-1.3a5.3 5.3 0 0 0-7.5 7.5L12 21l8.8-8.8a5.3 5.3 0 0 0 0-7.5Z" />
      <path d="M8.1 12h2.4l1.2-2.7 1.6 5.4 1.1-2.7h1.8" />
    </svg>
  );
}

export function WhistleIcon({ size = 25, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <circle cx="8" cy="14" r="4" />
      <path d="M12 14h7a2 2 0 0 0 2-2V8h-8l-2.2 2.8M16 8V5h3" />
    </svg>
  );
}

export function BowlIcon({ size = 25, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M3 11h18c-.4 5.1-3.8 8-9 8s-8.6-2.9-9-8Z" />
      <path d="M7 19v1m10-1v1M8 7c0-1 1-1.5 1-2.5M13 7c0-1 1-1.5 1-2.5" />
    </svg>
  );
}

export function SparkIcon({ size = 25, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M12 2c.4 5.3 2.7 7.6 8 8-5.3.4-7.6 2.7-8 8-.4-5.3-2.7-7.6-8-8 5.3-.4 7.6-2.7 8-8Z" />
      <path d="M19 17c.15 2 .85 2.7 3 3-2.15.3-2.85 1-3 3-.15-2-.85-2.7-3-3 2.15-.3 2.85-1 3-3Z" />
    </svg>
  );
}
