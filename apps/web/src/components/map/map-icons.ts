/**
 * Marker icons drawn on a canvas (no image assets). Shape AND colour differ, so the
 * layers stay distinguishable without colour (UI_UX_GUIDE §6):
 *   request  – blue circle · done – small grey circle
 *   critical – red diamond with "!" · work order – amber rounded square
 * Colours mirror the design tokens (primary, critical, warning, muted).
 */
export const MARKER_COLORS = {
  request: '#2563EB',
  done: '#94A3B8',
  critical: '#DC2626',
  workOrder: '#D97706',
  cluster: '#1E3A8A',
} as const;

const RATIO = 2;

function draw(size: number, paint: (ctx: CanvasRenderingContext2D, s: number) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = size * RATIO;
  canvas.height = size * RATIO;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(RATIO, RATIO);
  paint(ctx, size);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width: canvas.width, height: canvas.height, data: new Uint8Array(data.data.buffer) };
}

function ring(ctx: CanvasRenderingContext2D) {
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ffffff';
  ctx.fill();
  ctx.stroke();
}

export function markerImages() {
  return {
    'k-request': draw(18, (ctx, s) => {
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, s / 2 - 2, 0, Math.PI * 2);
      ctx.fillStyle = MARKER_COLORS.request;
      ring(ctx);
    }),
    'k-done': draw(14, (ctx, s) => {
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, s / 2 - 2, 0, Math.PI * 2);
      ctx.fillStyle = MARKER_COLORS.done;
      ring(ctx);
    }),
    'k-critical': draw(24, (ctx, s) => {
      ctx.beginPath();
      ctx.moveTo(s / 2, 1.5);
      ctx.lineTo(s - 1.5, s / 2);
      ctx.lineTo(s / 2, s - 1.5);
      ctx.lineTo(1.5, s / 2);
      ctx.closePath();
      ctx.fillStyle = MARKER_COLORS.critical;
      ring(ctx);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(s / 2 - 1.25, 6.5, 2.5, 7);
      ctx.fillRect(s / 2 - 1.25, 15, 2.5, 2.5);
    }),
    'k-work-order': draw(20, (ctx, s) => {
      const r = 4;
      ctx.beginPath();
      ctx.roundRect(2, 2, s - 4, s - 4, r);
      ctx.fillStyle = MARKER_COLORS.workOrder;
      ring(ctx);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(s / 2 - 3, s / 2 - 3, 6, 6);
    }),
  };
}

export const ICON_PIXEL_RATIO = RATIO;
