import { type RequestAiAnalysis } from './ai';
import {
  type Priority,
  type RecordStatus,
  type RequestSource,
  type RequestStatus,
  SlaStatus,
  type WorkOrderStatus,
} from './enums';

// ─── Labels (UI_UX_GUIDE §6) ─────────────────────────────────────────────────

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  NEW: 'Yeni',
  AI_ANALYZED: 'AI Analiz Edildi',
  UNDER_REVIEW: 'İncelemede',
  ASSIGNED_TO_DEPARTMENT: 'Müdürlüğe Atandı',
  WORK_ORDER_CREATED: 'İş Emri Oluşturuldu',
  IN_PROGRESS: 'İşlemde',
  RESOLVED: 'Çözüldü',
  VERIFIED: 'Doğrulandı',
  CLOSED: 'Kapandı',
  REJECTED: 'Reddedildi',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: 'Düşük',
  NORMAL: 'Normal',
  HIGH: 'Yüksek',
  CRITICAL: 'Kritik',
};

export const REQUEST_SOURCE_LABELS: Record<RequestSource, string> = {
  WEB: 'Web',
  MOBILE: 'Mobil uygulama',
  CALL_CENTER: 'Çağrı merkezi',
  MUNICIPAL_STAFF: 'Belediye personeli',
  API: 'Entegrasyon (API)',
};

export const SLA_STATUS_LABELS: Record<SlaStatus, string> = {
  ON_TIME: 'SLA içinde',
  AT_RISK: 'SLA riskte',
  BREACHED: 'SLA aşıldı',
};

// ─── SLA (ARCHITECTURE §6.3) ─────────────────────────────────────────────────

export interface SlaSnapshot {
  /** createdAt + effective category SLA, frozen at creation. */
  slaDueAt: string | Date | null;
  /** Frozen AT_RISK threshold: slaDueAt − ratio × SLA duration. */
  slaAtRiskAt: string | Date | null;
  /** When the request stopped running against its SLA (resolved/closed); null = still open. */
  completedAt: string | Date | null;
}

export interface SlaEvaluation {
  status: SlaStatus | null;
  /** Positive: time left; negative: overdue. Frozen at completedAt for finished requests. */
  remainingMinutes: number | null;
}

const toMs = (value: string | Date) => (value instanceof Date ? value : new Date(value)).getTime();

/**
 * SLA status is computed, never stored. Open requests are measured against `now`;
 * finished ones against the moment they finished, so their result never changes.
 *   BREACHED – past slaDueAt · AT_RISK – past slaAtRiskAt · ON_TIME – otherwise.
 * No SLA configured → { status: null }.
 */
export function evaluateSla(snapshot: SlaSnapshot, now: Date = new Date()): SlaEvaluation {
  if (!snapshot.slaDueAt) return { status: null, remainingMinutes: null };
  const at = snapshot.completedAt ? toMs(snapshot.completedAt) : now.getTime();
  const due = toMs(snapshot.slaDueAt);
  const remainingMinutes = Math.round((due - at) / 60_000);
  if (at > due) return { status: SlaStatus.BREACHED, remainingMinutes };
  // A finished request that met its deadline is simply "on time", whatever the risk window.
  if (!snapshot.completedAt && snapshot.slaAtRiskAt && at >= toMs(snapshot.slaAtRiskAt)) {
    return { status: SlaStatus.AT_RISK, remainingMinutes };
  }
  return { status: SlaStatus.ON_TIME, remainingMinutes };
}

/** "3 sa 42 dk", "2 gün 4 sa", "12 dk" – compact duration for SLA badges. */
export function formatDurationShort(totalMinutes: number): string {
  const minutes = Math.abs(Math.round(totalMinutes));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return hours > 0 ? `${days} gün ${hours} sa` : `${days} gün`;
  if (hours > 0) return mins > 0 ? `${hours} sa ${mins} dk` : `${hours} sa`;
  return `${mins} dk`;
}

// ─── API contracts ───────────────────────────────────────────────────────────

export interface RequestSla {
  dueAt: string | null;
  atRiskAt: string | null;
  status: SlaStatus | null;
  remainingMinutes: number | null;
}

interface NamedRef {
  id: string;
  name: string;
}

export interface RequestSummary {
  id: string;
  publicNumber: string;
  title: string;
  status: RequestStatus;
  priority: Priority;
  source: RequestSource;
  category: (NamedRef & { code: string; parent: NamedRef | null }) | null;
  department: (NamedRef & { code: string }) | null;
  neighborhood: (NamedRef & { code: string }) | null;
  address: string | null;
  sla: RequestSla;
  mediaCount: number;
  createdAt: string;
}

export interface RequestMediaItem {
  id: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  /** Short-lived presigned URL of the private object. */
  url: string;
  urlExpiresAt: string;
}

export interface RequestTimelineEvent {
  id: string;
  type: string;
  description: string;
  oldStatus: RequestStatus | null;
  newStatus: RequestStatus | null;
  createdAt: string;
  /** Who did it – only shown to municipal staff; citizens see null. */
  performedBy: string | null;
}

export interface RequestTransitionOption {
  to: RequestStatus;
  label: string;
  requiresReason: boolean;
}

export interface RequestDetail extends RequestSummary {
  description: string;
  location: { latitude: number; longitude: number };
  /** Set when the point lies outside every active neighbourhood boundary. */
  locationNotice: string | null;
  rejectionReason: string | null;
  department: (NamedRef & { code: string; status: RecordStatus }) | null;
  /** Reporter contact – only for staff holding users.read (KVKK). */
  reporter: { id: string; fullName: string; email: string | null; phone: string | null } | null;
  media: RequestMediaItem[];
  timeline: RequestTimelineEvent[];
  /** Citizens who joined this request instead of filing a duplicate (no names). */
  supporterCount: number;
  /** The current user joined (follows) this request. */
  joined: boolean;
  /** Latest AI analysis – municipal staff only (citizens get null). */
  ai: RequestAiAnalysis | null;
  /** Work orders created from this request – municipal staff only (citizens get []). */
  workOrders: { id: string; publicNumber: string; status: WorkOrderStatus }[];
  /** What the current user may do next (the API enforces the same rules). */
  actions: {
    transitions: RequestTransitionOption[];
    canChangePriority: boolean;
    canChangeDepartment: boolean;
    canAddMedia: boolean;
    canCreateWorkOrder: boolean;
  };
  updatedAt: string;
}

export interface MediaUploadLimits {
  maxBytes: number;
  maxPerRequest: number;
  mimeTypes: string[];
}

/** Photo rules (SECURITY.md §5); the API re-checks the file signature. */
export const REQUEST_MEDIA_LIMITS: MediaUploadLimits = {
  maxBytes: 10 * 1024 * 1024,
  maxPerRequest: 5,
  mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
};

export const LOCATION_OUTSIDE_NEIGHBORHOODS = 'Konum tanımlı mahalle sınırları dışında.';
