'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Database, 
  FileText, 
  CheckCircle2, 
  Settings,
  FlaskConical,
  Route,
  ChevronRight,
  ChevronLeft,
  Home,
  Plus,
  List,
  Edit,
  ArrowRightLeft,
  XCircle,
  Upload,
  X as XIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { useSidebarNav } from './sidebar-nav-provider';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: NavItem[];
}

const navItems: NavItem[] = [
  {
    label: 'Home',
    href: '/',
    icon: Home,
  },
  {
    label: 'Setup',
    href: '/master-data',
    icon: Database,
    children: [
      { label: 'Your Account', href: '/master-data#account-info', icon: Home },
      { label: 'Issuing Organization', href: '/master-data#issuer', icon: Upload },
    ],
  },
  {
    label: 'Product Passports',
    href: '/passports',
    icon: FileText,
    children: [
      { label: 'Create', href: '/passports#create', icon: Plus },
      { label: 'Browse', href: '/passports#list', icon: List },
      { label: 'Update', href: '/passports#update', icon: Edit },
      { label: 'Revoke', href: '/passports#revoke', icon: XCircle },
      { label: 'Transfer', href: '/passports#transfer', icon: ArrowRightLeft },
      { label: 'History Events', href: '/traceability', icon: Route },
    ],
  },
  {
    label: 'Pilot',
    href: '/pilot',
    icon: FlaskConical,
    children: [
      { label: 'Pilot Mode', href: '/pilot', icon: FlaskConical },
      { label: 'History Events', href: '/traceability', icon: Route },
      { label: 'Demo Outcomes', href: '/pilot/recap', icon: FileText },
    ],
  },
  {
    label: 'Customer Verification',
    href: '/verification',
    icon: CheckCircle2,
  },
  {
    label: 'Advanced (Infrastructure)',
    href: '/administration',
    icon: Settings,
    children: [
      { label: 'Deployment', href: '/administration#deploy', icon: Upload },
      { label: 'Low-level Tools', href: '/administration#test', icon: Settings },
    ],
  },
];

export function SidebarNav() {
  const pathname = usePathname();
  const [currentHash, setCurrentHash] = useState<string>('');
  const [expandedItems, setExpandedItems] = useState<string[]>(['/master-data', '/passports', '/pilot', '/administration']);
  const { isMobileOpen, setIsMobileOpen, collapsed, setCollapsed } = useSidebarNav();
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Track hash for correct active state on hash-based routes
  useEffect(() => {
    const updateHash = () => setCurrentHash(window.location.hash || '');
    updateHash();
    window.addEventListener('hashchange', updateHash);
    return () => window.removeEventListener('hashchange', updateHash);
  }, [pathname]);

  const toggleExpanded = (href: string) => {
    setExpandedItems(prev => 
      prev.includes(href) 
        ? prev.filter(item => item !== href)
        : [...prev, href]
    );
  };

  const isActive = (href: string) => {
    if (href.includes('#')) {
      const [base, hash] = href.split('#');
      return pathname === base && currentHash === `#${hash}`;
    }
    if (href === pathname) return true;
    if (pathname?.startsWith(href + '/')) return true;
    return false;
  };

  const isExpanded = (href: string) => expandedItems.includes(href);

  const handleItemClick = (e: React.MouseEvent, hasChildren: boolean, href: string, isChild: boolean = false) => {
    // If sidebar is collapsed, expand it first
    if (collapsed) {
      setCollapsed(false);
      // If it has children, also toggle expansion
      if (hasChildren) {
        e.preventDefault();
        toggleExpanded(href);
      }
      return;
    }

    // Always close sidebar when clicking any item (both mobile and desktop)
    // For parent items with children, close after a brief delay to show expansion
    // For leaf items (including child items), close immediately
    if (hasChildren && !isChild) {
      // Parent item: close after showing expansion
      e.preventDefault();
      toggleExpanded(href);
      setTimeout(() => {
        setIsMobileOpen(false);
        // On desktop, also collapse the sidebar if it's expanded
        if (!isMobile) {
          setCollapsed(true);
        }
      }, 400);
    } else {
      // Leaf item or child item: close mobile menu, but keep desktop sidebar open
      setIsMobileOpen(false);
      // On desktop, don't collapse the sidebar when clicking child items
      // This allows users to navigate between child items without the sidebar closing
    }
  };

  const renderNavItem = (item: NavItem, level: number = 0) => {
    const active = isActive(item.href);
    const expanded = isExpanded(item.href);
    const hasChildren = item.children && item.children.length > 0;

    return (
      <div key={item.href}>
        {hasChildren ? (
          <button
            onClick={(e) => handleItemClick(e, true, item.href, level > 0)}
            className={cn(
              'w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors',
              'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              active && 'bg-sidebar-accent text-sidebar-accent-foreground',
              level > 0 && 'pl-8',
              collapsed && 'justify-center px-2'
            )}
            title={collapsed ? item.label : undefined}
          >
            <item.icon className="h-5 w-5 shrink-0" />
            {!collapsed && (
              <>
                <span className="flex-1 text-left">{item.label}</span>
                <ChevronRight 
                  className={cn(
                    'h-4 w-4 transition-transform',
                    expanded && 'rotate-90'
                  )} 
                />
              </>
            )}
          </button>
        ) : (
          <Link
            href={item.href}
            onClick={(e) => handleItemClick(e, false, item.href, level > 0)}
            className={cn(
              'flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors',
              'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              active && 'bg-sidebar-accent text-sidebar-accent-foreground border-l-4 border-[var(--sap-blue)]',
              level > 0 && 'pl-8',
              collapsed && 'justify-center px-2'
            )}
            title={collapsed ? item.label : undefined}
          >
            <item.icon className="h-5 w-5 shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </Link>
        )}

        {hasChildren && expanded && !collapsed && (
          <div className="mt-1">
            {item.children!.map(child => renderNavItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-10 h-full bg-[var(--sap-sidebar-bg)] dark:bg-[var(--sap-sidebar-bg)] border-r border-[var(--sap-border)]',
          'transform transition-all duration-300 ease-in-out',
          'lg:translate-x-0',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          collapsed ? 'w-16' : 'w-64'
        )}
      >
        <div className="flex h-full flex-col">
          {/* Sidebar Header */}
          <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
            {!collapsed && (
              <Link href="/" className="flex items-center gap-2" onClick={() => setIsMobileOpen(false)}>
                <span className="font-semibold text-sidebar-foreground">Fides Product Passports</span>
              </Link>
            )}
            <div className="flex items-center gap-2">
              {/* Collapse Toggle Button (Desktop Only) */}
              <button
                onClick={() => setCollapsed(!collapsed)}
                className="hidden lg:flex p-1.5 rounded-sm hover:bg-sidebar-accent transition-colors"
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {collapsed ? (
                  <ChevronRight className="h-4 w-4 text-sidebar-foreground" />
                ) : (
                  <ChevronLeft className="h-4 w-4 text-sidebar-foreground" />
                )}
              </button>
              {/* Close Button (Mobile Only) */}
              <button
                onClick={() => setIsMobileOpen(false)}
                className="lg:hidden p-1.5 rounded-sm hover:bg-sidebar-accent transition-colors"
                aria-label="Close menu"
              >
                <XIcon className="h-5 w-5 text-sidebar-foreground" />
              </button>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-4">
            {navItems.map(item => renderNavItem(item))}
          </nav>
        </div>
      </aside>

    </>
  );
}
