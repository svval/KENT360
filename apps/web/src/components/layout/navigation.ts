import { Permission } from '@kent360/shared-types';
import {
  Bell,
  Building2,
  ChartNoAxesColumn,
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
  ShieldCheck,
  Truck,
  Users,
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
}

export interface NavSection {
  id: string;
  label?: string;
  items: NavItem[];
}

export const navigation: NavSection[] = [
  {
    id: 'operations',
    items: [
      {
        href: '/dashboard',
        label: 'Dashboard',
        description:
          'Kent operasyonlarının anlık durumu, kritik olaylar ve performans göstergeleri.',
        icon: LayoutDashboard,
      },
      {
        href: '/map',
        label: 'Canlı Harita',
        description: 'Talepleri, iş emirlerini ve mahalle yoğunluğunu harita üzerinde izleyin.',
        icon: Map,
        permission: Permission.REQUESTS_READ,
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
        href: '/field/teams',
        label: 'Saha Ekipleri',
        description: 'Müdürlüklerin saha ekipleri, sorumluları, üyeleri ve iş yükü.',
        icon: Truck,
        permission: Permission.FIELD_TEAMS_READ,
      },
      {
        href: '/neighborhoods',
        label: 'Mahalleler',
        description: 'MahallePulse: mahalle bazında talep yoğunluğu, çözüm süreleri ve eğilimler.',
        icon: MapPinned,
        permission: Permission.ANALYTICS_READ,
      },
      {
        href: '/analytics',
        label: 'Analitik',
        description: 'Kategori, mahalle, müdürlük ve öncelik bazında performans analizi.',
        icon: ChartNoAxesColumn,
        permission: Permission.ANALYTICS_READ,
      },
      {
        href: '/reports',
        label: 'Raporlar',
        description: 'Aylık talep, SLA, mahalle ve müdürlük raporlarını dışa aktarın.',
        icon: FileText,
        permission: Permission.REPORTS_EXPORT,
      },
      {
        href: '/notifications',
        label: 'Bildirimler',
        description: 'Size atanan işler, kritik talepler ve SLA uyarıları.',
        icon: Bell,
      },
    ],
  },
  {
    id: 'admin',
    label: 'Yönetim',
    items: [
      {
        href: '/users',
        label: 'Kullanıcılar',
        description: 'Personel ve vatandaş hesaplarını, müdürlük bağlantılarını yönetin.',
        icon: Users,
        permission: Permission.USERS_MANAGE,
      },
      {
        href: '/roles',
        label: 'Roller ve Yetkiler',
        description: 'Rollerin hangi işlemleri yapabileceğini belirleyin.',
        icon: ShieldCheck,
        permission: Permission.ROLES_MANAGE,
      },
      {
        href: '/audit',
        label: 'Audit Log',
        description: 'Kritik işlemlerin değiştirilemez denetim kaydı.',
        icon: ScrollText,
        permission: Permission.AUDIT_READ,
      },
    ],
  },
  {
    id: 'settings',
    label: 'Ayarlar',
    items: [
      {
        href: '/settings/municipality',
        label: 'Belediye Profili',
        description: 'Belediye bilgileri, iletişim, logo ve marka renkleri.',
        icon: Building2,
        permission: Permission.MUNICIPALITY_READ,
      },
      {
        href: '/settings/departments',
        label: 'Müdürlükler',
        description: 'Talepleri karşılayan müdürlükler ve durumları.',
        icon: Network,
        permission: Permission.DEPARTMENTS_READ,
      },
      {
        href: '/settings/categories',
        label: 'Talep Kategorileri',
        description: 'Kategori ağacı, müdürlük yönlendirmesi, varsayılan öncelik ve SLA süreleri.',
        icon: FolderTree,
        permission: Permission.CATEGORIES_READ,
      },
      {
        href: '/settings/neighborhoods',
        label: 'Mahalle Sınırları',
        description: 'Mahalle listesi, sınır geometrileri ve GeoJSON içe aktarma.',
        icon: LandPlot,
        permission: Permission.NEIGHBORHOODS_READ,
      },
    ],
  },
];

const allItems = navigation.flatMap((section) => section.items);

export function canAccessNavItem(
  item: Pick<NavItem, 'permission'>,
  hasPermission: (permission: Permission) => boolean,
): boolean {
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
