"use client";

import { AlertCircle, Loader2 } from "lucide-react";
import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { signInAction, type SignInState } from "./actions";

export function LoginForm({ callbackUrl }: { callbackUrl?: string }) {
  const [state, formAction, pending] = useActionState<SignInState, FormData>(signInAction, {});

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.error ? (
        <Alert variant="destructive" role="alert">
          <AlertCircle aria-hidden />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {callbackUrl ? <input type="hidden" name="callbackUrl" value={callbackUrl} /> : null}
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="username" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        Sign in
      </Button>
    </form>
  );
}
