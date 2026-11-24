import type { Metadata } from "next";
import Link from "next/link";

import { Brand } from "@/components/layout/brand";
import { siteConfig } from "@/config/site";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { safeCallbackPath } from "@/server/auth/redirects";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Staff sign in", robots: { index: false } };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string | string[] }>;
}) {
  const { callbackUrl } = await searchParams;
  const safe = safeCallbackPath(Array.isArray(callbackUrl) ? callbackUrl[0] : callbackUrl);

  return (
    <main className="bg-muted/40 flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-12">
      <Brand />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            <h1 className="text-lg">Staff sign in</h1>
          </CardTitle>
          <CardDescription>{siteConfig.systemName}. For garage team members only.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm callbackUrl={safe} />
        </CardContent>
      </Card>
      <p className="text-muted-foreground text-sm">
        Customer?{" "}
        <Link href="/" className="text-foreground underline underline-offset-4">
          Return to the main site
        </Link>
      </p>
    </main>
  );
}
