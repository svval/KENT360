export const appConfig = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
  defaultMunicipalityName:
    process.env.NEXT_PUBLIC_DEFAULT_MUNICIPALITY_NAME ?? 'KENT360 Demo Belediyesi',
} as const;
