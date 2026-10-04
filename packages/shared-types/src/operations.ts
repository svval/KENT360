import { type Priority, type RequestStatus, type SlaStatus, type WorkOrderStatus } from './enums';
import { type FeatureCollection } from './municipality';
import { type RequestSummary } from './requests';

// ─── Dashboard (Phase 8) ─────────────────────────────────────────────────────

/** A value with the one before it (yesterday / previous 30 days); null when unknown. */
export interface KpiValue {
  value: number | null;
  previous: number | null;
}

export interface DashboardOverview {
  generatedAt: string;
  /** Municipality time zone – "today" and the trend days are local days. */
  timeZone: string;
  kpis: {
    /** Created since local midnight · previous: yesterday. */
    todayRequests: KpiValue;
    /** Not resolved, verified, closed or rejected. */
    openRequests: KpiValue;
    /** Open and CRITICAL priority. */
    criticalRequests: KpiValue;
    /** CREATED … WAITING. */
    openWorkOrders: KpiValue;
    /** Average createdAt → resolvedAt of requests resolved in the last 30 days · previous: 30 days before. */
    avgResolutionMinutes: KpiValue;
    /** Share (0–100) of requests resolved in the last 30 days within their SLA. */
    slaCompliancePercent: KpiValue;
  };
  /** Last 30 local days, oldest first. */
  trend: { date: string; created: number; resolved: number }[];
  /** CRITICAL first, then SLA breached, then SLA at risk (open requests only). */
  criticalRequests: (RequestSummary & { reason: 'CRITICAL' | 'BREACHED' | 'AT_RISK' })[];
  recentRequests: RequestSummary[];
}

// ─── Map (Phase 9) ───────────────────────────────────────────────────────────

export interface MapPoint {
  type: 'Point';
  coordinates: [number, number];
}

export interface MapRequestProperties {
  id: string;
  publicNumber: string;
  status: RequestStatus;
  priority: Priority;
  category: string | null;
  department: string | null;
  neighborhood: string | null;
  slaStatus: SlaStatus | null;
  /** CRITICAL priority or SLA breached while open – drawn as the critical layer. */
  critical: boolean;
  /** Resolved, verified or closed – drawn muted. */
  done: boolean;
  createdAt: string;
}

export interface MapWorkOrderProperties {
  id: string;
  publicNumber: string;
  status: WorkOrderStatus;
  priority: Priority;
  department: string;
  team: string | null;
  assignedUser: string | null;
  requestId: string | null;
  requestNumber: string | null;
}

/** GeoJSON (RFC 7946) – `truncated` is a foreign member: more features matched than returned. */
export type MapFeatureCollection<P> = FeatureCollection<MapPoint, P> & { truncated: boolean };

export const MAP_FEATURE_LIMIT = 5000;

// ─── Global search (Phase 8) ─────────────────────────────────────────────────

export interface SearchResultItem {
  type: 'REQUEST' | 'WORK_ORDER';
  id: string;
  publicNumber: string;
  title: string;
  /** Neighbourhood / address / team – a short second line. */
  subtitle: string | null;
  status: RequestStatus | WorkOrderStatus;
}

// ─── MahallePulse (Phase 10) ─────────────────────────────────────────────────

export type NeighborhoodRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export const NEIGHBORHOOD_RISK_LABELS: Record<NeighborhoodRiskLevel, string> = {
  LOW: 'Düşük',
  MEDIUM: 'Orta',
  HIGH: 'Yüksek',
  CRITICAL: 'Kritik',
};

export interface RiskFactor {
  key: 'openLoad' | 'slaBreach' | 'criticalShare' | 'growth' | 'slowResolution';
  label: string;
  value: number;
  points: number;
  detail: string;
}

/** Metrics over the user's scope; windows are rolling (now − N days). */
export interface NeighborhoodPulse {
  id: string;
  code: string;
  name: string;
  total: number;
  open: number;
  resolved: number;
  /** Open and CRITICAL priority. */
  critical: number;
  openWorkOrders: number;
  /** Share (0–100) of SLA-tracked requests of the last 90 days that breached; null = none tracked. */
  slaBreachPercent: number | null;
  avgResolutionMinutes: number | null;
  topCategory: { id: string; name: string; count: number } | null;
  last7: number;
  last30: number;
  previous30: number;
  /** (last30 − previous30) / previous30 in %, null when previous30 is 0. */
  changePercent: number | null;
  riskScore: number;
  riskLevel: NeighborhoodRiskLevel;
  riskFactors: RiskFactor[];
}

export interface PulseAnomaly {
  neighborhoodId: string;
  neighborhoodName: string;
  categoryId: string;
  categoryName: string;
  last7: number;
  baselineWeekly: number;
  increasePercent: number | null;
  severity: 'MEDIUM' | 'HIGH';
  message: string;
}

export interface NeighborhoodPulseDetail extends NeighborhoodPulse {
  center: { latitude: number; longitude: number } | null;
  categories: { id: string; name: string; count: number }[];
  /** Last 90 local days, oldest first. */
  trend: { date: string; created: number; resolved: number }[];
  openRequests: RequestSummary[];
  activeWorkOrders: {
    id: string;
    publicNumber: string;
    status: WorkOrderStatus;
    priority: Priority;
    team: string | null;
    requestNumber: string | null;
  }[];
  anomalies: PulseAnomaly[];
}
