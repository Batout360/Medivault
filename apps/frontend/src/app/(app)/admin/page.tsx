"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Users,
  Shield,
  AlertTriangle,
  Plus,
  Search,
  UserCheck,
  UserX,
  FileText,
  Server,
  Database,
  MoreVertical,
  Edit,
  Lock,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { SkeletonTable } from "@/components/ui/skeleton";
import { ConfirmModal } from "@/components/ui/modal";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { apiClient } from "@/lib/api/client";
import { cn, formatDate } from "@/lib/utils";
import { useAuthStore } from "@/lib/stores/auth.store";
import { UserRole, UserRoleLabels } from "@medivault/shared";

// ─── Types ────────────────────────────────────────────────────────────────────
interface UserSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  isEmailVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  avatarUrl: string | null;
}

interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  totalPatients: number;
  biometricEnrollments: number;
  securityEvents24h: number;
  failedLogins24h: number;
  storageUsedMb: number;
  databaseSizeMb: number;
}

interface SecurityEvent {
  id: string;
  event: string;
  userId: string | null;
  userEmail: string | null;
  ipAddress: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  timestamp: string;
  details: string | null;
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function AdminStatCard({
  title,
  value,
  icon: Icon,
  variant = "default",
  alert,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  variant?: "default" | "danger" | "warning";
  alert?: boolean;
}) {
  return (
    <Card className={cn(alert && "border-amber-300 dark:border-amber-700")}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {title}
            </p>
            <p
              className={cn(
                "text-2xl font-bold mt-1 tabular-nums",
                variant === "danger" && "text-destructive",
                variant === "warning" && "text-amber-600 dark:text-amber-400",
              )}
            >
              {value}
            </p>
          </div>
          <div
            className={cn(
              "rounded-xl p-2.5",
              variant === "default" && "bg-muted text-muted-foreground",
              variant === "danger" &&
                "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
              variant === "warning" &&
                "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
            )}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Role badge ───────────────────────────────────────────────────────────────
const roleVariant: Record<
  UserRole,
  "default" | "warning" | "info" | "success" | "gray" | "purple"
> = {
  [UserRole.SUPER_ADMIN]: "purple",
  [UserRole.ORG_ADMIN]: "warning",
  [UserRole.FACILITY_ADMIN]: "warning",
  [UserRole.DOCTOR]: "info",
  [UserRole.NURSE]: "success",
  [UserRole.PHARMACIST]: "info",
  [UserRole.LAB_TECHNICIAN]: "info",
  [UserRole.RADIOLOGIST]: "info",
  [UserRole.RECEPTIONIST]: "default",
  [UserRole.BILLING_STAFF]: "default",
  [UserRole.USER]: "gray",
  [UserRole.PATIENT]: "gray",
  [UserRole.AUDITOR]: "gray",
};

// ─── Security event severity badge ────────────────────────────────────────────
const severityVariant: Record<
  string,
  "destructive" | "warning" | "info" | "gray"
> = {
  CRITICAL: "destructive",
  HIGH: "destructive",
  MEDIUM: "warning",
  LOW: "info",
};

// ─── Admin Page ───────────────────────────────────────────────────────────────
export default function AdminPage() {
  const currentUser = useAuthStore((s) => s.user);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [userSearch, setUserSearch] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState<UserRole | "">("");
  const [confirmDeactivate, setConfirmDeactivate] = React.useState<
    string | null
  >(null);

  // Admin stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: async () => {
      const res = await apiClient.get<AdminStats>("/admin/stats");
      return res.data;
    },
    staleTime: 60_000,
  });

  // Users list
  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ["admin", "users", userSearch, roleFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "50" });
      if (userSearch) params.set("q", userSearch);
      if (roleFilter) params.set("role", roleFilter);
      const res = await apiClient.get<{ data: UserSummary[]; total: number }>(
        `/users?${params.toString()}`,
      );
      return res.data;
    },
    staleTime: 30_000,
  });

  // Security events (paginated — backend returns { data: [...], total, ... })
  const { data: securityEvents, isLoading: eventsLoading } = useQuery({
    queryKey: ["admin", "security-events"],
    queryFn: async () => {
      const res = await apiClient.get<{ data: SecurityEvent[] }>(
        "/audit-logs?type=security&limit=10",
      );
      return res.data?.data ?? [];
    },
    staleTime: 30_000,
  });

  // Toggle user active/inactive
  const toggleUserMutation = useMutation({
    mutationFn: async ({
      userId,
      isActive,
    }: {
      userId: string;
      isActive: boolean;
    }) => {
      await apiClient.patch(`/users/${userId}`, { isActive });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      toast.success("User updated");
      setConfirmDeactivate(null);
    },
    onError: () => toast.error("Failed to update user"),
  });

  const canManageUsers = [
    UserRole.SUPER_ADMIN,
    UserRole.ORG_ADMIN,
    UserRole.FACILITY_ADMIN,
  ].includes(currentUser?.role as UserRole);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Admin Panel</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            System administration and user management
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/audit-logs">
              <FileText className="h-4 w-4" />
              Audit Logs
            </Link>
          </Button>
          {canManageUsers && (
            <Button size="sm" asChild>
              <Link href="/admin/users/new">
                <Plus className="h-4 w-4" />
                Add User
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      {statsLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Card key={i}>
              <CardContent className="p-5 h-20" />
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <AdminStatCard
            title="Total Staff"
            value={stats?.totalUsers ?? 0}
            icon={Users}
          />
          <AdminStatCard
            title="Active Users"
            value={stats?.activeUsers ?? 0}
            icon={UserCheck}
            variant="default"
          />
          <AdminStatCard
            title="Failed Logins (24h)"
            value={stats?.failedLogins24h ?? 0}
            icon={Lock}
            variant={
              (stats?.failedLogins24h ?? 0) > 20
                ? "danger"
                : (stats?.failedLogins24h ?? 0) > 10
                  ? "warning"
                  : "default"
            }
            alert={(stats?.failedLogins24h ?? 0) > 10}
          />
          <AdminStatCard
            title="Security Events"
            value={stats?.securityEvents24h ?? 0}
            icon={AlertTriangle}
            variant={
              (stats?.securityEvents24h ?? 0) > 5
                ? "danger"
                : (stats?.securityEvents24h ?? 0) > 2
                  ? "warning"
                  : "default"
            }
            alert={(stats?.securityEvents24h ?? 0) > 2}
          />
        </div>
      )}

      {/* Main tabs */}
      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="security">Security Events</TabsTrigger>
          <TabsTrigger value="system">System</TabsTrigger>
        </TabsList>

        {/* Users tab */}
        <TabsContent value="users" className="mt-4">
          <Card>
            <CardHeader className="pb-0 px-4 pt-4">
              <div className="flex flex-wrap items-center gap-3">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <input
                    type="search"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Search by name or email…"
                    className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  />
                </div>
                {/* Role filter */}
                <div className="flex gap-1.5 flex-wrap">
                  {[
                    "",
                    ...Object.values(UserRole).filter(
                      (r) => r !== UserRole.PATIENT,
                    ),
                  ].map((role) => (
                    <button
                      key={role || "all"}
                      onClick={() => setRoleFilter(role as UserRole | "")}
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                        (roleFilter as string) === role
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-accent",
                      )}
                    >
                      {role ? UserRoleLabels[role as UserRole] : "All"}
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0 mt-3">
              {usersLoading ? (
                <div className="p-4">
                  <SkeletonTable rows={6} cols={4} />
                </div>
              ) : !users?.data?.length ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No users found.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/20">
                        <th className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          User
                        </th>
                        <th className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Role
                        </th>
                        <th className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden sm:table-cell">
                          Last Login
                        </th>
                        <th className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Status
                        </th>
                        <th className="py-2 px-4" aria-label="Actions" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {users.data.map((u) => (
                        <tr
                          key={u.id}
                          className="hover:bg-accent/30 transition-colors group"
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <Avatar
                                name={`${u.firstName} ${u.lastName}`}
                                src={u.avatarUrl}
                                size="sm"
                              />
                              <div>
                                <p className="font-medium group-hover:text-primary transition-colors">
                                  {u.firstName} {u.lastName}
                                  {u.id === currentUser?.id && (
                                    <span className="ml-1 text-xs text-muted-foreground">
                                      (you)
                                    </span>
                                  )}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {u.email}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <Badge variant={roleVariant[u.role] ?? "gray"}>
                              {UserRoleLabels[u.role] ?? u.role}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-muted-foreground hidden sm:table-cell text-xs">
                            {u.lastLoginAt
                              ? formatDate(u.lastLoginAt, "relative")
                              : "Never"}
                          </td>
                          <td className="py-3 px-4">
                            <Badge
                              variant={u.isActive ? "success" : "gray"}
                              dot
                            >
                              {u.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </td>
                          <td className="py-3 px-4">
                            {u.id !== currentUser?.id && (
                              <DropdownMenu.Root>
                                <DropdownMenu.Trigger asChild>
                                  <button
                                    className="rounded-md p-1 hover:bg-accent transition-colors opacity-0 group-hover:opacity-100"
                                    aria-label={`Actions for ${u.firstName}`}
                                  >
                                    <MoreVertical className="h-4 w-4" />
                                  </button>
                                </DropdownMenu.Trigger>
                                <DropdownMenu.Portal>
                                  <DropdownMenu.Content
                                    className="z-50 min-w-[160px] rounded-lg border border-border bg-popover p-1 shadow-md"
                                    align="end"
                                    sideOffset={4}
                                  >
                                    <DropdownMenu.Item
                                      onSelect={() =>
                                        router.push(`/admin/users/${u.id}/edit`)
                                      }
                                      className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-sm outline-none hover:bg-accent"
                                    >
                                      <Edit className="h-3.5 w-3.5" />
                                      Edit User
                                    </DropdownMenu.Item>
                                    <DropdownMenu.Item
                                      onSelect={() =>
                                        setConfirmDeactivate(u.id)
                                      }
                                      className={cn(
                                        "flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-sm outline-none hover:bg-accent",
                                        u.isActive &&
                                          "text-destructive hover:bg-destructive/5",
                                      )}
                                    >
                                      {u.isActive ? (
                                        <>
                                          <UserX className="h-3.5 w-3.5" />
                                          Deactivate
                                        </>
                                      ) : (
                                        <>
                                          <UserCheck className="h-3.5 w-3.5" />
                                          Activate
                                        </>
                                      )}
                                    </DropdownMenu.Item>
                                  </DropdownMenu.Content>
                                </DropdownMenu.Portal>
                              </DropdownMenu.Root>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Events tab */}
        <TabsContent value="security" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Security Events</CardTitle>
                  <CardDescription>
                    Recent security alerts and anomalies
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/admin/audit-logs?type=security">View All</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {eventsLoading ? (
                <div className="p-4">
                  <SkeletonTable rows={5} cols={3} />
                </div>
              ) : !securityEvents?.length ? (
                <div className="p-8 text-center">
                  <Shield className="mx-auto h-8 w-8 text-emerald-500/30 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No security events in the last 24h
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {securityEvents.map((event) => (
                    <div
                      key={event.id}
                      className="flex items-start gap-4 px-4 py-3"
                    >
                      <div className="flex-shrink-0 mt-0.5">
                        <AlertTriangle
                          className={cn(
                            "h-4 w-4",
                            event.severity === "CRITICAL" ||
                              event.severity === "HIGH"
                              ? "text-destructive"
                              : "text-amber-500",
                          )}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{event.event}</p>
                        {event.userEmail && (
                          <p className="text-xs text-muted-foreground">
                            {event.userEmail}
                          </p>
                        )}
                        {event.details && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {event.details}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge
                          variant={severityVariant[event.severity] ?? "gray"}
                        >
                          {event.severity}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(event.timestamp, "relative")}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* System tab */}
        <TabsContent value="system" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Database
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total users</span>
                  <span className="font-medium">
                    {stats?.totalPatients?.toLocaleString() ?? "—"}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">DB size</span>
                  <span className="font-medium">
                    {stats?.databaseSizeMb ? `${stats.databaseSizeMb} MB` : "—"}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Biometric enrollments
                  </span>
                  <span className="font-medium">
                    {stats?.biometricEnrollments ?? "—"}
                  </span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Server className="h-4 w-4" />
                  Storage
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Documents used</span>
                  <span className="font-medium">
                    {stats?.storageUsedMb ? `${stats.storageUsedMb} MB` : "—"}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Biometric templates
                  </span>
                  <span className="font-medium">Encrypted at rest</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Confirm deactivate modal */}
      {confirmDeactivate &&
        (() => {
          const u = users?.data?.find((x) => x.id === confirmDeactivate);
          return (
            <ConfirmModal
              open={!!confirmDeactivate}
              onOpenChange={(open) => !open && setConfirmDeactivate(null)}
              title={u?.isActive ? "Deactivate User" : "Activate User"}
              description={
                u?.isActive
                  ? `Deactivate ${u?.firstName} ${u?.lastName}? They will no longer be able to log in.`
                  : `Activate ${u?.firstName} ${u?.lastName}? They will be able to log in again.`
              }
              confirmLabel={u?.isActive ? "Deactivate" : "Activate"}
              variant={u?.isActive ? "destructive" : "default"}
              onConfirm={() => {
                if (u) {
                  toggleUserMutation.mutate({
                    userId: u.id,
                    isActive: !u.isActive,
                  });
                }
              }}
              loading={toggleUserMutation.isPending}
            />
          );
        })()}
    </div>
  );
}
