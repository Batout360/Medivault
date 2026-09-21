'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  User,
  Phone,
  Mail,
  MapPin,
  Heart,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Check,
  Fingerprint,
} from 'lucide-react';
import { toast } from 'sonner';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiClient } from '@/lib/api/client';
import { cn } from '@/lib/utils';

// ─── Validation Schema ────────────────────────────────────────────────────────
const registrationSchema = z.object({
  // Personal
  firstName: z.string().min(2, 'First name must be at least 2 characters').max(50),
  lastName: z.string().min(2, 'Last name must be at least 2 characters').max(50),
  dateOfBirth: z.string().min(1, 'Date of birth is required'),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER'], { required_error: 'Gender is required' }),
  bloodGroup: z.string().optional(),

  // Contact
  phoneNumber: z
    .string()
    .min(10, 'Enter a valid phone number')
    .regex(/^\+?[\d\s\-()]{10,15}$/, 'Enter a valid phone number'),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  address: z.string().max(250).optional().or(z.literal('')),
  city: z.string().max(100).optional().or(z.literal('')),
  state: z.string().max(100).optional().or(z.literal('')),
  pincode: z.string().max(10).optional().or(z.literal('')),

  // Emergency contact
  emergencyContactName: z.string().min(2, 'Emergency contact name is required').max(100),
  emergencyContactPhone: z
    .string()
    .min(10, 'Enter a valid phone number')
    .regex(/^\+?[\d\s\-()]{10,15}$/, 'Enter a valid emergency contact number'),
  emergencyContactRelation: z.string().max(50).optional().or(z.literal('')),

  // Medical
  allergies: z.string().max(500).optional().or(z.literal('')),
  existingConditions: z.string().max(500).optional().or(z.literal('')),
  currentMedications: z.string().max(500).optional().or(z.literal('')),
  surgicalHistory: z.string().max(500).optional().or(z.literal('')),
  familyHistory: z.string().max(500).optional().or(z.literal('')),
  notes: z.string().max(1000).optional().or(z.literal('')),
});

type RegistrationFormValues = z.infer<typeof registrationSchema>;

// ─── Steps ────────────────────────────────────────────────────────────────────
const steps = [
  { id: 1, label: 'Personal Info', icon: User },
  { id: 2, label: 'Contact', icon: Phone },
  { id: 3, label: 'Emergency', icon: Heart },
  { id: 4, label: 'Medical', icon: AlertTriangle },
  { id: 5, label: 'Biometric', icon: Fingerprint },
];

// ─── Section heading ──────────────────────────────────────────────────────────
function SectionHeading({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 mb-6">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

// ─── Registration Page ────────────────────────────────────────────────────────
export default function PatientRegistrationPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = React.useState(1);
  const [createdPatientId, setCreatedPatientId] = React.useState<string | null>(null);
  const [createdLogin, setCreatedLogin] = React.useState<{
    username: string;
    temporaryPassword: string;
  } | null>(null);

  const {
    register,
    control,
    handleSubmit,
    trigger,
    formState: { errors },
  } = useForm<RegistrationFormValues>({
    resolver: zodResolver(registrationSchema),
    mode: 'onBlur',
  });

  // ─── API mutation ─────────────────────────────────────────────────────────
  const registerMutation = useMutation({
    mutationFn: async (data: RegistrationFormValues) => {
      const res = await apiClient.post<{
        id: string;
        patientId: string;
        login: { username: string; temporaryPassword: string } | null;
      }>('/patients', toCreatePatientPayload(data));
      return res.data;
    },
    onSuccess: (data) => {
      setCreatedPatientId(data.id);
      setCreatedLogin(data.login ?? null);
      toast.success(`User registered successfully. ID: ${data.patientId}`);
      setCurrentStep(5); // Go to biometric step
    },
    onError: (err: unknown) => {
      const message =
        isErrorLike(err) ? err.message : 'Failed to register user.';
      toast.error(message);
    },
  });

  // ─── Step navigation ──────────────────────────────────────────────────────
  const stepFields: Record<number, (keyof RegistrationFormValues)[]> = {
    1: ['firstName', 'lastName', 'dateOfBirth', 'gender', 'bloodGroup'],
    2: ['phoneNumber', 'email', 'address', 'city', 'state', 'pincode'],
    3: ['emergencyContactName', 'emergencyContactPhone', 'emergencyContactRelation'],
    4: ['allergies', 'existingConditions', 'currentMedications'],
  };

  const handleNext = async () => {
    if (currentStep < 4) {
      const valid = await trigger(stepFields[currentStep]);
      if (valid) setCurrentStep((s) => s + 1);
    } else if (currentStep === 4) {
      void handleSubmit(async (data) => {
        await registerMutation.mutateAsync(data);
      })();
    }
  };

  const handleBack = () => {
    if (currentStep > 1) setCurrentStep((s) => s - 1);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push('/patients')}
          aria-label="Back to users"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Register New User</h1>
          <p className="text-sm text-muted-foreground">
            Create a new user profile in the system
          </p>
        </div>
      </div>

      {/* Step indicators */}
      <nav aria-label="Registration steps">
        <ol className="flex items-center gap-2 overflow-x-auto pb-1">
          {steps.map((step, idx) => {
            const isCompleted = currentStep > step.id;
            const isCurrent = currentStep === step.id;
            const StepIcon = step.icon;

            return (
              <React.Fragment key={step.id}>
                <li className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => isCompleted && setCurrentStep(step.id)}
                    disabled={!isCompleted && !isCurrent}
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-all',
                      isCompleted
                        ? 'bg-primary text-primary-foreground cursor-pointer hover:bg-primary/80'
                        : isCurrent
                        ? 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2'
                        : 'bg-muted text-muted-foreground cursor-default',
                    )}
                    aria-label={`Step ${step.id}: ${step.label}`}
                    aria-current={isCurrent ? 'step' : undefined}
                  >
                    {isCompleted ? <Check className="h-3.5 w-3.5" /> : <StepIcon className="h-3.5 w-3.5" />}
                  </button>
                  <span
                    className={cn(
                      'text-xs font-medium hidden sm:block',
                      isCurrent ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {step.label}
                  </span>
                </li>
                {idx < steps.length - 1 && (
                  <div
                    className={cn(
                      'flex-1 h-px min-w-[1rem]',
                      isCompleted ? 'bg-primary' : 'bg-border',
                    )}
                    aria-hidden="true"
                  />
                )}
              </React.Fragment>
            );
          })}
        </ol>
      </nav>

      {/* ─── Step 1: Personal Information ──────────────────────────────── */}
      {currentStep === 1 && (
        <Card>
          <CardContent className="p-6">
            <SectionHeading
              icon={User}
              title="Personal Information"
              description="Basic identifying information about the user."
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="First Name"
                placeholder="Rahul"
                required
                error={errors.firstName?.message}
                {...register('firstName')}
              />
              <Input
                label="Last Name"
                placeholder="Sharma"
                required
                error={errors.lastName?.message}
                {...register('lastName')}
              />
              <Input
                label="Date of Birth"
                type="date"
                required
                max={new Date().toISOString().split('T')[0]}
                error={errors.dateOfBirth?.message}
                {...register('dateOfBirth')}
              />
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">
                  Gender <span className="text-destructive">*</span>
                </label>
                <Controller
                  name="gender"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value ?? ''} onValueChange={field.onChange}>
                      <SelectTrigger error={!!errors.gender}>
                        <SelectValue placeholder="Select gender…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MALE">Male</SelectItem>
                        <SelectItem value="FEMALE">Female</SelectItem>
                        <SelectItem value="OTHER">Other / Prefer not to say</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.gender && (
                  <p role="alert" className="text-xs text-destructive">{errors.gender.message}</p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Blood Group</label>
                <Controller
                  name="bloodGroup"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value ?? ''} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select blood group…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unknown">Unknown</SelectItem>
                        {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((bg) => (
                          <SelectItem key={bg} value={bg}>{bg}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Step 2: Contact Information ──────────────────────────────── */}
      {currentStep === 2 && (
        <Card>
          <CardContent className="p-6">
            <SectionHeading
              icon={Phone}
              title="Contact Information"
              description="How can the user be reached?"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Phone Number"
                type="tel"
                placeholder="+91 98765 43210"
                required
                leftIcon={<Phone className="h-3.5 w-3.5" />}
                error={errors.phoneNumber?.message}
                {...register('phoneNumber')}
              />
              <Input
                label="Email Address"
                type="email"
                placeholder="user@example.com"
                leftIcon={<Mail className="h-3.5 w-3.5" />}
                error={errors.email?.message}
                {...register('email')}
              />
              <div className="sm:col-span-2">
                <Input
                  label="Address"
                  placeholder="Street address, apartment, suite, etc."
                  leftIcon={<MapPin className="h-3.5 w-3.5" />}
                  {...register('address')}
                />
              </div>
              <Input
                label="City"
                placeholder="Mumbai"
                {...register('city')}
              />
              <Input
                label="State"
                placeholder="Maharashtra"
                {...register('state')}
              />
              <Input
                label="Pincode"
                placeholder="400001"
                {...register('pincode')}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Step 3: Emergency Contact ─────────────────────────────────── */}
      {currentStep === 3 && (
        <Card>
          <CardContent className="p-6">
            <SectionHeading
              icon={Heart}
              title="Emergency Contact"
              description="Person to contact in case of emergency."
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Full Name"
                placeholder="Emergency contact's full name"
                required
                error={errors.emergencyContactName?.message}
                {...register('emergencyContactName')}
              />
              <Input
                label="Phone Number"
                type="tel"
                placeholder="+91 98765 43210"
                required
                leftIcon={<Phone className="h-3.5 w-3.5" />}
                error={errors.emergencyContactPhone?.message}
                {...register('emergencyContactPhone')}
              />
              <Input
                label="Relationship"
                placeholder="e.g. Spouse, Parent, Sibling"
                {...register('emergencyContactRelation')}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Step 4: Medical Information ──────────────────────────────── */}
      {currentStep === 4 && (
        <Card>
          <CardContent className="p-6">
            <SectionHeading
              icon={AlertTriangle}
              title="Medical Information"
              description="Pre-existing conditions, allergies, and medications. Leave blank if not applicable."
            />
            <div className="space-y-4">
              <Textarea
                label="Known Allergies"
                placeholder="List any known drug, food, or environmental allergies…"
                hint="Separate multiple allergies with commas"
                rows={3}
                {...register('allergies')}
              />
              <Textarea
                label="Existing Medical Conditions"
                placeholder="Diabetes, hypertension, asthma, etc."
                rows={3}
                {...register('existingConditions')}
              />
              <Textarea
                label="Current Medications"
                placeholder="List current medications with dosage if known…"
                rows={3}
                {...register('currentMedications')}
              />
              <Textarea
                label="Surgical History"
                placeholder="Previous surgeries or procedures…"
                rows={2}
                {...register('surgicalHistory')}
              />
              <Textarea
                label="Family Medical History"
                placeholder="Relevant family history (diabetes, heart disease, cancer, etc.)…"
                rows={2}
                {...register('familyHistory')}
              />
              <Textarea
                label="Additional Notes"
                placeholder="Any other relevant medical information…"
                rows={3}
                {...register('notes')}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Step 5: Biometric Enrollment ─────────────────────────────── */}
      {currentStep === 5 && createdPatientId && (
        <Card>
          <CardContent className="p-8 text-center space-y-6">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-100 dark:bg-violet-900/30">
              <Fingerprint className="h-8 w-8 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Fingerprint Enrollment</h2>
              <p className="text-sm text-muted-foreground mt-1">
                The patient has been successfully registered. You can now enroll
                their fingerprint for biometric identification.
              </p>
            </div>

            <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/10 p-4 text-left">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-600" />
                <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  User registered successfully
                </span>
              </div>
              <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80 mt-1">
                User ID has been generated and their record is now in the system.
              </p>
            </div>

            {createdLogin && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/10 p-4 text-left">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-amber-700 dark:text-amber-400" />
                  <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                    Login created — save these credentials
                  </span>
                </div>
                <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-1">
                  A patient account was auto-created. Share the temporary password
                  with the patient; it is shown only once.
                </p>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-4 rounded-md bg-white/60 dark:bg-background/40 px-3 py-2">
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Email / Username
                    </dt>
                    <dd className="font-mono text-amber-900 dark:text-amber-300">
                      {createdLogin.username}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 rounded-md bg-white/60 dark:bg-background/40 px-3 py-2">
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Temporary Password
                    </dt>
                    <dd className="font-mono text-amber-900 dark:text-amber-300">
                      {createdLogin.temporaryPassword}
                    </dd>
                  </div>
                </dl>
                <p className="text-xs text-muted-foreground mt-2">
                  The patient can sign in with their email and this password.
                </p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                variant="outline"
                onClick={() => router.push(`/patients/${createdPatientId}`)}
              >
                View User Profile
              </Button>
              <Button
                className="bg-violet-600 hover:bg-violet-700 text-white"
                onClick={() =>
                  router.push(`/fingerprint?enroll=${createdPatientId}`)
                }
              >
                <Fingerprint className="h-4 w-4" />
                Enroll Fingerprint
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Navigation Footer ─────────────────────────────────────────── */}
      {currentStep < 5 && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 1}
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>

          <div className="flex items-center gap-1.5">
            {steps.slice(0, 4).map((step) => (
              <div
                key={step.id}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  currentStep === step.id
                    ? 'w-6 bg-primary'
                    : currentStep > step.id
                    ? 'w-3 bg-primary/40'
                    : 'w-3 bg-muted',
                )}
                aria-hidden="true"
              />
            ))}
          </div>

          <Button
            onClick={() => void handleNext()}
            loading={registerMutation.isPending}
          >
            {currentStep === 4 ? (
              <>
                Register User
                <Check className="h-4 w-4" />
              </>
            ) : (
              <>
                Continue
                <ChevronRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

function isErrorLike(err: unknown): err is { message: string } {
  return typeof err === "object" && err !== null && "message" in err;
}

function toE164(raw: string): string {
  const digits = raw.replace(/[\s\-()]/g, "");
  return digits.startsWith("+") ? digits : `+${digits}`;
}

const BLOOD_GROUP_MAP: Record<string, string> = {
  "A+": "A_POSITIVE",
  "A-": "A_NEGATIVE",
  "B+": "B_POSITIVE",
  "B-": "B_NEGATIVE",
  "AB+": "AB_POSITIVE",
  "AB-": "AB_NEGATIVE",
  "O+": "O_POSITIVE",
  "O-": "O_NEGATIVE",
  unknown: "UNKNOWN",
};

function toCreatePatientPayload(data: RegistrationFormValues) {
  const allergies = data.allergies
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((allergen) => ({ allergen }));

  const conditions = data.existingConditions
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((conditionName) => ({ conditionName }));

  return {
    firstName: data.firstName,
    lastName: data.lastName,
    dateOfBirth: data.dateOfBirth,
    gender: data.gender,
    ...(data.bloodGroup ? { bloodGroup: BLOOD_GROUP_MAP[data.bloodGroup] ?? data.bloodGroup } : {}),
    phone: toE164(data.phoneNumber),
    ...(data.email ? { email: data.email } : {}),
    ...(data.city?.trim() ? { city: data.city.trim() } : {}),
    ...(data.state?.trim() ? { state: data.state.trim() } : {}),
    ...(data.pincode?.trim() ? { pincode: data.pincode.trim() } : {}),
    ...(data.address?.trim() || data.city?.trim() || data.state?.trim()
      ? {
          address: {
            line1: data.address?.trim() || "N/A",
            city: data.city?.trim() || "N/A",
            state: data.state?.trim() || "N/A",
            country: "India",
            ...(data.pincode?.trim() ? { postalCode: data.pincode.trim() } : {}),
          },
        }
      : {}),
    emergencyContact: {
      name: data.emergencyContactName,
      relationship: data.emergencyContactRelation?.trim() || "Other",
      phone: toE164(data.emergencyContactPhone),
    },
    ...(allergies?.length ? { allergies } : {}),
    ...(conditions?.length ? { conditions } : {}),
  };
}
