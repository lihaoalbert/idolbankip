/**
 * 角色工具 — 单一事实源。
 *
 * 历史: schema 里 User.role 原本是 Prisma enum (CREATOR / BUYER / ADMIN), 现在角色存为
 * MySQL JSON 数组 (用户可同时持有 CREATOR + BUYER), 不再是 enum。
 * TypeScript 端用 string literal 模拟;运行时既提供 type 又提供 value (因为旧代码大量
 * 用 UserRole.X 这种 enum-风格调用, 不能改 200+ 处, 所以同时导出 const)。
 */
import { Prisma } from '@prisma/client';

export const USER_ROLES = ['CREATOR', 'BUYER', 'ADMIN'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** 兼容老 enum 风格调用: `UserRole.CREATOR` / `@Roles(UserRole.ADMIN)`。 */
export const UserRole = {
  CREATOR: 'CREATOR' as UserRole,
  BUYER: 'BUYER' as UserRole,
  ADMIN: 'ADMIN' as UserRole,
};

export function isUserRole(v: unknown): v is UserRole {
  return typeof v === 'string' && (USER_ROLES as readonly string[]).includes(v);
}

export function parseRoles(roles: Prisma.JsonValue | null | undefined): UserRole[] {
  if (!Array.isArray(roles)) return [];
  return roles.filter(isUserRole);
}

export function serializeRoles(roles: UserRole[]): Prisma.InputJsonValue {
  return [...new Set(roles)];
}

export function hasRole(roles: UserRole[] | null | undefined, role: UserRole): boolean {
  return !!roles && roles.includes(role);
}

/**
 * Prisma where 子句 — 在 MySQL JSON 列上做"包含某角色"匹配。
 * 用 string_contains + 双引号包夹的 role 字符串, 因为 JSON 序列化后 role 是 `"ROLE"`。
 * 命中情况: ["CREATOR"] / ["CREATOR","BUYER"] 都包含 `"CREATOR"`;
 *          ["BUYER"] / ["BUYER","ADMIN"] 不含。
 * 多角色任意匹配用 rolesContainsAny。
 */
export function rolesContains(role: UserRole): Prisma.UserWhereInput['roles'] {
  return { string_contains: `"${role}"` } as any;
}

export function rolesContainsAny(roles: UserRole[]): Prisma.UserWhereInput {
  if (roles.length === 0) return {};
  return { OR: roles.map((r) => ({ roles: { string_contains: `"${r}"` } as any })) };
}
