'use client';

import { ImageOff } from 'lucide-react';
import { type ComponentProps, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * A private photo served through a short-lived presigned URL (not next/image: the
 * object storage host is not fixed). If the browser cannot load it – storage
 * unreachable, URL expired – a readable placeholder replaces the broken-image icon;
 * a new URL (the detail refreshes every few minutes) resets it.
 */
export function PrivateImage({ src, alt, className, ...props }: ComponentProps<'img'>) {
  const [failed, setFailed] = useState<string | null>(null);
  if (failed && failed === src) {
    return (
      <span
        role="img"
        aria-label={`${alt ?? 'Fotoğraf'} yüklenemedi`}
        className={cn(
          'flex flex-col items-center justify-center gap-1 bg-subtle p-2 text-center text-xs text-muted',
          className,
        )}
      >
        <ImageOff className="size-5" aria-hidden="true" />
        Fotoğraf yüklenemedi
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailed(typeof src === 'string' ? src : null)}
      {...props}
    />
  );
}
