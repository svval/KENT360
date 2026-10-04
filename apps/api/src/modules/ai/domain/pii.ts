/**
 * Strips personal data from free text before it leaves the system (AI provider) or is
 * stored next to an analysis. Deliberately conservative pattern masking – e-mail
 * addresses, phone numbers, 11-digit national ids, IBANs – not a guarantee, but
 * the description is the only text ever sent (ARCHITECTURE §8).
 */
const PATTERNS: [RegExp, string][] = [
  [/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[e-posta]'],
  [/\bTR\d{2}(?:\s?\d{4}){5}\s?\d{2}\b/gi, '[iban]'],
  [/\b[1-9]\d{10}\b/g, '[kimlik no]'],
  [/(?:\+90[\s-]?|0)?\(?5\d{2}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}\b/g, '[telefon]'],
];

export function maskPersonalData(text: string): string {
  return PATTERNS.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), text);
}
