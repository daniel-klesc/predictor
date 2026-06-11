"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { en } from "@/lib/strings/en";

type Flow = "signIn" | "signUp";

export default function SignInPage() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [flow, setFlow] = useState<Flow>("signIn");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("flow", flow);
    setError(null);
    setPending(true);
    signIn("password", formData)
      .then(() => {
        router.push("/today");
      })
      .catch(() => {
        setError(flow === "signIn" ? en.auth.signInError : en.auth.signUpError);
        setPending(false);
      });
  }

  return (
    <main className="pt-safe pb-safe mx-auto flex min-h-dvh w-full max-w-[480px] flex-col justify-center px-4">
      <div className="mb-8 text-center">
        <p className="font-display text-primary text-5xl font-bold tracking-wide uppercase">
          {en.app.name}
        </p>
        <p className="text-muted-foreground mt-2 text-sm">{en.app.tagline}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>
            {flow === "signIn" ? en.auth.signInTitle : en.auth.signUpTitle}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {en.auth.emailLabel}
              <Input
                name="email"
                type="email"
                autoComplete="email"
                placeholder={en.auth.emailPlaceholder}
                required
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {en.auth.passwordLabel}
              <Input
                name="password"
                type="password"
                autoComplete={
                  flow === "signIn" ? "current-password" : "new-password"
                }
                minLength={8}
                required
              />
            </label>
            {error ? (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            ) : null}
            <Button type="submit" size="lg" disabled={pending}>
              {pending
                ? en.auth.pending
                : flow === "signIn"
                  ? en.auth.signInAction
                  : en.auth.signUpAction}
            </Button>
          </form>
          <Button
            type="button"
            variant="link"
            className="self-start px-0"
            onClick={() => {
              setError(null);
              setFlow(flow === "signIn" ? "signUp" : "signIn");
            }}
          >
            {flow === "signIn"
              ? en.auth.switchToSignUp
              : en.auth.switchToSignIn}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
