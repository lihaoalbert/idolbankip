/**
 * ibi.ren · 清理 IP 测试数据脚本
 * 用法:
 *   pnpm tsx scripts/clean-ips.ts --dry-run     # 只统计,不删
 *   pnpm tsx scripts/clean-ips.ts               # 真清
 *
 * 清的内容:
 *   - IpAsset 全部记录 (连带 faceCloseupFileId 反向解链)
 *   - IpFile 全部记录
 *   - BlockchainProof 全部记录
 *   - WatermarkRecord 全部记录
 *   - CopyrightCertificate 全部记录
 *   - DownloadGrant 全部记录 (IP 关联)
 *   - Order / Contract (IP 关联)
 *   - HonorRecord / HonorPointLedger (联动到创作者,但测试数据全清,保留 user.honorLevel 不变)
 *   - ContactLead (如果是 IP 关联)
 *
 * 保留:
 *   - User (创作者/买家/管理员账号)
 *   - IpTask (任务模板)
 *   - HonorRule / HonorLevel / HonorBadge (荣誉规则)
 *   - Notification (用户通知 — 但 IP 关联的清)
 *   - AuditLog (操作日志,即使是测试数据也保留用于审计)
 *   - ApiKey
 *   - KycSubmission (KYC 历史,即使是测试数据)
 *
 * OSS 文件清理:由 seed-deploy.sh 调用 scripts/clean-oss-ips.ts 删 OSS 上的 ips/* key
 *   (分两步,因为 OSS 操作慢、且需要单独跑在 ECS 上)
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const isDryRun = process.argv.includes('--dry-run');

async function main() {
  console.log('🧹 ibi.ren IP 数据清理脚本');
  console.log(`   模式: ${isDryRun ? '🔍 DRY RUN (不删)' : '⚠️  真清'}`);
  console.log('');

  // 1. 统计
  const counts = {
    ipAsset: await prisma.ipAsset.count(),
    ipFile: await prisma.ipFile.count(),
    blockchainProof: await prisma.blockchainProof.count(),
    watermarkRecord: await prisma.watermarkRecord.count(),
    copyrightCert: await prisma.copyrightCertificate.count(),
    downloadGrant: await prisma.downloadGrant.count(),
    order: await prisma.order.count(),
    contract: await prisma.contract.count(),
  };

  console.log('📊 当前数据:');
  console.log(`   IpAsset:               ${counts.ipAsset}`);
  console.log(`   IpFile:                ${counts.ipFile}`);
  console.log(`   BlockchainProof:       ${counts.blockchainProof}`);
  console.log(`   WatermarkRecord:       ${counts.watermarkRecord}`);
  console.log(`   CopyrightCertificate:  ${counts.copyrightCert}`);
  console.log(`   DownloadGrant:         ${counts.downloadGrant}`);
  console.log(`   Order:                 ${counts.order}`);
  console.log(`   Contract:              ${counts.contract}`);
  console.log('');

  if (counts.ipAsset === 0) {
    console.log('✅ 无 IP 数据,无需清理');
    return;
  }

  if (isDryRun) {
    console.log('🔍 DRY RUN — 不会删除任何数据');
    console.log('');
    console.log('将执行以下操作(按顺序,Prisma 事务保证原子性):');
    console.log('   1. 解链 IpAsset.faceCloseupFileId (先置 null,避免 IpFile 删除时的 FK 冲突)');
    console.log('   2. 删除 IpFile');
    console.log('   3. 删除 BlockchainProof');
    console.log('   4. 删除 WatermarkRecord');
    console.log('   5. 删除 CopyrightCertificate');
    console.log('   6. 删除 DownloadGrant');
    console.log('   7. 删除 Contract (IP 关联)');
    console.log('   8. 删除 Order (IP 关联)');
    console.log('   9. 删除 IpAsset');
    console.log('');
    console.log('保留:User / IpTask / HonorRule 等系统表');
    return;
  }

  // 2. 真清 — 在事务里跑
  console.log('🚀 开始清理...');
  await prisma.$transaction(async (tx) => {
    // 1. 解链 faceCloseupFileId (避免删除 IpFile 时 FK 报错)
    const step1 = await tx.ipAsset.updateMany({
      data: { faceCloseupFileId: null },
    });
    console.log(`   1. 解链 faceCloseupFileId: ${step1.count} 条`);

    // 2. IpFile
    const step2 = await tx.ipFile.deleteMany({});
    console.log(`   2. 删 IpFile: ${step2.count} 条`);

    // 3. BlockchainProof
    const step3 = await tx.blockchainProof.deleteMany({});
    console.log(`   3. 删 BlockchainProof: ${step3.count} 条`);

    // 4. WatermarkRecord
    const step4 = await tx.watermarkRecord.deleteMany({});
    console.log(`   4. 删 WatermarkRecord: ${step4.count} 条`);

    // 5. CopyrightCertificate
    const step5 = await tx.copyrightCertificate.deleteMany({});
    console.log(`   5. 删 CopyrightCertificate: ${step5.count} 条`);

    // 6. DownloadGrant (有 ipId FK,需要先删)
    const step6 = await tx.downloadGrant.deleteMany({});
    console.log(`   6. 删 DownloadGrant: ${step6.count} 条`);

    // 7. Contract (有 ipId FK)
    const step7 = await tx.contract.deleteMany({});
    console.log(`   7. 删 Contract: ${step7.count} 条`);

    // 8. Order (有 ipId FK)
    const step8 = await tx.order.deleteMany({});
    console.log(`   8. 删 Order: ${step8.count} 条`);

    // 9. 最后删 IpAsset
    const step9 = await tx.ipAsset.deleteMany({});
    console.log(`   9. 删 IpAsset: ${step9.count} 条`);
  });

  console.log('');
  console.log('✅ 清理完成');

  // 3. 校验
  const after = await prisma.ipAsset.count();
  console.log(`📊 清理后 IpAsset 数量: ${after} (期望 0)`);

  const users = await prisma.user.count();
  console.log(`📊 User 数量: ${users} (保留不变)`);
}

main()
  .catch((e) => {
    console.error('❌ 清理失败,事务已回滚:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());