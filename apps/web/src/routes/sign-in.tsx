import { setupSchema } from '@strekatron/shared/schemas';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, call, errorMessage } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { setupQuery } from '@/lib/queries';

export const Route = createFileRoute('/sign-in')({
  validateSearch: z.object({ redirect: z.string().optional() }),
  component: SignInPage,
});

/** Only paths inside the app: never an open redirect. */
const safeRedirect = (to: string | undefined) =>
  to && to.startsWith('/') && !to.startsWith('//') && !to.startsWith('/sign-in') ? to : '/today';

function SignInPage() {
  const setup = useQuery(setupQuery);
  return (
    <main className="grid min-h-dvh place-items-center bg-sidebar px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <Logo className="justify-center text-xl" />
        {setup.isPending ? (
          <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
        ) : setup.isError ? (
          <p className="text-center text-sm text-destructive">{errorMessage(setup.error)}</p>
        ) : setup.data.needsSetup ? (
          <SetupForm />
        ) : (
          <SignInForm />
        )}
      </div>
    </main>
  );
}

function useFinish() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  return async () => {
    await queryClient.invalidateQueries();
    await navigate({ to: safeRedirect(redirect) });
  };
}

function SignInForm() {
  const finish = useFinish();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const { error } = await authClient.signIn.email({
      email: String(form.get('email')),
      password: String(form.get('password')),
    });
    if (error) {
      setError(error.message ?? 'Couldn’t sign in.');
      setBusy(false);
      return;
    }
    await finish();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome back</CardTitle>
        <CardDescription>Sign in to pick up where you left off.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Email" name="email" type="email" autoComplete="email" autoFocus />
          <Field label="Password" name="password" type="password" autoComplete="current-password" />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            Sign in
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function SetupForm() {
  const finish = useFinish();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = Object.fromEntries(new FormData(e.currentTarget));
    const parsed = setupSchema.safeParse({ ...form, timezone });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      await call(api.setup.$post({ json: parsed.data }));
      await finish();
    } catch (err) {
      setErrors({ form: errorMessage(err) });
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Set up Strekatron</CardTitle>
        <CardDescription>Create the owner account. Sign-up closes once it exists.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Name" name="name" autoComplete="name" autoFocus error={errors.name} />
          <Field
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            error={errors.email}
          />
          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete="new-password"
            error={errors.password}
            hint="At least 8 characters."
          />
          <p className="text-xs text-muted-foreground">
            Your days count in <span className="font-medium text-foreground">{timezone}</span>.
          </p>
          {errors.form && <p className="text-sm text-destructive">{errors.form}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            Create account
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  name,
  error,
  hint,
  ...props
}: { label: string; name: string; error?: string; hint?: string } & React.ComponentProps<
  typeof Input
>) {
  const id = `field-${name}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={name} aria-invalid={!!error} required {...props} />
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
