"use client";

import { ErrorState } from "@/components/states/error-state";

/** Root error boundary. Shows only the digest — never the message or stack — to the user. */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl items-center px-4">
      <div className="w-full">
        <ErrorState reset={reset} digest={error.digest} />
      </div>
    </main>
  );
}
