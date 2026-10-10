"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  UserPlus,
  Fingerprint,
  ClipboardList,
  Shield,
  LogOut,
  ChevronLeft,
  ScrollText,
  UserCircle,
  FileText,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/lib/stores/auth.store";
import { UserRole, PATIENT_ROLES } from "@medivault/shared";

// ─── Nav Item Type ────────────────────────────────────────────────────────────
interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
  roles?: UserRole[];
  children?: NavItem[];
}

// ─── Navigation Structure ─────────────────────────────────────────────────────
const navItems: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "My Profile",
    href: "/profile",
    icon: UserCircle,
  },
  {
    label: "Fingerprint ID",
    href: "/fingerprint",
    icon: Fingerprint,
    roles: [
      UserRole.SUPER_ADMIN,
      UserRole.ORG_ADMIN,
      UserRole.FACILITY_ADMIN,
      UserRole.DOCTOR,
      UserRole.NURSE,
      UserRole.RECEPTIONIST,
    ],
  },
  {
    label: "Patients",
    href: "/patients",
    icon: Users,
    roles: [
      UserRole.SUPER_ADMIN,
      UserRole.ORG_ADMIN,
      UserRole.FACILITY_ADMIN,
      UserRole.DOCTOR,
      UserRole.NURSE,
      UserRole.RECEPTIONIST,
    ],
  },
  {
    label: "Register Patient",
    href: "/patients/new",
    icon: UserPlus,
    roles: [
      UserRole.SUPER_ADMIN,
      UserRole.ORG_ADMIN,
      UserRole.FACILITY_ADMIN,
      UserRole.RECEPTIONIST,
    ],
  },
  {
    label: "My Records",
    href: "/my-records",
    icon: ClipboardList,
    roles: [...PATIENT_ROLES],
  },
];

const adminNavItems: NavItem[] = [
  {
    label: "Admin Panel",
    href: "/admin",
    icon: Shield,
    roles: [UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN],
  },
  {
    label: "Medical Documents",
    href: "/admin/documents",
    icon: FileText,
    roles: [UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN],
  },
  {
    label: "Audit Logs",
    href: "/admin/audit-logs",
    icon: ScrollText,
    roles: [UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN],
  },
];

// ─── Single nav item link ─────────────────────────────────────────────────────
function NavLink({
  item,
  collapsed,
  onClick,
}: {
  item: NavItem;
  collapsed: boolean;
  onClick?: () => void;
}) {
  const pathname = usePathname();
  const isActive =
    item.href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname.startsWith(item.href);

  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        "group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors duration-150",
        isActive
          ? "bg-sidebar-accent text-sidebar-primary"
          : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60",
        collapsed && "justify-center px-2",
      )}
      title={collapsed ? item.label : undefined}
      aria-current={isActive ? "page" : undefined}
    >
      <item.icon
        className={cn(
          "h-4 w-4 flex-shrink-0",
          isActive ? "text-sidebar-primary" : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground",
        )}
        aria-hidden="true"
      />
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{item.label}</span>
          {item.badge && (
            <Badge variant="info" className="text-xs">
              {item.badge}
            </Badge>
          )}
        </>
      )}
    </Link>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
interface SidebarProps {
  collapsed: boolean;
  onCollapsedChange: (c: boolean) => void;
  /** Mobile: close button shows an X and onClose hides the drawer. */
  mobile?: boolean;
  onClose?: () => void;
}

export function Sidebar({
  collapsed,
  onCollapsedChange,
  mobile,
  onClose,
}: SidebarProps) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  // Filter nav items by role
  const filteredNavItems = navItems.filter(
    (item) => !item.roles || (user?.role && item.roles.includes(user.role)),
  );
  const filteredAdminItems = adminNavItems.filter(
    (item) => !item.roles || (user?.role && item.roles.includes(user.role)),
  );

  const handleLogout = async () => {
    await logout();
    window.location.href = "/login";
  };

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300",
        collapsed ? "w-16" : "w-64",
      )}
      aria-label="Main navigation"
    >
      {/* Logo */}
      <div
        className={cn(
          "flex h-14 items-center border-b border-sidebar-border px-3 flex-shrink-0",
          collapsed ? "justify-center" : "justify-between",
        )}
      >
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <Image
              src="/medivault-logo.png"
              alt="Medivault"
              width={1392}
              height={1130}
              priority
              className="h-7 w-auto brightness-0 invert"
            />
          </Link>
        )}

        {/* Desktop collapse / mobile close */}
        {mobile ? (
          <button
            onClick={onClose}
            className="rounded-md p-1 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={() => onCollapsedChange(!collapsed)}
            className="rounded-md p-1 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <ChevronLeft
              className={cn(
                "h-4 w-4 transition-transform duration-300",
                collapsed && "rotate-180",
              )}
            />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {filteredNavItems.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            collapsed={collapsed}
            onClick={mobile ? onClose : undefined}
          />
        ))}

        {filteredAdminItems.length > 0 && (
          <>
            {!collapsed && (
              <p className="px-3 pt-4 pb-1 text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/30">
                Admin
              </p>
            )}
            {collapsed && <div className="my-2 border-t border-sidebar-border/50" />}
            {filteredAdminItems.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                collapsed={collapsed}
                onClick={mobile ? onClose : undefined}
              />
            ))}
          </>
        )}
      </nav>

      {/* User section */}
      <div className={cn("border-t border-sidebar-border p-3", collapsed && "px-2")}>
        {!collapsed && user ? (
          <div className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-sidebar-accent transition-colors">
            <Avatar
              name={`${user.firstName} ${user.lastName}`}
              src={user.avatarUrl}
              size="sm"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-xs text-sidebar-foreground/50 truncate capitalize">
                {user.role.toLowerCase().replace("_", " ")}
              </p>
            </div>
          </div>
        ) : (
          collapsed &&
          user && (
            <div className="flex justify-center">
              <Avatar
                name={`${user.firstName} ${user.lastName}`}
                src={user.avatarUrl}
                size="sm"
              />
            </div>
          )
        )}
        <button
          onClick={() => void handleLogout()}
          className={cn(
            "mt-1 flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium",
            "text-sidebar-foreground/50 hover:text-alert-red-400 hover:bg-alert-red-950/30 transition-colors",
            collapsed && "justify-center px-2",
          )}
          aria-label="Logout"
        >
          <LogOut className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
}
