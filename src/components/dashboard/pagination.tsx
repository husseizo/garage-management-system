import Link from "next/link";

import { Button } from "@/components/ui/button";

export function Pagination({
  page,
  hasMore,
  hrefFor,
  labels,
}: {
  page: number;
  hasMore: boolean;
  hrefFor: (page: number) => string;
  labels: { previous: string; next: string; page: string };
}) {
  if (page === 1 && !hasMore) return null;
  return (
    <nav className="flex items-center justify-between gap-2" aria-label={labels.page}>
      {page > 1 ? (
        <Button asChild variant="outline" size="sm">
          <Link href={hrefFor(page - 1)}>{labels.previous}</Link>
        </Button>
      ) : (
        <span />
      )}
      <span className="text-muted-foreground text-sm">{labels.page}</span>
      {hasMore ? (
        <Button asChild variant="outline" size="sm">
          <Link href={hrefFor(page + 1)}>{labels.next}</Link>
        </Button>
      ) : (
        <span />
      )}
    </nav>
  );
}
