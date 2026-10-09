'use client';

/** Last-resort error page (the root layout itself failed): plain markup, no app providers. */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="tr">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          background: '#F5F7FA',
          color: '#0F172A',
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        <main style={{ textAlign: 'center', padding: 24 }}>
          <p style={{ fontWeight: 700, color: '#0B1F3A' }}>KENT360</p>
          <h1 style={{ fontSize: 20 }}>Beklenmeyen bir hata oluştu</h1>
          <p style={{ color: '#475569', fontSize: 14 }}>Lütfen sayfayı yeniden yükleyin.</p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 12,
              padding: '8px 16px',
              borderRadius: 8,
              border: 0,
              background: '#2563EB',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            Tekrar dene
          </button>
        </main>
      </body>
    </html>
  );
}
