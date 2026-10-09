import { Permission } from '@kent360/shared-types';
import {
  Bell,
  Building2,
  ClipboardList,
  FileText,
  FolderTree,
  Inbox,
  LandPlot,
  LayoutDashboard,
  Map,
  MapPinned,
  Network,
  ScrollText,
  Truck,
  UserRound,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  /** Page subtitle shown under the title. */
  description: string;
  icon: LucideIcon;
  /**
   * Required permission – a list means "any of". Items are hidden (not just disabled)
   * without it and the page is gated. The API enforces the same rules.
   */
  permission?: Permission | readonly Permission[];
  /** A second permission that is required as well (e.g. "staff only" for settings). */
  alsoRequires?: Permission;
  /** Reachable from the topbar (bell, user menu) instead of the sidebar. */
  hidden?: boolean;
}

export interface NavSection {
  id: string;
  label?: string;
  items: NavItem[];
}

export const navigation: NavSection[] = [
  {
    id: 'operations',
    label: 'Operasyon',
    items: [
      {
        href: '/dashboard',
        label: 'Dashboard',
        description:
          'Kent operasyonlarının anlık durumu, kritik olaylar ve performans göstergeleri.',
        icon: LayoutDashboard,
      },
      {
        href: '/requests',
        label: 'Talepler',
        description: 'Belediyeye iletilen vatandaş ve kurum taleplerini yönetin.',
        icon: Inbox,
        // Citizens see their own requests here (requests.readOwn).
        permission: [Permission.REQUESTS_READ, Permission.REQUESTS_READ_OWN],
      },
      {
        href: '/work-orders',
        label: 'İş Emirleri',
        description: 'Sahaya çıkan işleri planlayın, atayın ve kapanışlarını doğrulayın.',
        icon: ClipboardList,
        // Field staff and team leaders see their own work here ("Görevlerim").
        permission: [Permission.WORK_ORDERS_READ, Permission.WORK_ORDERS_READ_ASSIGNED],
      },
      {
        href: '/map',
        label: 'Canlı Harita',
        description:
          'Talepleri, iş emirlerini ve mahalle sınırlarını canlı harita üzerinde izleyin.',
        icon: Map,
        // Field staff see their own work orders on the map (no request layers).
        permission: [
          Permission.REQUESTS_READ,
          Permission.WORK_ORDERS_READ,
          Permission.WORK_ORDERS_READ_ASSIGNED,
        ],
      },
    ],
  },
  {
    id: 'intelligence',
    label: 'Kent Zekâsı',
    items: [
      {
        href: '/neighborhoods',
        label: 'MahallePulse',
        description:
          'Mahalle bazında talep yoğunluğu, açıklanabilir risk skoru, eğilimler ve anomaliler.',
        icon: MapPinned,
        permission: Permission.ANALYTICS_READ,
        alsoRequires: Permission.REQUESTS_READ,
      },
    ],
  },
  {
    id: 'admin',
    label: 'Yönetim',
    items: [
      {
        href: '/field/teams',
        label: 'Saha Ekipleri',
        description: 'Müdürlüklerin saha ekipleri, sorumluları, üyeleri ve iş yükü.',
        icon: Truck,
        permission: Permission.FIELD_TEAMS_READ,
      },
      {
        href: '/settings/departments',
        label: 'Müdürlükler',
        description: 'Talepleri karşılayan müdürlükler ve durumları.',
        icon: Network,
        permission: Permission.DEPARTMENTS_READ,
        alsoRequires: Permission.REQUESTS_READ,
      },
      {
        href: '/settings/categories',
        label: 'Talep Kategorileri',
        description: 'Kategori ağacı, müdürlük yönlendirmesi, varsayılan öncelik ve SLA süreleri.',
        icon: FolderTree,
        permission: Permission.CATEGORIES_READ,
        alsoRequires: Permission.REQUESTS_READ,
      },
      {
        href: '/settings/neighborhoods',
        label: 'Mahalle Sınırları',
        description: 'Mahalle listesi, sınır geometrileri ve GeoJSON içe aktarma.',
        icon: LandPlot,
        permission: Permission.NEIGHBORHOODS_READ,
        alsoRequires: Permission.REQUESTS_READ,
      },
      {
        href: '/settings/municipality',
        label: 'Belediye Profili',
        description: 'Belediye bilgileri, iletişim, logo ve marka renkleri.',
        icon: Building2,
        permission: Permission.MUNICIPALITY_READ,
      },
    ],
  },
  {
    id: 'reporting',
    label: 'Raporlama',
    items: [
      {
        href: '/reports',
        label: 'Raporlar',
        description:
          'Talep, iş emri, SLA, müdürlük ve mahalle performansı – ekranda özet, CSV olarak dışa aktarım.',
        icon: FileText,
        permission: Permission.REPORTS_EXPORT,
        alsoRequires: Permission.REQUESTS_READ,
      },
      {
        href: '/audit',
        label: 'Audit',
        description:
          'Kritik işlemlerin değiştirilemez denetim kaydı: kim, ne zaman, neyi değiştirdi.',
        icon: ScrollText,
        permission: Permission.AUDIT_READ,
      },
    ],
  },
  {
    id: 'user',
    items: [
      {
        href: '/notifications',
        label: 'Bildirimler',
        description: 'Size atanan işler, SLA uyarıları ve takip ettiğiniz taleplerdeki gelişmeler.',
        icon: Bell,
        hidden: true,
      },
      {
        href: '/profile',
        label: 'Profilim',
        description: 'Hesap bilgileriniz, rolleriniz ve yetkileriniz.',
        icon: UserRound,
        hidden: true,
      },
    ],
  },
];

const allItems = navigation.flatMap((section) => section.items);

export function canAccessNavItem(
  item: Pick<NavItem, 'permission' | 'alsoRequires'>,
  hasPermission: (permission: Permission) => boolean,
): boolean {
  if (item.alsoRequires && !hasPermission(item.alsoRequires)) return false;
  if (!item.permission) return true;
  const required = Array.isArray(item.permission)
    ? item.permission
    : [item.permission as Permission];
  return required.some((permission) => hasPermission(permission));
}

/** Longest-prefix match so /requests/123 resolves to "Talepler". */
export function findNavItem(pathname: string): NavItem | undefined {
  return allItems
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

export function getNavItem(href: string): NavItem {
  const item = allItems.find((candidate) => candidate.href === href);
  if (!item) throw new Error(`Unknown navigation href: ${href}`);
  return item;
}
