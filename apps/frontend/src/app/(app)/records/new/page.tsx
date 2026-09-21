'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  Stethoscope,
  Pill,
  Activity,
  FlaskConical,
  User,
  ChevronLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { Spinner } from '@/components/ui/spinner';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/lib/stores/auth.store';
import { UserRole } from '@medivault/shared';
import { formatDate, calculateAge } from '@/lib/utils';

interface SearchPatientItem {
  id?: string;
  _id?: string;
  mrn?: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  gender?: string;
  bloodGroup?: string | null;
}

interface SearchResult {
  data: SearchPatientItem[];
  total: number;
}

const CAN_WRITE_ROLES = new Set<string>([
  UserRole.SUPER_ADMIN,
  UserRole.ORG_ADMIN,
  UserRole.FACILITY_ADMIN,
  UserRole.DOCTOR,
]);

const RECORD_TYPES = [
  { key: 'diagnoses', label: 'Diagnosis', icon: Stethoscope },
  { key: 'prescriptions', label: 'Prescription', icon: Pill },
  { key: 'vitals', label: 'Vitals', icon: Activity },
  { key: 'labs', label: 'Lab Report', icon: FlaskConical },
] as const;

export default function NewRecordPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const canWrite = user?.role ? CAN_WRITE_ROLES.has(user.role) : false;

  const [query, setQuery] = React.useState('');
  const trimmed = query.trim();

  const { data, isFetching } = useQuery({
    queryKey: ['patients', 'search', trimmed],
    queryFn: async () => {
      const res = await apiClient.get<SearchResult>(
        `/patients?q=${encodeURIComponent(trimmed)}&limit=20`,
      );
      return res.data;
    },
    enabled: trimmed.length >= 2,
    staleTime: 30_000,
  });

  const results = data?.data ?? [];
  const fullName = (p: SearchPatientItem) => `${p.firstName} ${p.lastName}`;
  const patientId = (p: SearchPatientItem) => p.id ?? p._id ?? '';

  return (
    <div className="space-y-6">
      {/* Breadcrumb + title */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Dashboard
          </button>
          <span>/</span>
          <span className="text-foreground font-medium">
            Add Medical Record
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Stethoscope className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Add Medical Record</h1>
            <p className="text-sm text-muted-foreground">
              Find a patient to record a diagnosis, prescription, vitals, or lab
              report.
            </p>
          </div>
        </div>
      </div>

      {!canWrite ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-4 text-center">
            <Stethoscope className="h-12 w-12 text-muted-foreground/30" />
            <p className="text-base font-medium">
              You do not have permission to add medical records.
            </p>
            <p className="text-sm text-muted-foreground">
              Only doctors and administrators with clinical write access can add
              records.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search patients by name, MRN, or ID…"
                  className="flex h-10 w-full rounded-md border border-input bg-background pl-10 pr-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary placeholder:text-muted-foreground"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Type at least 2 characters to search. Select a patient to add a
                record for them.
              </p>
            </CardContent>
          </Card>

          {isFetching && trimmed.length >= 2 && (
            <div className="flex items-center justify-center py-10">
              <Spinner />
            </div>
          )}

          {!isFetching && trimmed.length >= 2 && results.length === 0 && (
            <div className="flex flex-col items-center gap-4 py-12 text-center">
              <User className="h-12 w-12 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                No patients matched “{trimmed}”.
              </p>
            </div>
          )}

          {!isFetching && trimmed.length >= 2 && results.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground">
                {data?.total ?? results.length} patient
                {results.length !== 1 ? 's' : ''} found
              </p>
              {results.map((p) => {
                const pid = patientId(p);
                return (
                  <Card key={pid}>
                    <CardContent className="p-4">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <Avatar name={fullName(p)} />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">
                              {fullName(p)}
                            </p>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                              <span className="font-mono">
                                ID: {p.mrn ?? pid.slice(0, 8)}
                              </span>
                              {p.dateOfBirth && (
                                <span>
                                  {formatDate(p.dateOfBirth, 'short')} (
                                  {calculateAge(p.dateOfBirth)})
                                </span>
                              )}
                              {p.gender && (
                                <span className="capitalize">
                                  {p.gender.toLowerCase()}
                                </span>
                              )}
                              {p.bloodGroup && (
                                <Badge
                                  variant="gray"
                                  className="font-mono text-xs"
                                >
                                  {p.bloodGroup}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          {RECORD_TYPES.map(({ key, label, icon: Icon }) => (
                            <Button
                              key={key}
                              size="sm"
                              variant={
                                key === 'diagnoses' ? 'default' : 'outline'
                              }
                              asChild
                            >
                              <Link href={`/patients/${pid}/${key}/new`}>
                                <Icon className="h-3.5 w-3.5" />
                                Add {label}
                              </Link>
                            </Button>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
