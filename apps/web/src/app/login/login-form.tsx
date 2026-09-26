'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { CircleAlert, LoaderCircle } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiRequestError } from '@/lib/api-client';
import { safeRedirectTarget } from '@/lib/auth-api';
import { useAuth } from '@/providers/auth-provider';

const loginSchema = z.object({
  email: z.email('Geçerli bir e-posta adresi girin.'),
  password: z.string().min(1, 'Şifre gerekli.'),
});

type LoginValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const { status, login } = useAuth();
  const router = useRouter();
  const target = safeRedirectTarget(useSearchParams().get('next'));
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    resetField,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  // Already signed in (e.g. session restored from the refresh cookie): skip the form.
  useEffect(() => {
    if (status === 'authenticated') router.replace(target);
  }, [status, router, target]);

  const onSubmit = async ({ email, password }: LoginValues) => {
    setError(null);
    try {
      await login(email.trim(), password);
      router.replace(target);
    } catch (err) {
      resetField('password');
      setError(
        err instanceof ApiRequestError ? err.message : 'Giriş yapılamadı. Lütfen tekrar deneyin.',
      );
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-8 space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-[13px] font-medium">
          E-posta
        </label>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          placeholder="ornek@belediye.bel.tr"
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? 'email-error' : undefined}
          {...register('email')}
        />
        {errors.email && (
          <p id="email-error" className="text-xs text-critical">
            {errors.email.message}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="text-[13px] font-medium">
          Şifre
        </label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={errors.password ? 'password-error' : undefined}
          {...register('password')}
        />
        {errors.password && (
          <p id="password-error" className="text-xs text-critical">
            {errors.password.message}
          </p>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="flex gap-2 rounded-lg bg-critical-soft p-3 text-[13px] text-critical"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting && <LoaderCircle className="animate-spin" aria-hidden="true" />}
        Giriş yap
      </Button>
    </form>
  );
}
