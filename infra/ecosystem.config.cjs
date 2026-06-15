/**
 * PM2 配置 —— 用于 ECS 单机直接跑(不走 Docker)
 * 启动: pm2 start infra/ecosystem.config.cjs
 * 重启: pm2 restart ibiren-api
 * 持久化: pm2 save && pm2 startup
 */
module.exports = {
  apps: [
    {
      name: 'ibiren-api',
      cwd: '../apps/api',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '768M',
      env: {
        NODE_ENV: 'production',
        PORT: 3100,
      },
      env_file: '../.env',
      out_file: '/var/log/ibiren/api.out.log',
      error_file: '/var/log/ibiren/api.err.log',
      merge_logs: true,
      time: true,
    },
    {
      name: 'ibiren-web',
      cwd: '/var/www/ibiren/web',
      script: 'serve.js',  // 静态文件由 nginx 服务,这里仅占位
      instances: 0,        // 0 = 不启动
    },
  ],
};
