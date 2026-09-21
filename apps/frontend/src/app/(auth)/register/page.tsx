'use client';

import * as React from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Contact,
  CreditCard,
  Eye,
  EyeOff,
  HeartPulse,
  Lock,
  Mail,
  Phone,
  Plus,
  Shield,
  Trash2,
  User,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/lib/stores/auth.store';
import type { RegisterResponseDto } from '@medivault/shared';

// ─── Types & builders ─────────────────────────────────────────────────────────
interface AllergyRow {
  allergen: string;
  allergyType: string;
  severity: string;
  reaction: string;
}
interface ConditionRow {
  conditionName: string;
  diagnosedAt: string;
  notes: string;
}

type Gender = 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY';
type BloodGroup =
  | 'A+'
  | 'A-'
  | 'B+'
  | 'B-'
  | 'AB+'
  | 'AB-'
  | 'O+'
  | 'O-'
  | 'UNKNOWN';

const GENDER_OPTIONS: Array<{ value: Gender; label: string }> = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER', label: 'Other' },
  { value: 'PREFER_NOT_TO_SAY', label: 'Prefer not to say' },
];

const BLOOD_GROUP_OPTIONS: BloodGroup[] = [
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
  'O+',
  'O-',
  'UNKNOWN',
];

const ALLERGY_TYPE_OPTIONS = ['DRUG', 'FOOD', 'ENVIRONMENTAL', 'OTHER'];
const ALLERGY_SEVERITY_OPTIONS = [
  'MILD',
  'MODERATE',
  'SEVERE',
  'LIFE_THREATENING',
  'HIGH',
  'CRITICAL',
];

const STEPS = [
  { key: 1, label: 'Account', icon: User },
  { key: 2, label: 'Identity', icon: CreditCard },
  { key: 3, label: 'Health & emergency', icon: HeartPulse },
  { key: 4, label: 'Review', icon: ClipboardList },
] as const;

// ─── Validation schema ────────────────────────────────────────────────────────
const registerSchema = z
  .object({
    // Step 1 — account
    firstName: z.string().min(1, 'First name is required').max(60),
    lastName: z.string().min(1, 'Last name is required').max(60),
    email: z
      .string()
      .min(1, 'Email is required')
      .email('Enter a valid email address'),
    username: z
      .string()
      .min(3, 'Username must be at least 3 characters')
      .max(40)
      .regex(
        /^[a-z0-9_.-]+$/i,
        'Username may only contain letters, numbers, _, . and -',
      ),
    phone: z
      .string()
      .optional()
      .refine(
        (v) => !v || /^\+?[\d\s\-().]{7,20}$/.test(v),
        'Enter a valid phone number',
      ),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(128, 'Password must not exceed 128 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
    // Step 2 — identity
    dob: z
      .string()
      .optional()
      .refine((v) => !v || !isNaN(Date.parse(v)), 'Enter a valid date'),
    gender: z.string().optional(),
    bloodGroup: z.string().optional(),
    addrLine1: z.string().max(120).optional(),
    addrCity: z.string().max(80).optional(),
    addrState: z.string().max(80).optional(),
    addrPostal: z.string().max(20).optional(),
    addrCountry: z.string().max(80).optional(),
    // Step 3 — emergency contact (optional, name + relationship if any present)
    ecName: z.string().max(80).optional(),
    ecRelation: z.string().max(40).optional(),
    ecPhone: z
      .string()
      .optional()
      .refine(
        (v) => !v || /^\+?[\d\s\-().]{7,20}$/.test(v),
        'Enter a valid phone number',
      ),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .refine(
    (data) => {
      const hasAnyContact =
        !!(data.ecName || data.ecRelation || data.ecPhone);
      return !hasAnyContact || (!!data.ecName && !!data.ecRelation);
    },
    {
      message: 'Provide both a name and relationship for the emergency contact.',
      path: ['ecRelation'],
    },
  );

type RegisterFormValues = z.infer<typeof registerSchema>;

const STEP_1_FIELDS: (keyof RegisterFormValues)[] = [
  'firstName',
  'lastName',
  'email',
  'username',
  'phone',
  'password',
  'confirmPassword',
];
const STEP_2_FIELDS: (keyof RegisterFormValues)[] = [
  'dob',
  'gender',
  'bloodGroup',
  'addrLine1',
  'addrCity',
  'addrState',
  'addrPostal',
  'addrCountry',
];
const STEP_3_FIELDS: (keyof RegisterFormValues)[] = [
  'ecName',
  'ecRelation',
  'ecPhone',
];

// ─── Register Page ────────────────────────────────────────────────────────────
export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = React.useState(1);
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirm, setShowConfirm] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isContinuing, setIsContinuing] = React.useState(false);
  const [identity, setIdentity] = React.useState<RegisterResponseDto['identity'] | null>(null);
  const [regEmail, setRegEmail] = React.useState('');
  const [regPassword, setRegPassword] = React.useState('');
  const [allergies, setAllergies] = React.useState<AllergyRow[]>([]);
  const [conditions, setConditions] = React.useState<ConditionRow[]>([]);

  const {
    register,
    handleSubmit,
    trigger,
    getValues,
    setError,
    clearErrors,
    formState: { errors },
    watch,
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      gender: '',
      bloodGroup: '',
    },
  });

  const password = watch('password', '');
  const passwordStrength = React.useMemo(() => {
    if (!password) return 0;
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;
    return score;
  }, [password]);

  const strengthLabel = ['', 'Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'][passwordStrength];
  const strengthColor = [
    '',
    'bg-red-500',
    'bg-orange-500',
    'bg-yellow-500',
    'bg-emerald-500',
    'bg-green-500',
  ][passwordStrength];

  const goNext = async () => {
    const group = step === 1 ? STEP_1_FIELDS : step === 2 ? STEP_2_FIELDS : STEP_3_FIELDS;
    if (step === 3) {
      const contactOk = validateEmergencyContact();
      if (!contactOk) return;
    } else {
      const ok = await trigger(group);
      if (!ok) return;
    }
    clearErrors('root');
    setStep((s) => Math.min(s + 1, 4));
  };

  const validateEmergencyContact = () => {
    const v = getValues();
    const hasAny = !!(v.ecName || v.ecRelation || v.ecPhone);
    if (!hasAny) return true;
    if (!v.ecName || !v.ecRelation) {
      setError('ecRelation', {
        message: 'Provide both a name and relationship for the emergency contact.',
      });
      return false;
    }
    const phoneOk = !v.ecPhone || /^\+?[\d\s\-().]{7,20}$/.test(v.ecPhone);
    if (!phoneOk) {
      setError('ecPhone', { message: 'Enter a valid phone number' });
      return false;
    }
    return true;
  };

  const addAllergy = () =>
    setAllergies((rows) => [
      ...rows,
      { allergen: '', allergyType: '', severity: '', reaction: '' },
    ]);
  const updateAllergy = (index: number, patch: Partial<AllergyRow>) =>
    setAllergies((rows) =>
      rows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  const removeAllergy = (index: number) =>
    setAllergies((rows) => rows.filter((_, i) => i !== index));

  const addCondition = () =>
    setConditions((rows) => [
      ...rows,
      { conditionName: '', diagnosedAt: '', notes: '' },
    ]);
  const updateCondition = (index: number, patch: Partial<ConditionRow>) =>
    setConditions((rows) =>
      rows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  const removeCondition = (index: number) =>
    setConditions((rows) => rows.filter((_, i) => i !== index));

  const onSubmit = async (values: RegisterFormValues) => {
    const validAllergies = allergies.filter((a) => a.allergen.trim().length > 0);
    const validConditions = conditions.filter((c) => c.conditionName.trim().length > 0);

    if (allergies.some((a) => !a.allergen.trim()) || conditions.some((c) => !c.conditionName.trim())) {
      toast.error('Save or clear incomplete allergy / condition rows before continuing.');
      return;
    }

    const hasAddress = !!(
      values.addrLine1 ||
      values.addrCity ||
      values.addrState ||
      values.addrPostal ||
      values.addrCountry
    );
    const hasEmergency = !!(values.ecName || values.ecRelation || values.ecPhone);

    setIsSubmitting(true);
    clearErrors('root');
    try {
      const res = await apiClient.post<RegisterResponseDto>('/auth/register', {
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        username: values.username,
        phone: values.phone || undefined,
        role: 'USER',
        password: values.password,
        createPatientIdentity: true,
        identity: {
          dateOfBirth: values.dob || undefined,
          gender: (values.gender as Gender) || undefined,
          bloodGroup: (values.bloodGroup as BloodGroup) || undefined,
          address: hasAddress
            ? {
                line1: values.addrLine1 || undefined,
                city: values.addrCity || undefined,
                state: values.addrState || undefined,
                postalCode: values.addrPostal || undefined,
                country: values.addrCountry || undefined,
              }
            : undefined,
          emergencyContact: hasEmergency
            ? {
                name: values.ecName as string,
                relationship: values.ecRelation as string,
                ...(values.ecPhone ? { phone: values.ecPhone } : {}),
              }
            : undefined,
          allergies: validAllergies.length
            ? validAllergies.map((a) => ({
                allergen: a.allergen.trim(),
                ...(a.allergyType ? { allergyType: a.allergyType } : {}),
                ...(a.severity ? { severity: a.severity } : {}),
                ...(a.reaction ? { reaction: a.reaction.trim() } : {}),
              }))
            : undefined,
          conditions: validConditions.length
            ? validConditions.map((c) => ({
                conditionName: c.conditionName.trim(),
                ...(c.diagnosedAt ? { diagnosedAt: c.diagnosedAt } : {}),
                ...(c.notes ? { notes: c.notes.trim() } : {}),
              }))
            : undefined,
        },
      });

      setIdentity(res.data.identity ?? null);
      setRegEmail(values.email);
      setRegPassword(values.password);
      toast.success('Account and medical identity created!');
    } catch (err: unknown) {
      const msg = isErrorLike(err) ? err.message : 'Registration failed. Please try again.';
      setStep(1);
      if (msg.toLowerCase().includes('email')) {
        setError('email', { message: msg });
      } else if (msg.toLowerCase().includes('username')) {
        setError('username', { message: msg });
      } else {
        setError('root', { message: msg });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleContinue = async () => {
    setIsContinuing(true);
    try {
      await useAuthStore.getState().login({ email: regEmail, password: regPassword });
      router.push('/dashboard');
    } catch {
      toast.error('Sign-in could not be completed. Please log in manually.');
      router.push('/login');
    } finally {
      setIsContinuing(false);
    }
  };

  // ── Onboarding success / identity issuance screen ─────────────────────────
  if (identity) {
    return <IdentityIssuedScreen identity={identity} onContinue={handleContinue} isContinuing={isContinuing} />;
  }

  // ── Registration form ──────────────────────────────────────────────────────
  return (
    <div className="w-full">
      <Card className="border-white/10 bg-white/5 backdrop-blur-md shadow-2xl">
        <CardHeader className="pb-4">
          <div className="flex flex-col items-center gap-3">
            <Image
              src="/medivault-logo.png"
              alt="Medivault"
              width={1392}
              height={1130}
              priority
              className="h-14 w-auto"
            />
            <div className="text-center">
              <h1 className="text-xl font-bold text-white">Create your account</h1>
              <p className="text-sm text-blue-200/70 mt-0.5">
                Step {step} of 4 — {STEPS[step - 1].label}
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {/* Step progress indicator */}
          <div className="mb-6" aria-hidden="true">
            <div className="flex items-center gap-1">
              {STEPS.map((s, index) => {
                const Icon = s.icon;
                const isDone = index + 1 < step;
                const isActive = index + 1 === step;
                return (
                  <React.Fragment key={s.key}>
                    {index > 0 && (
                      <div
                        className={cn(
                          'h-0.5 flex-1 rounded-full transition-colors',
                          index + 1 <= step ? 'bg-primary' : 'bg-white/10',
                        )}
                      />
                    )}
                    <div
                      className={cn(
                        'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border transition-all',
                        isDone && 'border-primary bg-primary text-white',
                        isActive && 'border-primary/60 bg-primary/10 text-primary ring-2 ring-primary/30',
                        !isDone && !isActive && 'border-white/10 bg-white/5 text-blue-300/40',
                      )}
                    >
                      {isDone ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
            <div className="mt-2 hidden sm:flex justify-between text-xs text-blue-300/50">
              {STEPS.map((s) => (
                <span key={s.key} className={cn(s.key === step && 'text-primary font-medium')}>
                  {s.label}
                </span>
              ))}
            </div>
          </div>

          <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate className="space-y-4">
            {step === 1 && (
              <>
                <AccountStep
                  register={register}
                  errors={errors}
                  showPassword={showPassword}
                  showConfirm={showConfirm}
                  onTogglePassword={() => setShowPassword(!showPassword)}
                  onToggleConfirm={() => setShowConfirm(!showConfirm)}
                  passwordStrength={passwordStrength}
                  strengthLabel={strengthLabel}
                  strengthColor={strengthColor}
                  rootError={errors.root?.message}
                  hasPassword={!!password}
                />
                <StepNav
                  isFirst
                  onNext={() => void goNext()}
                  primaryLabel="Continue to identity"
                />
              </>
            )}

            {step === 2 && (
              <>
                <IdentityStep
                  register={register}
                  errors={errors}
                />
                <StepNav
                  onBack={() => setStep(1)}
                  onNext={() => void goNext()}
                  primaryLabel="Continue to health"
                />
              </>
            )}

            {step === 3 && (
              <>
                <HealthStep
                  register={register}
                  errors={errors}
                  allergies={allergies}
                  conditions={conditions}
                  onAddAllergy={addAllergy}
                  onUpdateAllergy={updateAllergy}
                  onRemoveAllergy={removeAllergy}
                  onAddCondition={addCondition}
                  onUpdateCondition={updateCondition}
                  onRemoveCondition={removeCondition}
                  rootError={errors.root?.message}
                />
                <StepNav
                  onBack={() => setStep(2)}
                  onNext={() => void goNext()}
                  primaryLabel="Review"
                />
              </>
            )}

            {step === 4 && (
              <>
                <ReviewStep
                  values={getValues()}
                  allergies={allergies}
                  conditions={conditions}
                  rootError={errors.root?.message}
                  initialEmail={valuesOfStep1()}
                />
                <div className="flex items-center justify-between gap-3 pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setStep(3)}
                    className="text-blue-200/70 hover:text-white"
                  >
                    <ArrowLeft className="h-4 w-4" /> Back
                  </Button>
                  <Button
                    type="submit"
                    size="lg"
                    loading={isSubmitting}
                    className="flex-1 sm:flex-none bg-primary hover:bg-primary/90 text-white font-semibold shadow-lg shadow-primary/20"
                  >
                    {isSubmitting ? 'Creating your account…' : 'Create account & issue identity'}
                  </Button>
                </div>
              </>
            )}
          </form>

          <p className="mt-4 text-center text-sm text-blue-200/60">
            Already have an account?{' '}
            <a
              href="/login"
              className="font-medium text-primary hover:text-primary/80 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded"
            >
              Sign in
            </a>
          </p>

          <div className="mt-5 flex items-start gap-2 text-xs text-blue-300/50">
            <Shield className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <p>
              By creating an account, you agree that all activity in this system is logged and
              monitored. Creating your identity issues a MediVault digital health card that can be
              scanned by emergency staff.
            </p>
          </div>
        </CardContent>
      </Card>

      <p className="mt-4 text-center text-xs text-blue-300/30">
        © {new Date().getFullYear()} Medivault. All rights reserved.
      </p>
    </div>
  );

  function valuesOfStep1() {
    const v = getValues();
    return { firstName: v.firstName, lastName: v.lastName, email: v.email };
  }
}

// ─── Step 1: Account ──────────────────────────────────────────────────────────
function AccountStep({
  register: reg,
  errors,
  showPassword,
  showConfirm,
  onTogglePassword,
  onToggleConfirm,
  passwordStrength,
  strengthLabel,
  strengthColor,
  rootError,
  hasPassword,
}: {
  register: ReturnType<typeof useForm<RegisterFormValues>>['register'];
  errors: Record<string, { message?: string } | undefined>;
  showPassword: boolean;
  showConfirm: boolean;
  onTogglePassword: () => void;
  onToggleConfirm: () => void;
  passwordStrength: number;
  strengthLabel: string;
  strengthColor: string;
  rootError?: string;
  hasPassword: boolean;
}) {
  const err = (key: string) => errors[key]?.message;
  return (
    <div className="space-y-4">
      {rootError && <RootError message={rootError} />}

      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" htmlFor="firstName">
          <InputWithoutIcon id="firstName" placeholder="Sarah" {...reg('firstName')} error={err('firstName')} autoComplete="given-name" />
          {err('firstName') && <FieldError message={err('firstName') as string} />}
        </Field>
        <Field label="Last name" htmlFor="lastName">
          <InputWithoutIcon id="lastName" placeholder="Smith" {...reg('lastName')} error={err('lastName')} autoComplete="family-name" />
          {err('lastName') && <FieldError message={err('lastName') as string} />}
        </Field>
      </div>

      <Field label="Email address" htmlFor="email">
        <IconInput id="email" icon={Mail} placeholder="you@example.com" {...reg('email')} error={err('email')} autoComplete="email" autoCapitalize="none" spellCheck={false} />
        {err('email') && <FieldError message={err('email') as string} />}
      </Field>

      <Field label="Username" htmlFor="username">
        <IconInput
          id="username"
          icon={User}
          prefixAt
          placeholder="sarah.smith"
          {...reg('username')}
          error={err('username')}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          className="pl-8"
        />
        {err('username') && <FieldError message={err('username') as string} />}
      </Field>

      <Field label="Phone" htmlFor="phone" optional>
        <IconInput id="phone" icon={Phone} type="tel" placeholder="+91 98765 43210" {...reg('phone')} error={err('phone')} autoComplete="tel" />
        {err('phone') && <FieldError message={err('phone') as string} />}
      </Field>

      <Field label="Password" htmlFor="password">
        <PasswordInput
          id="password"
          show={showPassword}
          onToggle={onTogglePassword}
          {...reg('password')}
          error={err('password')}
        />
        {hasPassword && (
          <div className="mt-2" role="status" aria-live="polite">
            <div className="flex gap-1 mb-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className={cn(
                    'h-1 flex-1 rounded-full transition-colors',
                    i <= passwordStrength ? strengthColor : 'bg-white/10',
                  )}
                />
              ))}
            </div>
            <p className="text-xs text-blue-300/50">
              Strength: <span className="text-blue-200/70">{strengthLabel}</span>
            </p>
          </div>
        )}
        {err('password') && <FieldError message={err('password') as string} />}
      </Field>

      <Field label="Confirm password" htmlFor="confirmPassword">
        <PasswordInput
          id="confirmPassword"
          show={showConfirm}
          onToggle={onToggleConfirm}
          {...reg('confirmPassword')}
          error={err('confirmPassword')}
        />
        {err('confirmPassword') && <FieldError message={err('confirmPassword') as string} />}
      </Field>
    </div>
  );
}

// ─── Step 2: Identity ──────────────────────────────────────────────────────────
function IdentityStep({
  register: reg,
  errors,
}: {
  register: ReturnType<typeof useForm<RegisterFormValues>>['register'];
  errors: Record<string, { message?: string } | undefined>;
}) {
  const err = (key: string) => errors[key]?.message;
  return (
    <div className="space-y-4">
      <div className="text-xs text-blue-300/50 -mt-1">
        This details block creates your medical identity and is what shows on your digital health card.
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Date of birth" htmlFor="dob">
          <CalendarInput id="dob" {...reg('dob')} error={err('dob')} />
          {err('dob') && <FieldError message={err('dob') as string} />}
        </Field>
        <Field label="Gender" htmlFor="gender">
          <SelectInput id="gender" {...reg('gender')} error={err('gender')} placeholder="Select gender">
            {GENDER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </SelectInput>
        </Field>
      </div>

      <Field label="Blood group" htmlFor="bloodGroup" optional>
        <SelectInput id="bloodGroup" {...reg('bloodGroup')} error={err('bloodGroup')} placeholder="Select blood group">
          {BLOOD_GROUP_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </SelectInput>
      </Field>

      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
        <div className="text-sm font-medium text-blue-100 mb-2">Address <span className="text-blue-300/40 font-normal">(optional)</span></div>
        <div className="space-y-3">
          <Field label="Line 1" htmlFor="addrLine1">
            <InputWithoutIcon id="addrLine1" placeholder="12, MG Road" {...reg('addrLine1')} error={err('addrLine1')} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="City" htmlFor="addrCity">
              <InputWithoutIcon id="addrCity" placeholder="Bengaluru" {...reg('addrCity')} error={err('addrCity')} />
            </Field>
            <Field label="State" htmlFor="addrState">
              <InputWithoutIcon id="addrState" placeholder="Karnataka" {...reg('addrState')} error={err('addrState')} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Postal code" htmlFor="addrPostal">
              <InputWithoutIcon id="addrPostal" placeholder="560001" {...reg('addrPostal')} error={err('addrPostal')} />
            </Field>
            <Field label="Country" htmlFor="addrCountry">
              <InputWithoutIcon id="addrCountry" placeholder="India" {...reg('addrCountry')} error={err('addrCountry')} />
            </Field>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Step 3: Health & emergency ────────────────────────────────────────────────
function HealthStep({
  register: reg,
  errors,
  allergies,
  conditions,
  onAddAllergy,
  onUpdateAllergy,
  onRemoveAllergy,
  onAddCondition,
  onUpdateCondition,
  onRemoveCondition,
  rootError,
}: {
  register: ReturnType<typeof useForm<RegisterFormValues>>['register'];
  errors: Record<string, { message?: string } | undefined>;
  allergies: AllergyRow[];
  conditions: ConditionRow[];
  onAddAllergy: () => void;
  onUpdateAllergy: (index: number, patch: Partial<AllergyRow>) => void;
  onRemoveAllergy: (index: number) => void;
  onAddCondition: () => void;
  onUpdateCondition: (index: number, patch: Partial<ConditionRow>) => void;
  onRemoveCondition: (index: number) => void;
  rootError?: string;
}) {
  const err = (key: string) => errors[key]?.message;
  return (
    <div className="space-y-4">
      {rootError && <RootError message={rootError} />}

      {/* Emergency contact */}
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
        <div className="flex items-center gap-2 text-sm font-medium text-blue-100 mb-2">
          <Contact className="h-4 w-4 text-primary" />
          Emergency contact <span className="text-blue-300/40 font-normal">(optional)</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Name" htmlFor="ecName">
            <InputWithoutIcon id="ecName" placeholder="John Smith" {...reg('ecName')} error={err('ecName')} />
            {err('ecName') && <FieldError message={err('ecName') as string} />}
          </Field>
          <Field label="Relationship" htmlFor="ecRelation">
            <InputWithoutIcon id="ecRelation" placeholder="Spouse" {...reg('ecRelation')} error={err('ecRelation')} />
            {err('ecRelation') && <FieldError message={err('ecRelation') as string} />}
          </Field>
          <Field label="Phone" htmlFor="ecPhone">
            <InputWithoutIcon id="ecPhone" type="tel" placeholder="+91 98765 43210" {...reg('ecPhone')} error={err('ecPhone')} />
            {err('ecPhone') && <FieldError message={err('ecPhone') as string} />}
          </Field>
        </div>
      </div>

      {/* Allergies */}
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="text-sm font-medium text-blue-100">Allergies <span className="text-blue-300/40 font-normal">(optional)</span></div>
          <Button type="button" variant="outline" size="sm" onClick={onAddAllergy}>
            <Plus className="h-4 w-4" /> Add allergy
          </Button>
        </div>
        {allergies.length === 0 ? (
          <p className="text-xs text-blue-300/40">No allergies recorded. Add drug, food or environmental allergies if any.</p>
        ) : (
          <div className="space-y-2">
            {allergies.map((row, index) => (
              <div key={index} className="rounded-md border border-white/10 bg-white/[0.03] p-2">
                <div className="flex items-center gap-2 mb-2">
                  <InputWithoutIcon
                    aria-label={`Allergen ${index + 1}`}
                    placeholder="Allergen (e.g. Penicillin)"
                    value={row.allergen}
                    onChange={(e) => onUpdateAllergy(index, { allergen: e.target.value })}
                  />
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove allergy" onClick={() => onRemoveAllergy(index)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <SelectInline
                    aria-label={`Allergy type ${index + 1}`}
                    options={ALLERGY_TYPE_OPTIONS}
                    value={row.allergyType}
                    placeholder="Type"
                    onChange={(v) => onUpdateAllergy(index, { allergyType: v })}
                  />
                  <SelectInline
                    aria-label={`Severity ${index + 1}`}
                    options={ALLERGY_SEVERITY_OPTIONS}
                    value={row.severity}
                    placeholder="Severity"
                    onChange={(v) => onUpdateAllergy(index, { severity: v })}
                  />
                  <InputWithoutIcon
                    aria-label={`Reaction ${index + 1}`}
                    placeholder="Reaction (optional)"
                    value={row.reaction}
                    onChange={(e) => onUpdateAllergy(index, { reaction: e.target.value })}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Conditions */}
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="text-sm font-medium text-blue-100">Ongoing conditions <span className="text-blue-300/40 font-normal">(optional)</span></div>
          <Button type="button" variant="outline" size="sm" onClick={onAddCondition}>
            <Plus className="h-4 w-4" /> Add condition
          </Button>
        </div>
        {conditions.length === 0 ? (
          <p className="text-xs text-blue-300/40">No conditions recorded.</p>
        ) : (
          <div className="space-y-2">
            {conditions.map((row, index) => (
              <div key={index} className="rounded-md border border-white/10 bg-white/[0.03] p-2">
                <div className="flex items-center gap-2 mb-2">
                  <InputWithoutIcon
                    aria-label={`Condition ${index + 1}`}
                    placeholder="Condition (e.g. Diabetes mellitus)"
                    value={row.conditionName}
                    onChange={(e) => onUpdateCondition(index, { conditionName: e.target.value })}
                  />
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove condition" onClick={() => onRemoveCondition(index)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <InputWithoutIcon
                    aria-label={`Diagnosed date ${index + 1}`}
                    type="date"
                    value={row.diagnosedAt}
                    onChange={(e) => onUpdateCondition(index, { diagnosedAt: e.target.value })}
                  />
                  <InputWithoutIcon
                    aria-label={`Notes ${index + 1}`}
                    placeholder="Notes (optional)"
                    value={row.notes}
                    onChange={(e) => onUpdateCondition(index, { notes: e.target.value })}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Step 4: Review ────────────────────────────────────────────────────────────
function ReviewStep({
  values,
  allergies,
  conditions,
  rootError,
  initialEmail,
}: {
  values: RegisterFormValues;
  allergies: AllergyRow[];
  conditions: ConditionRow[];
  rootError?: string;
  initialEmail: { firstName: string; lastName: string; email: string };
}) {
  const contact = values.ecName ? `${values.ecName} (${values.ecRelation})` : 'Not provided';
  return (
    <div className="space-y-4">
      {rootError && <RootError message={rootError} />}
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-sm">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <ReviewItem label="Name" value={initialEmail.firstName && initialEmail.lastName ? `${initialEmail.firstName} ${initialEmail.lastName}` : ''} />
          <ReviewItem label="Email" value={initialEmail.email} />
          <ReviewItem label="Date of birth" value={values.dob || 'Not provided'} />
          <ReviewItem label="Gender" value={displayGender(values.gender)} />
          <ReviewItem label="Blood group" value={values.bloodGroup || 'Not provided'} />
          <ReviewItem label="Address" value={displayAddress(values)} />
          <ReviewItem label="Emergency contact" value={contact} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-sm">
          <div className="text-blue-100 font-medium mb-1 flex items-center gap-1.5">
            <Contact className="h-4 w-4 text-primary" /> Allergies
          </div>
          <p className="text-blue-200/60 text-xs">{allergies.length || 'None recorded'}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-sm">
          <div className="text-blue-100 font-medium mb-1 flex items-center gap-1.5">
            <HeartPulse className="h-4 w-4 text-primary" /> Conditions
          </div>
          <p className="text-blue-200/60 text-xs">{conditions.length || 'None recorded'}</p>
        </div>
      </div>

      <div className="flex items-start gap-2 text-xs text-blue-300/50 rounded-lg border border-primary/20 bg-primary/5 p-3">
        <Shield className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
        <p>
          On creation you will receive your MediVault Patient ID (format MV-YYYY-NNNNNN) and a QR
          health card. Keep the card safe — it can save your life in an emergency.
        </p>
      </div>
    </div>
  );
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-blue-300/50">{label}</div>
      <div className="text-blue-50">{value || '—'}</div>
    </div>
  );
}

function displayGender(value: string | undefined): string {
  const found = GENDER_OPTIONS.find((o) => o.value === value);
  return found ? found.label : 'Not provided';
}

function displayAddress(values: RegisterFormValues): string {
  const parts = [
    values.addrLine1,
    values.addrCity,
    values.addrState,
    values.addrPostal,
    values.addrCountry,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'Not provided';
}

// ─── Step navigation ───────────────────────────────────────────────────────────
function StepNav({
  isFirst = false,
  onBack,
  onNext,
  primaryLabel,
}: {
  isFirst?: boolean;
  onBack?: () => void;
  onNext: () => void;
  primaryLabel: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 pt-2">
      <Button
        type="button"
        variant="ghost"
        onClick={onBack}
        disabled={isFirst}
        className={cn(isFirst && 'invisible', 'text-blue-200/70 hover:text-white')}
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>
      <Button
        type="button"
        onClick={onNext}
        className="flex-1 sm:flex-none bg-primary hover:bg-primary/90 text-white font-semibold shadow-lg shadow-primary/20"
      >
        {primaryLabel} {!isFirst && <ArrowRight className="h-4 w-4" />}
      </Button>
    </div>
  );
}

// ─── Reusable field building blocks ────────────────────────────────────────────
function Field({
  label,
  htmlFor,
  optional = false,
  children,
}: {
  label: string;
  htmlFor: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-blue-100 mb-1.5">
        {label} {optional && <span className="text-blue-300/40 font-normal">(optional)</span>}
      </label>
      {children}
    </div>
  );
}

function FieldError({ message }: { message: string }) {
  return (
    <p role="alert" className="mt-1 text-xs text-destructive flex items-center gap-1">
      <AlertTriangle className="h-3 w-3" />
      {message}
    </p>
  );
}

function RootError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-3 text-sm text-destructive"
    >
      <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
      {message}
    </div>
  );
}

const InputWithoutIcon = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { error?: string }
>(({ error, className, ...props }, ref) => (
  <input
    ref={ref}
    {...props}
    aria-invalid={!!error}
    className={cn(baseFieldClass(), error && 'border-destructive focus-visible:ring-destructive', className)}
  />
));
InputWithoutIcon.displayName = 'InputWithoutIcon';

const IconInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & {
    icon: typeof Mail;
    prefixAt?: boolean;
    error?: string;
  }
>(({ icon: Icon, prefixAt = false, error, className, ...props }, ref) => (
  <div className="relative">
    {prefixAt ? (
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-300/60 text-sm select-none pointer-events-none">@</span>
    ) : (
      <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-300/60 pointer-events-none" aria-hidden="true" />
    )}
    <input
      ref={ref}
      {...props}
      aria-invalid={!!error}
      className={cn(
        baseFieldClass(true),
        error && 'border-destructive focus-visible:ring-destructive',
        className,
      )}
    />
  </div>
));
IconInput.displayName = 'IconInput';

const PasswordInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & {
    show: boolean;
    onToggle: () => void;
    error?: string;
  }
>(({ show, onToggle, error, className, ...props }, ref) => (
  <div className="relative">
    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-300/60 pointer-events-none" aria-hidden="true" />
    <input
      ref={ref}
      {...props}
      type={show ? 'text' : 'password'}
      aria-invalid={!!error}
      className={cn(
        baseFieldClass(true),
        error && 'border-destructive focus-visible:ring-destructive',
        className,
      )}
    />
    <button
      type="button"
      onClick={onToggle}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-300/60 hover:text-blue-300 transition-colors"
      aria-label={show ? 'Hide password' : 'Show password'}
    >
      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  </div>
));
PasswordInput.displayName = 'PasswordInput';

const CalendarInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { error?: string }
>(({ error, className, ...props }, ref) => (
  <div className="relative">
    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-300/60 pointer-events-none" aria-hidden="true" />
    <input
      ref={ref}
      {...props}
      type="date"
      aria-invalid={!!error}
      className={cn(
        baseFieldClass(true),
        'text-blue-100 [color-scheme:dark]',
        error && 'border-destructive focus-visible:ring-destructive',
        className,
      )}
    />
  </div>
));
CalendarInput.displayName = 'CalendarInput';

const SelectInput = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { placeholder?: string; error?: string }
>(({ placeholder, error, className, children, ...props }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      {...props}
      defaultValue=""
      aria-invalid={!!error}
      className={cn(
        'flex h-10 w-full appearance-none rounded-lg border bg-white/5 pl-3 pr-9 text-sm text-white',
        'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        'border-white/10 hover:border-white/20',
        '[&>option]:bg-slate-900 [&>option]:text-white',
        error && 'border-destructive focus-visible:ring-destructive',
        className,
      )}
    >
      <option value="" disabled>
        {placeholder ?? 'Select…'}
      </option>
      {children}
    </select>
    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-300/60 pointer-events-none" aria-hidden="true" />
  </div>
));
SelectInput.displayName = 'SelectInput';

function SelectInline({
  options,
  value,
  placeholder,
  onChange,
  'aria-label': ariaLabel,
}: {
  options: string[];
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  'aria-label'?: string;
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'h-9 w-full appearance-none rounded-md border bg-white/5 px-3 text-sm text-white',
        'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        'border-white/10 hover:border-white/20',
        '[&>option]:bg-slate-900 [&>option]:text-white',
        !value && 'text-blue-300/40',
      )}
    >
      <option value="" disabled>{placeholder}</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  );
}

function baseFieldClass(withIcon = false): string {
  return cn(
    'flex h-10 w-full rounded-lg border bg-white/5 text-sm text-white',
    withIcon ? 'pl-10 pr-4' : 'px-3',
    'placeholder:text-blue-300/30',
    'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
    'border-white/10 hover:border-white/20',
  );
}

// ─── Onboarding success screen ─────────────────────────────────────────────────
function IdentityIssuedScreen({
  identity,
  onContinue,
  isContinuing,
}: {
  identity: NonNullable<RegisterResponseDto['identity']>;
  onContinue: () => void | Promise<void>;
  isContinuing: boolean;
}) {
  return (
    <div className="w-full">
      <Card className="border-white/10 bg-white/5 backdrop-blur-md shadow-2xl">
        <CardContent className="pt-8 pb-8 flex flex-col items-center gap-5 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 ring-1 ring-emerald-500/40">
            <CheckCircle2 className="h-8 w-8 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Your MediVault identity is ready</h2>
            <p className="mt-1 text-sm text-blue-200/70">
              Save or screenshot your health card before continuing.
            </p>
          </div>

          {/* Identity card */}
          <div className="w-full max-w-sm rounded-2xl bg-gradient-to-br from-blue-700 via-blue-800 to-slate-900 p-[1px]">
            <div className="relative rounded-2xl bg-gradient-to-br from-blue-800/90 to-slate-900 p-5 overflow-hidden">
              <div
                className="absolute inset-0 opacity-[0.06]"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                }}
                aria-hidden="true"
              />
              <div className="relative flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Image
                    src="/medivault-logo.png"
                    alt="MediVault"
                    width={1392}
                    height={1130}
                    unoptimized
                    className="h-8 w-8 object-contain drop-shadow"
                  />
                  <span className="text-sm font-semibold tracking-wide text-white">MEDIVAULT</span>
                </div>
                <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-medium tracking-wider text-blue-100">
                  HEALTH CARD
                </span>
              </div>

              <div className="relative mt-5 text-left">
                <p className="text-2xl font-bold tracking-widest text-white font-mono drop-shadow">
                  {identity.patientId}
                </p>
                <p className="mt-0.5 text-xs text-blue-200/70">
                  {identity.profileId} · {identity.mvId}
                </p>
                <p className="mt-3 text-sm text-blue-100">
                  Patient ID issued · {new Date().getFullYear()}
                </p>
              </div>

              <div className="relative mt-5 flex items-center justify-between gap-4">
                <div className="text-left">
                  <div className="text-[10px] uppercase tracking-widest text-blue-200/60">Scan to verify</div>
                  <div className="text-xs text-blue-100/80 max-w-[130px]">
                    Emergency access to critical allergies & contacts
                  </div>
                </div>
                <div className="rounded-lg bg-white p-2 shadow-lg">
                  <Image
                    src={identity.qr.qrDataUrl}
                    alt="MediVault identity QR code"
                    width={120}
                    height={120}
                    unoptimized
                    className="h-24 w-24"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col w-full gap-2 max-w-sm">
            <a
              href={identity.qr.qrDataUrl}
              download="medivault-health-card-qr.png"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-white/15 text-sm font-medium text-blue-100 hover:bg-white/5 transition-colors"
            >
              Download QR code
            </a>
            <Button
              size="lg"
              loading={isContinuing}
              onClick={() => void onContinue()}
              className="w-full bg-primary hover:bg-primary/90 text-white font-semibold shadow-lg shadow-primary/20"
            >
              {isContinuing ? 'Signing you in…' : 'Continue to dashboard'}
            </Button>
          </div>

          <p className="text-xs text-blue-300/50 max-w-sm">
            We have signed you in automatically. You can view, rotate or revoke this QR at any time
            from your dashboard.
          </p>
        </CardContent>
      </Card>

      <p className="mt-4 text-center text-xs text-blue-300/30">
        © {new Date().getFullYear()} Medivault. All rights reserved.
      </p>
    </div>
  );
}

// ─── Style helpers ────────────────────────────────────────────────────────────
function isErrorLike(err: unknown): err is { message: string } {
  return typeof err === 'object' && err !== null && 'message' in err;
}