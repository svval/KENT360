import {
  type Priority,
  type RecordStatus,
  type RequestStatus,
  type WorkOrderMediaType,
  type WorkOrderStatus,
} from './enums';
import { type RequestMediaItem, type RequestSla } from './requests';

// ─── Labels (UI_UX_GUIDE §6) ─────────────────────────────────────────────────

export const WORK_ORDER_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  CREATED: 'Oluşturuldu',
  ASSIGNED: 'Atandı',
  ACCEPTED: 'Kabul Edildi',
  EN_ROUTE: 'Yolda',
  ON_SITE: 'Sahada',
  IN_PROGRESS: 'Çalışılıyor',
  WAITING: 'Beklemede',
  COMPLETED: 'Tamamlandı',
  VERIFIED: 'Doğrulandı',
  CANCELLED: 'İptal Edildi',
};

export const WORK_ORDER_MEDIA_TYPE_LABELS: Record<WorkOrderMediaType, string> = {
  BEFORE: 'Önce',
  DURING: 'Çalışma sırasında',
  AFTER: 'Sonra',
};

export const FieldTeamMemberRole = {
  LEADER: 'LEADER',
  MEMBER: 'MEMBER',
} as const;
export type FieldTeamMemberRole = (typeof FieldTeamMemberRole)[keyof typeof FieldTeamMemberRole];

export const FIELD_TEAM_MEMBER_ROLE_LABELS: Record<FieldTeamMemberRole, string> = {
  LEADER: 'Ekip sorumlusu',
  MEMBER: 'Ekip üyesi',
};

/** Work in the field is still going on (not completed, verified or cancelled). */
export const WORK_ORDER_OPEN_STATUSES: readonly WorkOrderStatus[] = [
  'CREATED',
  'ASSIGNED',
  'ACCEPTED',
  'EN_ROUTE',
  'ON_SITE',
  'IN_PROGRESS',
  'WAITING',
];

/** Evidence photo rules – the same pipeline and limits as request photos (SECURITY §5). */
export const WORK_ORDER_MEDIA_LIMITS = {
  maxBytes: 10 * 1024 * 1024,
  /** Per type (BEFORE / DURING / AFTER). */
  maxPerType: 5,
  mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
} as const;

/** Minimum number of AFTER photos before a work order can be completed. */
export const WORK_ORDER_REQUIRED_AFTER_PHOTOS = 1;

// ─── API contracts ───────────────────────────────────────────────────────────

interface NamedRef {
  id: string;
  name: string;
}

export interface PersonRef {
  id: string;
  fullName: string;
}

export interface WorkOrderSummary {
  id: string;
  publicNumber: string;
  title: string;
  status: WorkOrderStatus;
  priority: Priority;
  request: { id: string; publicNumber: string } | null;
  category: NamedRef | null;
  neighborhood: NamedRef | null;
  department: NamedRef & { code: string };
  fieldTeam: (NamedRef & { code: string }) | null;
  assignedUser: PersonRef | null;
  address: string | null;
  /** SLA of the source request (snapshot); the clock stops when the work is completed. */
  sla: RequestSla;
  createdAt: string;
}

export interface WorkOrderMediaItem extends RequestMediaItem {
  type: WorkOrderMediaType;
}

export interface WorkOrderTimelineEvent {
  id: string;
  type: string;
  description: string;
  oldStatus: WorkOrderStatus | null;
  newStatus: WorkOrderStatus | null;
  createdAt: string;
  performedBy: string | null;
}

export interface WorkOrderAssignmentItem {
  id: string;
  fieldTeam: NamedRef | null;
  assignee: PersonRef | null;
  assignedBy: string | null;
  note: string | null;
  assignedAt: string;
  /** null = current assignment. */
  unassignedAt: string | null;
}

export interface WorkOrderTransitionOption {
  to: WorkOrderStatus;
  label: string;
  requiresReason: boolean;
  /** The device position must be sent (field proximity check). */
  requiresLocation: boolean;
  /** completionDescription + at least one AFTER photo. */
  requiresCompletion: boolean;
}

export interface WorkOrderDetail extends WorkOrderSummary {
  /** Instructions from the person who created the work order. */
  description: string | null;
  source: {
    id: string;
    publicNumber: string;
    status: RequestStatus;
    description: string;
    media: RequestMediaItem[];
  } | null;
  /** Snapshot of the request location at creation; never follows later changes. */
  location: { latitude: number; longitude: number };
  completionDescription: string | null;
  cancellationReason: string | null;
  dates: {
    createdAt: string;
    acceptedAt: string | null;
    enRouteAt: string | null;
    arrivedAt: string | null;
    startedAt: string | null;
    completedAt: string | null;
    verifiedAt: string | null;
    cancelledAt: string | null;
  };
  media: WorkOrderMediaItem[];
  assignments: WorkOrderAssignmentItem[];
  timeline: WorkOrderTimelineEvent[];
  /** What the current user may do next (the API enforces the same rules). */
  actions: {
    transitions: WorkOrderTransitionOption[];
    canAssign: boolean;
    canUploadMedia: WorkOrderMediaType[];
  };
  /** Field proximity rule (ARCHITECTURE §6.4). */
  proximity: { radiusMeters: number; bypass: boolean };
  updatedAt: string;
}

export interface FieldTeamSummary {
  id: string;
  code: string;
  name: string;
  status: RecordStatus;
  department: NamedRef & { code: string };
  leader: PersonRef | null;
  memberCount: number;
  activeWorkOrders: number;
  completedWorkOrders: number;
  createdAt: string;
}

export interface FieldTeamMemberItem {
  userId: string;
  fullName: string;
  email: string;
  role: FieldTeamMemberRole;
  joinedAt: string;
  /** false when the account is no longer active (it cannot be assigned). */
  active: boolean;
}

export interface FieldTeamDetail extends FieldTeamSummary {
  members: FieldTeamMemberItem[];
  updatedAt: string;
}

/** A user that may be added to a team of the given department (active, can execute work). */
export interface FieldStaffCandidate extends PersonRef {
  email: string;
}
