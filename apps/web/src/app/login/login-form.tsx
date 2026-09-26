'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Info, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const loginSchema = z.object({
  email: z.email('Geçerli bir e-posta adresi girin.'),
  password: z.string().min(1, 'Şifre gerekli.'),
});

type LoginValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const [notice, setNotice] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  // TODO(phase-3): POST /api/v1/auth/login, keep the access token in memory and the
  // refresh token in an httpOnly cookie, then redirect by role.
  const onSubmit = async () => {
    setNotice('Kimlik doğrulama servisi Phase 3 kapsamında etkinleştirilecek.');
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

      {notice && (
        <div
          role="status"
          className="flex gap-2 rounded-lg bg-info-soft p-3 text-[13px] text-primary"
        >
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {notice}
        </div>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting && <LoaderCircle className="animate-spin" aria-hidden="true" />}
        Giriş yap
      </Button>
    </form>
  );
}
