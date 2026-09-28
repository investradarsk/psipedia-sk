import type { ReactNode, SVGProps } from "react";
import type { HelpCategorySlug } from "@/lib/help";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function BaseIcon({ size = 22, children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function HelpCategoryIcon({ category, size = 24 }: { category: HelpCategorySlug; size?: number }) {
  switch (category) {
    case "adopcia":
      return <BaseIcon size={size}><path d="M3.5 10.5 12 3l8.5 7.5" /><path d="M5.5 9.5V21h13V9.5" /><path d="M9.2 21v-6h5.6v6" /></BaseIcon>;
    case "utulky":
      return <BaseIcon size={size}><path d="M4 21V7l8-4 8 4v14" /><path d="M8 10h2m4 0h2M8 14h2m4 0h2" /><path d="M10 21v-4h4v4" /></BaseIcon>;
    case "docasna-opatera":
      return <BaseIcon size={size}><path d="M4 13.5c2.3-3 5-4.5 8-4.5s5.7 1.5 8 4.5" /><path d="M5.5 12.2V20h13v-7.8" /><path d="M12 15.5c-2.5-2.2-4.4-3.7-4.4-5.8A2.7 2.7 0 0 1 12 7.6a2.7 2.7 0 0 1 4.4 2.1c0 2.1-1.9 3.6-4.4 5.8Z" /></BaseIcon>;
    case "zbierky":
      return <BaseIcon size={size}><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 10h18" /><circle cx="16.5" cy="14.5" r="1.5" /></BaseIcon>;
    case "stratene-a-najdene":
      return <BaseIcon size={size}><circle cx="10.5" cy="10.5" r="6" /><path d="m15 15 5 5" /><path d="M8.5 9.5h4M10.5 7.5v4" /></BaseIcon>;
    case "dobrovolnictvo":
      return <BaseIcon size={size}><path d="M7 12.5 10 15l7-7" /><path d="M12 3.5c5.2 0 8.5 3.3 8.5 8.5S17.2 20.5 12 20.5 3.5 17.2 3.5 12 6.8 3.5 12 3.5Z" /></BaseIcon>;
    case "urgentne-pripady":
      return <BaseIcon size={size}><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 9v4.5M12 17h.01" /></BaseIcon>;
  }
}

export function LocationIcon({ size = 18, ...props }: IconProps) {
  return <BaseIcon size={size} {...props}><path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z" /><circle cx="12" cy="10" r="2" /></BaseIcon>;
}

export function CalendarIcon({ size = 18, ...props }: IconProps) {
  return <BaseIcon size={size} {...props}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 10h18" /></BaseIcon>;
}

export function ShieldCheckIcon({ size = 20, ...props }: IconProps) {
  return <BaseIcon size={size} {...props}><path d="M12 3 5 6v5c0 4.6 2.8 8 7 10 4.2-2 7-5.4 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></BaseIcon>;
}

export function AlertCircleIcon({ size = 20, ...props }: IconProps) {
  return <BaseIcon size={size} {...props}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16.5h.01" /></BaseIcon>;
}
