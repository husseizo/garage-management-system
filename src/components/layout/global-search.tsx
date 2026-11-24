import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";

/** Dashboard-wide search: a plain GET form to /dashboard/search (works without client JS). */
export function GlobalSearch({ label, placeholder }: { label: string; placeholder: string }) {
  return (
    <form
      action="/dashboard/search"
      method="get"
      role="search"
      className="relative w-full max-w-sm"
    >
      <label htmlFor="global-search" className="sr-only">
        {label}
      </label>
      <Search
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
        aria-hidden
      />
      <Input
        id="global-search"
        name="q"
        type="search"
        placeholder={placeholder}
        className="pl-8"
        minLength={2}
        maxLength={100}
        autoComplete="off"
      />
    </form>
  );
}
