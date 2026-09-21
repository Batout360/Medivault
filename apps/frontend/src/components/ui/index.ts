// ─── UI component barrel export ──────────────────────────────────────────────
// Import shared UI components from this single entry point.

export { Button, buttonVariants } from './button';
export type { ButtonProps } from './button';

export { Input } from './input';
export type { InputProps } from './input';

export { Textarea } from './textarea';
export type { TextareaProps } from './textarea';

export { Badge, badgeVariants } from './badge';
export type { BadgeProps } from './badge';

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from './card';

export { Avatar, AvatarRoot, AvatarImage, AvatarFallback } from './avatar';

export { Spinner, SpinnerOverlay, SpinnerCenter } from './spinner';

export { Skeleton, SkeletonText, SkeletonCard, SkeletonTable } from './skeleton';

export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  ConfirmModal,
} from './modal';

export {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  UnderlineTabsList,
  UnderlineTabsTrigger,
} from './tabs';

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  LabeledSelect,
} from './select';
