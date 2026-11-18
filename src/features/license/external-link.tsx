import type { ReactNode } from "react";
import { openExternal } from "@/lib/platform";
import { cn } from "@/lib/utils";

/** Externer Link, geöffnet über die Geräte-Naht (im Wrapper später der System-Browser). */
export function ExternalLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        e.preventDefault();
        openExternal(href);
      }}
      className={cn(
        "inline-flex min-h-11 items-center rounded-md font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
    >
      {children}
    </a>
  );
}
