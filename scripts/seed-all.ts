/**
 * ibi.ren · 一键种子入口
 * 用法: pnpm seed:all
 */
import { spawnSync } from 'child_process';

function run(cmd: string, args: string[]) {
  console.log(`\n▶ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true });
  if (r.status !== 0) process.exit(r.status || 1);
}

run('pnpm', ['seed:users']);
run('pnpm', ['seed:ips']);
console.log('\n✅ 全部完成');
