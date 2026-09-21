"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  UserPlus,
  ChevronRight,
  Users,
  ChevronLeft,
  X,
  SlidersHorizontal,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { cn, formatDate, calculateAge } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { SkeletonTable } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiClient } from "@/lib/api/client";
import { useAuthStore } from "@/lib/stores/auth.store";
import { UserRole } from "@medivault/shared";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Patient {
  id?: string;
  _id?: string;
  patientId: string;
  profileId: string | null;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: "MALE" | "FEMALE" | "OTHER";
  bloodGroup: string;
  phoneNumber: string;
  email: string | null;
  hasBiometric: boolean;
  isActive: boolean;
  createdAt: string;
  lastVisitAt: string | null;
}

interface PaginatedPatients {
  data: Patient[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const LIMIT = 20;

const genderLabel: Record<string, string> = {
  MALE: "Male",
  FEMALE: "Female",
  OTHER: "Other",
};

const bloodGroupColors: Record<string, string> = {
  "A+": "text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400",
  "A-": "text-red-500 bg-red-50 dark:bg-red-900/20 dark:text-red-400",
  "B+": "text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400",
  "B-": "text-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400",
  "AB+":
    "text-purple-600 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-400",
  "AB-":
    "text-purple-500 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-400",
  "O+": "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400",
  "O-": "text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400",
};

// ─── Patients List Page ───────────────────────────────────────────────────────
export default function PatientsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const canRegister =
    user?.role === UserRole.RECEPTIONIST ||
    user?.role === UserRole.ORG_ADMIN ||
    user?.role === UserRole.FACILITY_ADMIN ||
    user?.role === UserRole.SUPER_ADMIN;

  // ─── Filters ────────────────────────────────────────────────────────────────
  const [rawSearch, setRawSearch] = React.useState(searchParams.get("q") ?? "");
  const [genderFilter, setGenderFilter] = React.useState("");
  const [bloodGroupFilter, setBloodGroupFilter] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [showFilters, setShowFilters] = React.useState(false);

  const searchQuery = useDebounce(rawSearch, 400);

  // Reset page when search/filters change
  React.useEffect(() => {
    setPage(1);
  }, [searchQuery, genderFilter, bloodGroupFilter]);

  // The backend enforces @MinLength(3) on the q param — suppress the request
  // while the user is still typing the first 1-2 characters to avoid 400s.
  const isQueryTooShort = searchQuery.length > 0 && searchQuery.length < 3;

  // ─── Query ──────────────────────────────────────────────────────────────────
  const { data, isLoading, isError } = useQuery({
    queryKey: ["patients", searchQuery, genderFilter, bloodGroupFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(LIMIT),
      });
      if (searchQuery) params.set("q", searchQuery);
      if (genderFilter) params.set("gender", genderFilter);
      if (bloodGroupFilter) params.set("bloodGroup", bloodGroupFilter);

      const res = await apiClient.get<PaginatedPatients>(
        `/patients?${params.toString()}`,
      );
      return res.data;
    },
    // Don't fire the query while the search term is between 1-2 chars (would
    // be rejected by the backend's @MinLength(3) validator with a 400).
    enabled: !isQueryTooShort,
    staleTime: 30_000,
  });

  const hasActiveFilters = !!(genderFilter || bloodGroupFilter);

  const clearFilters = () => {
    setGenderFilter("");
    setBloodGroupFilter("");
    setShowFilters(false);
  };

  return (
    <div className="space-y-5">
      {/* ─── Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Users</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {data?.total !== undefined
              ? `${data.total.toLocaleString()} registered users`
              : "User registry"}
          </p>
        </div>
        {canRegister && (
          <Button size="sm" asChild>
            <Link href="/patients/new">
              <UserPlus className="h-4 w-4" />
              Register User
            </Link>
          </Button>
        )}
      </div>

      {/* ─── Search + Filters ─────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex gap-2">
            {/* Search input */}
            <div className="relative flex-1">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                value={rawSearch}
                onChange={(e) => setRawSearch(e.target.value)}
                placeholder="Search by name, profile ID (e.g. AB3XY9KZ), phone, or email…"
                className={cn(
                  "flex h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm",
                  "placeholder:text-muted-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                )}
                aria-label="Search users"
              />
              {rawSearch && (
                <button
                  onClick={() => setRawSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Button
              variant={showFilters ? "default" : "outline"}
              size="icon"
              onClick={() => setShowFilters(!showFilters)}
              aria-label="Toggle filters"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          </div>
          {isQueryTooShort && (
            <p className="text-xs text-muted-foreground px-1">
              Type at least 3 characters to search…
            </p>
          )}

          {/* Filter row */}
          {showFilters && (
            <div className="flex flex-wrap gap-3 pt-1 border-t border-border">
              <div className="w-40">
                <Select value={genderFilter} onValueChange={setGenderFilter}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All genders</SelectItem>
                    <SelectItem value="MALE">Male</SelectItem>
                    <SelectItem value="FEMALE">Female</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-36">
                <Select
                  value={bloodGroupFilter}
                  onValueChange={setBloodGroupFilter}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Blood group" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All types</SelectItem>
                    {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map(
                      (bg) => (
                        <SelectItem key={bg} value={bg}>
                          {bg}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-3 w-3" />
                  Clear filters
                </button>
              )}
            </div>
          )}

          {/* Active filter chips */}
          {hasActiveFilters && !showFilters && (
            <div className="flex flex-wrap gap-2">
              {genderFilter && (
                <button
                  onClick={() => setGenderFilter("")}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/20"
                >
                  Gender: {genderLabel[genderFilter]}
                  <X className="h-3 w-3" />
                </button>
              )}
              {bloodGroupFilter && (
                <button
                  onClick={() => setBloodGroupFilter("")}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/20"
                >
                  Blood: {bloodGroupFilter}
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Results ─────────────────────────────────────────────────── */}
      <Card>
        {isLoading ? (
          <CardContent className="p-4">
            <SkeletonTable rows={8} cols={5} />
          </CardContent>
        ) : isError ? (
          <CardContent className="p-8 text-center space-y-2">
            <p className="text-sm font-medium text-destructive">
              Failed to load patients.
            </p>
            <p className="text-xs text-muted-foreground">
              Check your connection and try again.
            </p>
          </CardContent>
        ) : !data?.data?.length ? (
          <CardContent className="p-12 flex flex-col items-center gap-4 text-center">
            <div className="rounded-full bg-muted p-4">
              <Users className="h-8 w-8 text-muted-foreground/30" />
            </div>
            <div>
              <p className="text-sm font-medium">
                {rawSearch || hasActiveFilters
                  ? "No users match your search."
                  : "No users registered yet."}
              </p>
              {(rawSearch || hasActiveFilters) && (
                <p className="text-xs text-muted-foreground mt-1">
                  Try adjusting your search or clearing filters.
                </p>
              )}
            </div>
            {canRegister && !rawSearch && !hasActiveFilters && (
              <Button size="sm" asChild>
                <Link href="/patients/new">Register first user</Link>
              </Button>
            )}
          </CardContent>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                      User
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                      User ID
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                      Contact
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                      Blood
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                      Last Visit
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                      Status
                    </th>
                    <th className="py-3 px-4" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.data.map((patient) => {
                    const pid = patient.id ?? patient._id ?? patient.patientId;
                    return (
                      <tr
                        key={pid}
                        onClick={() => router.push(`/patients/${pid}`)}
                        className="hover:bg-accent/50 cursor-pointer transition-colors group"
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <Avatar
                              name={`${patient.firstName} ${patient.lastName}`}
                              size="sm"
                            />
                            <div>
                              <p className="font-medium group-hover:text-primary transition-colors">
                                {patient.firstName} {patient.lastName}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {calculateAge(patient.dateOfBirth)} ·{" "}
                                {genderLabel[patient.gender] ?? patient.gender}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-mono text-xs font-semibold text-primary">
                            {patient.profileId ?? "—"}
                          </span>
                          <p className="text-[11px] text-muted-foreground font-mono truncate max-w-[160px]">
                            {patient.patientId}
                          </p>
                        </td>
                        <td className="py-3 px-4">
                          <p className="text-sm">{patient.phoneNumber}</p>
                          {patient.email && (
                            <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                              {patient.email}
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold",
                              bloodGroupColors[patient.bloodGroup] ??
                                "text-muted-foreground bg-muted",
                            )}
                          >
                            {patient.bloodGroup}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm text-muted-foreground">
                          {patient.lastVisitAt
                            ? formatDate(patient.lastVisitAt, "short")
                            : "—"}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <Badge
                              variant={patient.isActive ? "success" : "gray"}
                              dot
                            >
                              {patient.isActive ? "Active" : "Inactive"}
                            </Badge>
                            {patient.hasBiometric && (
                              <Badge variant="purple" className="text-xs">
                                Biometric
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile card list */}
            <div className="md:hidden divide-y divide-border">
              {data.data.map((patient) => {
                const pid = patient.id ?? patient._id ?? patient.patientId;
                return (
                  <Link
                    key={pid}
                    href={`/patients/${pid}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-accent transition-colors group"
                  >
                    <Avatar
                      name={`${patient.firstName} ${patient.lastName}`}
                      size="sm"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium group-hover:text-primary transition-colors">
                        {patient.firstName} {patient.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {patient.profileId} ·{" "}
                        {calculateAge(patient.dateOfBirth)} ·{" "}
                        {patient.bloodGroup}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                );
              })}
            </div>

            {/* Pagination */}
            {data.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  Showing {(page - 1) * LIMIT + 1}–
                  {Math.min(page * LIMIT, data.total)} of {data.total}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {page} / {data.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() =>
                      setPage((p) => Math.min(data.totalPages, p + 1))
                    }
                    disabled={page === data.totalPages}
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
