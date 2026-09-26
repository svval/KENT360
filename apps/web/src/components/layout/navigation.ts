import { Permission } from '@kent360/shared-types';
import {
  Bell,
  ChartNoAxesColumn,
  ClipboardList,
  FileText,
  Inbox,
  LayoutDashboard,
  Map,
  MapPinned,
  ScrollText,
  Settings,
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
  /** Required permission; items are hidden (not just disabled) without it and the page is gated. */
  permission?: Permission;
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
        permission: Permission.REQUESTS_READ,
      },
      {
        href: '/work-orders',
        label: 'İş Emirleri',
        description: 'Sahaya çıkan işleri planlayın, atayın ve kapanışlarını doğrulayın.',
        icon: ClipboardList,
        permission: Permission.WORK_ORDERS_READ,
      },
      {
        href: '/field',
        label: 'Saha Operasyonları',
        description: 'Saha ekiplerini, personeli ve günlük iş yükünü takip edin.',
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
      {
        href: '/settings',
        label: 'Ayarlar',
        description: 'Belediye profili, marka renkleri, kategoriler ve SLA tanımları.',
        icon: Settings,
        permission: Permission.SETTINGS_MANAGE,
      },
    ],
  },
];

const allItems = navigation.flatMap((section) => section.items);

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
