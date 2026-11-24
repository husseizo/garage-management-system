import Link from "next/link";

import { Brand } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { publicNav } from "@/config/navigation";

export function SiteHeader() {
  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Brand />
        <nav aria-label="Main" className="flex items-center gap-1">
          <ul className="hidden items-center gap-1 md:flex">
            {publicNav.map((item) => (
              <li key={item.href}>
                <Button asChild variant="ghost" size="sm">
                  <Link href={item.href}>{item.title}</Link>
                </Button>
              </li>
            ))}
          </ul>
          <Button asChild size="sm" className="md:hidden">
            <Link href="/book">Book</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/login">Staff sign in</Link>
          </Button>
        </nav>
      </div>
      <nav aria-label="Main (mobile)" className="border-t md:hidden">
        <ul className="mx-auto flex max-w-6xl justify-around px-2 py-1 text-sm">
          {publicNav.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="text-muted-foreground hover:text-foreground block rounded px-3 py-2"
              >
                {item.title}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
