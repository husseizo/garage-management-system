"use client";

/** Last-resort boundary for failures in the root layout itself. Must render <html>/<body>. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="en">
      <body
        style={{ fontFamily: "system-ui, sans-serif", padding: "4rem 1rem", textAlign: "center" }}
      >
        <h1>Something went wrong</h1>
        <p>Please refresh the page. If the problem continues, contact the workshop.</p>
        {error.digest ? (
          <p style={{ fontFamily: "monospace", fontSize: 12 }}>Reference: {error.digest}</p>
        ) : null}
      </body>
    </html>
  );
}
