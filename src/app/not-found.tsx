import { SearchX } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/states/empty-state";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl items-center px-4">
      <EmptyState
        icon={SearchX}
        title="Page not found"
        description="The page you are looking for does not exist or has moved."
        className="w-full"
      >
        <Button asChild>
          <Link href="/">Go to the home page</Link>
        </Button>
      </EmptyState>
    </main>
  );
}
