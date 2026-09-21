"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Bell,
  Menu,
  Sun,
  Moon,
  Monitor,
  ChevronDown,
  User,
} from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/lib/stores/auth.store";
import { PATIENT_ROLES } from "@medivault/shared";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

interface HeaderProps {
  onMenuClick?: () => void;
  title?: string;
}

export function Header({ onMenuClick, title }: HeaderProps) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/patients?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery("");
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  const resolvedTheme = mounted ? theme : undefined;
  const ThemeIcon = resolvedTheme === "dark" ? Moon : resolvedTheme === "light" ? Sun : Monitor;

  return (
    <header className="sticky top-0 z-nav flex h-14 items-center border-b border-border bg-card/80 backdrop-blur-sm px-4 gap-4">
      {/* Mobile menu button */}
      <button
        onClick={onMenuClick}
        className="lg:hidden rounded-md p-2 hover:bg-accent transition-colors"
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Page title */}
      {title && (
        <h1 className="text-base font-semibold hidden sm:block">{title}</h1>
      )}

      {/* Search bar (staff only — patients own no searchable registry) */}
      {(!user?.role || !PATIENT_ROLES.includes(user.role)) && (
        <form
          onSubmit={handleSearch}
          className="flex-1 max-w-md"
          role="search"
          aria-label="Search users"
        >
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search users by name, ID, phone…"
              className={cn(
                "h-8 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm",
                "placeholder:text-muted-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                "transition-colors",
              )}
              aria-label="Search users"
            />
          </div>
        </form>
      )}

      <div className="ml-auto flex items-center gap-1">
        {/* Theme toggle */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              className="rounded-md p-2 hover:bg-accent transition-colors"
              aria-label="Toggle theme"
            >
              <ThemeIcon className="h-4 w-4" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="z-modal min-w-[8rem] rounded-lg border border-border bg-popover p-1 shadow-md"
              align="end"
              sideOffset={4}
            >
              {(
                [
                  ["light", Sun, "Light"],
                  ["dark", Moon, "Dark"],
                  ["system", Monitor, "System"],
                ] as const
              ).map(([value, Icon, label]) => (
                <DropdownMenu.Item
                  key={value}
                  onSelect={() => setTheme(value)}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-sm",
                    "outline-none hover:bg-accent transition-colors",
                    theme === value && "text-primary font-medium",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        {/* Notifications */}
        <button
          className="relative rounded-md p-2 hover:bg-accent transition-colors"
          aria-label="Notifications (2 unread)"
        >
          <Bell className="h-4 w-4" />
          <span
            className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary"
            aria-hidden="true"
          />
        </button>

        {/* User menu */}
        {user && (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent transition-colors ml-1"
                aria-label={`User menu for ${user.firstName} ${user.lastName}`}
              >
                <Avatar
                  name={`${user.firstName} ${user.lastName}`}
                  src={user.avatarUrl}
                  size="sm"
                />
                <span className="hidden md:block text-sm font-medium">
                  {user.firstName}
                </span>
                <ChevronDown className="hidden md:block h-3 w-3 text-muted-foreground" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="z-modal min-w-[200px] rounded-lg border border-border bg-popover p-1 shadow-lg"
                align="end"
                sideOffset={6}
              >
                <div className="px-3 py-2 border-b border-border mb-1">
                  <p className="text-sm font-semibold">
                    {user.firstName} {user.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                  <Badge
                    variant="secondary"
                    className="mt-1 text-xs capitalize"
                  >
                    {user.role.toLowerCase().replace("_", " ")}
                  </Badge>
                </div>
                <DropdownMenu.Item
                  onSelect={() => router.push("/profile")}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-sm outline-none hover:bg-accent transition-colors"
                >
                  <User className="h-3.5 w-3.5" />
                  My Profile
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="my-1 h-px bg-border" />
                <DropdownMenu.Item
                  onSelect={() => void handleLogout()}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-sm outline-none text-destructive hover:bg-destructive/5 transition-colors"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                    />
                  </svg>
                  Logout
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        )}
      </div>
    </header>
  );
}
