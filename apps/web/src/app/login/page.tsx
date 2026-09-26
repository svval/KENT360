import type { Metadata } from 'next';
import { Building2, ClipboardCheck, MapPinned, ShieldCheck } from 'lucide-react';
import { Suspense } from 'react';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Giriş' };

const HIGHLIGHTS = [
  { icon: MapPinned, text: 'Harita tabanlı canlı kent operasyonu' },
  { icon: ClipboardCheck, text: 'Talepten sahaya uçtan uca iş akışı' },
  { icon: ShieldCheck, text: 'Rol ve yetki tabanlı güvenli erişim' },
];

export default function LoginPage() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)]">
      <aside className="relative hidden overflow-hidden bg-navy p-12 text-white lg:flex lg:flex-col">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:56px_56px]"
        />
        <div className="relative flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary font-bold">
            K
          </span>
          <span className="text-lg font-bold tracking-tight">KENT360</span>
        </div>
        <div className="relative mt-auto max-w-lg">
          <h1 className="text-[34px] leading-tight font-bold tracking-tight">
            Akıllı Belediye Operasyon ve Kent Zekâsı Platformu
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-slate-300">
            Vatandaş bildiriminden saha ekibinin çözümüne kadar bütün süreci tek platformda yönetin.
          </p>
          <ul className="mt-8 space-y-3">
            {HIGHLIGHTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-[14px] text-slate-200">
                <span className="flex size-8 items-center justify-center rounded-lg bg-white/10">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative mt-12 text-xs text-slate-500">
          Smart Municipal Operations &amp; Urban Intelligence Platform
        </p>
      </aside>

      <main className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex size-10 items-center justify-center rounded-lg bg-navy font-bold text-white">
              K
            </span>
            <span className="text-lg font-bold tracking-tight">KENT360</span>
          </div>
          <div className="mb-2 flex items-center gap-2 text-[13px] text-muted">
            <Building2 className="size-4" aria-hidden="true" />
            Belediye personeli ve vatandaş girişi
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Hesabınıza giriş yapın</h2>
          <p className="mt-1 text-muted">Devam etmek için e-posta ve şifrenizi girin.</p>
          {/* useSearchParams (return path) needs a Suspense boundary for prerendering. */}
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
