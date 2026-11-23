import Link from "next/link";
import { Wrench } from "lucide-react";

import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

export function Brand({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link
      href={href}
      className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}
      aria-label={`${siteConfig.name} home`}
    >
      <span className="bg-primary text-primary-foreground grid size-8 place-items-center rounded-md">
        <Wrench className="size-4" aria-hidden />
      </span>
      <span className="hidden sm:inline">{siteConfig.name}</span>
      <span className="sm:hidden">{siteConfig.shortName}</span>
    </Link>
  );
}
