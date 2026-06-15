/**
 * ibi.ren · 种子用户脚本
 * 用法: pnpm seed:users
 *
 * 创建:
 *   1 个超级管理员 (SEED_ADMIN_EMAIL)
 *   3 个示例创作者 (creator_001..003@ibi.ren)
 *   5 个示例采购方 (buyer_001..005@ibi.ren)
 *
 * 重复运行幂等(用 email 做 upsert)
 */
import { PrismaClient, UserRole, KycStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEFAULT_PASSWORD = 'Focus_2026!';

const creators = [
  { email: 'creator_001@ibi.ren', displayName: '林雾工作室', realName: '林雾', companyName: '林雾文化传播' },
  { email: 'creator_002@ibi.ren', displayName: '苏白 AI 实验室', realName: '苏白', companyName: null },
  { email: 'creator_003@ibi.ren', displayName: '陈默造像', realName: '陈默', companyName: '陈默数字艺术' },
];

const buyers = [
  { email: 'buyer_001@ibi.ren', displayName: '张制片', realName: '张磊', companyName: '橘子洲短剧' },
  { email: 'buyer_002@ibi.ren', displayName: '李导演', realName: '李明', companyName: '云上传媒' },
  { email: 'buyer_003@ibi.ren', displayName: '王品牌', realName: '王雪', companyName: '潮汐化妆品' },
  { email: 'buyer_004@ibi.ren', displayName: '赵采购', realName: '赵阳', companyName: '晨光食品' },
  { email: 'buyer_005@ibi.ren', displayName: '孙个人', realName: '孙琪', companyName: null },
];

async function ensureUser(opts: {
  email: string;
  displayName: string;
  role: UserRole;
  realName?: string;
  companyName?: string | null;
  kycStatus?: KycStatus;
}) {
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  return prisma.user.upsert({
    where: { email: opts.email },
    update: {
      displayName: opts.displayName,
      realName: opts.realName,
      companyName: opts.companyName,
      kycStatus: opts.kycStatus ?? 'APPROVED',
    },
    create: {
      email: opts.email,
      displayName: opts.displayName,
      passwordHash,
      role: opts.role,
      realName: opts.realName,
      companyName: opts.companyName,
      kycStatus: opts.kycStatus ?? 'APPROVED',
    },
  });
}

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@ibi.ren';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || DEFAULT_PASSWORD;

  console.log('🌱 创世管理员…');
  const adminPwd = await bcrypt.hash(adminPassword, 10);
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: 'ADMIN' },
    create: {
      email: adminEmail,
      displayName: '平台管理员',
      passwordHash: adminPwd,
      role: 'ADMIN',
      kycStatus: 'APPROVED',
    },
  });
  console.log(`   ✓ admin: ${admin.email} (${admin.id})`);

  console.log('🌱 创作者…');
  for (const c of creators) {
    const u = await ensureUser({ ...c, role: 'CREATOR' });
    console.log(`   ✓ creator: ${u.email}`);
  }

  console.log('🌱 采购方…');
  for (const b of buyers) {
    const u = await ensureUser({ ...b, role: 'BUYER' });
    console.log(`   ✓ buyer: ${u.email}`);
  }

  console.log('');
  console.log('🎉 种子用户完成');
  console.log(`   默认密码: ${DEFAULT_PASSWORD}`);
  console.log(`   管理员:   ${adminEmail} / ${adminPassword}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
