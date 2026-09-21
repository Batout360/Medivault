import { UserRole } from '../enums/roles.enum';
import { Permission } from '../enums/permissions.enum';
/**
 * Core User entity as returned from the database/API
 */
export interface User {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    organizationId: string;
    facilityId: string | null;
    isActive: boolean;
    isEmailVerified: boolean;
    lastLoginAt: Date | null;
    passwordChangedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}
/**
 * Extended user profile with additional metadata
 */
export interface UserProfile extends User {
    fullName: string;
    avatarUrl: string | null;
    phoneNumber: string | null;
    department: string | null;
    specialization: string | null;
    licenseNumber: string | null;
    bio: string | null;
    preferences: UserPreferences;
}
/**
 * User preferences stored per account
 */
export interface UserPreferences {
    theme: 'light' | 'dark' | 'system';
    language: string;
    timezone: string;
    notificationsEnabled: boolean;
    emailNotifications: boolean;
    twoFactorEnabled: boolean;
}
/**
 * User with their resolved permissions (for authorization)
 */
export interface UserWithRole extends User {
    permissions: Permission[];
    roleDisplayName: string;
}
/**
 * Lightweight user summary for lists and references
 */
export interface UserSummary {
    id: string;
    email: string;
    fullName: string;
    role: UserRole;
    avatarUrl: string | null;
    isActive: boolean;
}
/**
 * DTO for creating a new user (admin operation)
 */
export interface CreateUserDto {
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    organizationId: string;
    facilityId?: string;
    phoneNumber?: string;
    department?: string;
    specialization?: string;
    licenseNumber?: string;
    sendWelcomeEmail?: boolean;
}
/**
 * DTO for updating an existing user
 */
export interface UpdateUserDto {
    firstName?: string;
    lastName?: string;
    role?: UserRole;
    facilityId?: string | null;
    phoneNumber?: string | null;
    department?: string | null;
    specialization?: string | null;
    licenseNumber?: string | null;
    bio?: string | null;
    isActive?: boolean;
    preferences?: Partial<UserPreferences>;
}
/**
 * Query params for listing/searching users
 */
export interface UserSearchParams {
    query?: string;
    role?: UserRole;
    organizationId?: string;
    facilityId?: string;
    isActive?: boolean;
    page?: number;
    limit?: number;
    sortBy?: 'firstName' | 'lastName' | 'email' | 'createdAt' | 'role';
    sortOrder?: 'asc' | 'desc';
}
/**
 * Paginated response wrapper for user lists
 */
export interface PaginatedUsers {
    data: UserSummary[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}
//# sourceMappingURL=user.types.d.ts.map