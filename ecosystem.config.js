module.exports = {
  apps: [
    {
      name: 'gubkin-backend',
      script: 'server.js',
      instances: 'max', // Использовать все доступные CPU ядра
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      // Логирование
      log_file: '/opt/gubkin-backend/logs/combined.log',
      out_file: '/opt/gubkin-backend/logs/out.log',
      error_file: '/opt/gubkin-backend/logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // Автоперезапуск
      watch: false,
      ignore_watch: ['node_modules', 'logs', 'uploads'],

      // Мониторинг
      max_memory_restart: '1G',
      min_uptime: '10s',
      max_restarts: 10,

      // Переменные окружения
      env_file: '.env',

      // Дополнительные настройки
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,

      // Graceful shutdown
      shutdown_with_message: true,

      // Health check
      health_check_grace_period: 3000,

      // Cron для перезапуска (ежедневно в 3:00)
      cron_restart: '0 3 * * *',

      // Merge logs
      merge_logs: true,

      // Source map support
      source_map_support: true,

      // Node options для Node.js 22
      node_args: '--max-old-space-size=2048 --no-warnings',
    },
  ],

  // Настройки для деплоя
  deploy: {
    production: {
      user: 'gubkin-app',
      host: '192.168.1.253',
      ref: 'origin/main',
      repo: 'https://github.com/gubkin-university/dormitory-management.git',
      path: '/opt/gubkin-backend',
      'pre-deploy-local': '',
      'post-deploy': 'npm install --production && pm2 reload ecosystem.config.js --env production',
      'pre-setup': '',
    },
  },
}
