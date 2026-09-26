'use client';

import { type ReactNode, createContext, useContext } from 'react';
import { appConfig } from '@/lib/config';

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
 * White-label entry point. Tenant colours are written to :root so every Tailwind
 * token (bg-primary, text-accent…) follows the municipality brand – including
 * content rendered in portals outside this subtree.
 * TODO(phase-4): Load branding from GET /api/v1/municipalities/current instead of defaults.
 */
export function BrandingProvider({
  branding = defaultBranding,
  children,
}: {
  branding?: Branding;
  children: ReactNode;
}) {
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
