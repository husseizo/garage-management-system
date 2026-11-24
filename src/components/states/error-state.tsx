"use client";

import { AlertTriangle } from "lucide-react";

import { EmptyState } from "@/components/states/empty-state";
import { Button } from "@/components/ui/button";

export function ErrorState({ reset, digest }: { reset?: () => void; digest?: string }) {
  return (
    <EmptyState
      icon={AlertTriangle}
      title="Something went wrong"
      description={
        <>
          <p>The page could not be loaded. Please try again.</p>
          {digest ? <p className="mt-2 font-mono text-xs">Reference: {digest}</p> : null}
        </>
      }
    >
      {reset ? <Button onClick={reset}>Try again</Button> : null}
    </EmptyState>
  );
}
