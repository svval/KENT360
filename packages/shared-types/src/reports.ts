import { type AuditAction } from './auth';

/** Report filters (query string of /reports/*). Dates are local calendar days (YYYY-MM-DD). */
export interface ReportFilters {
  dateFrom?: string;
  dateTo?: string;
  departmentId?: string;
  categoryId?: string;
  status?: string;
  priority?: string;
  neighborhoodId?: string;
}

export const REPORT_TYPES = [
  'requests',
  'work-orders',
  'sla',
  'departments',
  'neighborhoods',
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_LABELS: Record<
  ReportType,
  { title: string; description: string; slug: string }
> = {
  requests: {
    title: 'Talep Raporu',
    description: 'Filtreye uyan talepler: durum, öncelik, kategori, müdürlük, SLA ve çözüm süresi.',
    slug: 'talep-raporu',
  },
  'work-orders': {
    title: 'İş Emri Raporu',
    description: 'İş emirleri: kaynak talep, ekip, durum, saha adımlarının zamanları.',
    slug: 'is-emri-raporu',
  },
  sla: {
    title: 'SLA Performansı',
    description: 'Kategori bazında zamanında / geç çözülen, açık aşılmış ve riskteki talepler.',
    slug: 'sla-performansi',
  },
  departments: {
    title: 'Müdürlük Performansı',
    description: 'Müdürlük bazında talep yükü, çözüm oranı, SLA uyumu ve iş emirleri.',
    slug: 'mudurluk-performansi',
  },
  neighborhoods: {
    title: 'Mahalle Performansı',
    description: 'Mahalle bazında talep yükü, kritik talepler, SLA uyumu ve çözüm süresi.',
    slug: 'mahalle-performansi',
  },
};

export interface PerformanceRow {
  id: string | null;
  name: string;
  total: number;
  open: number;
  resolved: number;
  critical: number;
  slaCompliancePercent: number | null;
  avgResolutionMinutes: number | null;
}

export interface ReportSummary {
  range: { from: string; to: string; timeZone: string };
  totals: {
    requests: number;
    resolved: number;
    open: number;
    /** Resolved within the SLA / resolved with an SLA (percent, null without data). */
    slaCompliancePercent: number | null;
    slaResolvedWithin: number;
    avgResolutionMinutes: number | null;
    openWorkOrders: number;
    workOrders: number;
  };
  departments: PerformanceRow[];
  neighborhoods: PerformanceRow[];
}

// ─── Audit ───────────────────────────────────────────────────────────────

export interface AuditChange {
  field: string;
  before: string | null;
  after: string | null;
}

export interface AuditLogItem {
  id: string;
  createdAt: string;
  action: AuditAction | string;
  entityType: string;
  entityId: string | null;
  actor: { id: string; name: string; email: string } | null;
  ipAddress: string | null;
  /** Sanitised, flattened key/value changes – never secrets or free-text bodies. */
  changes: AuditChange[];
}

export const AUDIT_ENTITY_TYPES = [
  'User',
  'Role',
  'Municipality',
  'Department',
  'Neighborhood',
  'RequestCategory',
  'Request',
  'WorkOrder',
  'FieldTeam',
  'Session',
] as const;

export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  User: 'Kullanıcı',
  Role: 'Rol',
  Municipality: 'Belediye',
  Department: 'Müdürlük',
  Neighborhood: 'Mahalle',
  RequestCategory: 'Kategori',
  Request: 'Talep',
  WorkOrder: 'İş emri',
  FieldTeam: 'Saha ekibi',
  Session: 'Oturum',
};

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  LOGIN_SUCCESS: 'Giriş yapıldı',
  LOGIN_FAILED: 'Başarısız giriş',
  ACCOUNT_LOCKED: 'Hesap kilitlendi',
  LOGOUT: 'Çıkış yapıldı',
  LOGOUT_ALL: 'Tüm oturumlar kapatıldı',
  SESSION_REVOKED: 'Oturum iptal edildi',
  REFRESH_TOKEN_REUSE_DETECTED: 'Oturum yeniden kullanımı engellendi',
  USER_CREATED: 'Kullanıcı oluşturuldu',
  USER_UPDATED: 'Kullanıcı güncellendi',
  USER_STATUS_CHANGED: 'Kullanıcı durumu değişti',
  USER_ROLE_CHANGED: 'Kullanıcı rolü değişti',
  ROLE_CREATED: 'Rol oluşturuldu',
  ROLE_PERMISSION_CHANGED: 'Rol yetkileri değişti',
  MUNICIPALITY_UPDATED: 'Belediye profili güncellendi',
  DEPARTMENT_CREATED: 'Müdürlük oluşturuldu',
  DEPARTMENT_UPDATED: 'Müdürlük güncellendi',
  DEPARTMENT_STATUS_CHANGED: 'Müdürlük durumu değişti',
  NEIGHBORHOOD_CREATED: 'Mahalle oluşturuldu',
  NEIGHBORHOOD_UPDATED: 'Mahalle güncellendi',
  NEIGHBORHOOD_STATUS_CHANGED: 'Mahalle durumu değişti',
  NEIGHBORHOODS_IMPORTED: 'Mahalleler içe aktarıldı',
  CATEGORY_CREATED: 'Kategori oluşturuldu',
  CATEGORY_UPDATED: 'Kategori güncellendi',
  CATEGORY_STATUS_CHANGED: 'Kategori durumu değişti',
  REQUEST_CREATED: 'Talep oluşturuldu',
  REQUEST_STATUS_CHANGED: 'Talep durumu değişti',
  REQUEST_PRIORITY_CHANGED: 'Talep önceliği değişti',
  REQUEST_DEPARTMENT_CHANGED: 'Talep müdürlüğü değişti',
  REQUEST_MEDIA_ADDED: 'Talebe fotoğraf eklendi',
  REQUEST_AI_ANALYZED: 'Talep AI ile analiz edildi',
  REQUEST_JOINED: 'Vatandaş talebe katıldı',
  WORK_ORDER_CREATED: 'İş emri oluşturuldu',
  WORK_ORDER_ASSIGNED: 'İş emri atandı',
  WORK_ORDER_REASSIGNED: 'İş emri yeniden atandı',
  WORK_ORDER_STATUS_CHANGED: 'İş emri durumu değişti',
  WORK_ORDER_MEDIA_ADDED: 'İş emrine fotoğraf eklendi',
  WORK_ORDER_COMPLETED: 'İş emri tamamlandı',
  WORK_ORDER_VERIFIED: 'İş emri doğrulandı',
  WORK_ORDER_CANCELLED: 'İş emri iptal edildi',
  WORK_ORDER_LOCATION_REJECTED: 'Saha konumu reddedildi',
  FIELD_TEAM_CREATED: 'Saha ekibi oluşturuldu',
  FIELD_TEAM_UPDATED: 'Saha ekibi güncellendi',
  FIELD_TEAM_MEMBERS_CHANGED: 'Ekip üyeleri değişti',
};
