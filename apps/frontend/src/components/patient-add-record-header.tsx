'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { usePatient } from '@/lib/hooks/use-api';

/**
 * Breadcrumb + title header used by the "add medical record" pages
 * (diagnosis, prescription, vitals, lab report) scoped to a patient.
 */
export function PatientAddRecordHeader({
  patientId,
  title,
  icon: Icon,
}: {
  patientId: string;
  title: string;
  icon: React.ElementType;
}) {
  const router = useRouter();
  const { data: patient, isLoading } = usePatient(patientId);

  const fullName = patient ? `${patient.firstName} ${patient.lastName}` : '';

  return (
    <div className="space-y-4">
      {/* Breadcrumb + Back */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <button
          onClick={() => router.push('/patients')}
          className="flex items-center gap-1 hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Patients
        </button>
        <span>/</span>
        <Link
          href={`/patients/${patientId}`}
          className="hover:text-foreground transition-colors"
        >
          {isLoading ? 'Patient' : fullName}
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">{title}</span>
      </div>

      {/* Title block */}
      <div className="flex items-center gap-4">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">{title}</h1>
          <p className="text-sm text-muted-foreground">
            {isLoading
              ? 'Loading patient…'
              : `Recording ${title.toLowerCase()} for ${fullName}`}
          </p>
        </div>
      </div>
    </div>
  );
}
