/**
 * CSV for Excel in Turkish locales:
 *   • UTF-8 with BOM, so Excel detects the encoding (ç, ğ, ı, ş, ö, ü);
 *   • ";" as separator – the Turkish list separator (a "," file opens in one column);
 *   • decimals with a comma ("12,5");
 *   • formula injection is neutralised: a text cell starting with = + - @ (or tab / CR)
 *     gets a leading apostrophe, so a value like "=HYPERLINK(…)" from a citizen's
 *     address is shown as text and never evaluated (OWASP "CSV injection").
 * Numbers produced by the report itself are written as numbers.
 */
export const CSV_BOM = '﻿';
export const CSV_SEPARATOR = ';';

export type CsvValue = string | number | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return String(Math.round(value * 10) / 10).replace('.', ',');
  }
  let text = value;
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: readonly string[], rows: readonly (readonly CsvValue[])[]): string {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(CSV_SEPARATOR));
  return `${CSV_BOM}${lines.join('\r\n')}\r\n`;
}

/** kent360-talep-raporu-2026-10-04.csv */
export function reportFilename(slug: string, localDate: string): string {
  return `kent360-${slug}-${localDate}.csv`;
}
