'use client';

import { type ReactNode, createContext, useContext } from 'react';
import { appConfig } from '@/lib/config';
import { useAuth } from './auth-provider';

export interface Branding {
  municipalityName: string;
  logoUrl?: string;
  primaryColor: string;
  accentColor: string;
}

const defaultBranding: Branding = {
  municipalityName: appConfig.defaultMunicipalityName,
  primaryColor: '#2563EB',
  accentColor: '#0891B2',
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** Tenant data is untrusted input: only plain hex colours may reach the stylesheet. */
function safeColor(value: string, fallback: string): string {
  return HEX_COLOR.test(value) ? value : fallback;
}

const BrandingContext = createContext<Branding>(defaultBranding);

/**
 * White-label entry point. The signed-in user's municipality (from /auth/me) provides
 * name, logo and colours; before login the neutral defaults apply. Tenant colours are
 * written to :root so every Tailwind token (bg-primary, text-accent…) follows the
 * brand – including content rendered in portals outside this subtree. Semantic colours
 * (success/warning/critical) never change.
 */
export function BrandingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const municipality = user?.municipality;
  const branding: Branding = municipality
    ? {
        municipalityName: municipality.name,
        logoUrl: municipality.logoUrl ?? undefined,
        primaryColor: municipality.primaryColor,
        accentColor: municipality.secondaryColor,
      }
    : defaultBranding;

  const primary = safeColor(branding.primaryColor, defaultBranding.primaryColor);
  const accent = safeColor(branding.accentColor, defaultBranding.accentColor);

  return (
    <BrandingContext.Provider value={branding}>
      <style>{`:root{--brand-primary:${primary};--brand-accent:${accent};}`}</style>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding(): Branding {
  return useContext(BrandingContext);
}
