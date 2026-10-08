module.exports = {
  apps: [
    {
      name: 'masofaviy2',
      script: './server.js',
      cwd: '/home/hallaym/masofaviy2',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: '10s',
      kill_timeout: 5000,
      max_memory_restart: '700M',
      time: true,
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'masofaviy2-sfu',
      script: './media-server/server.js',
      cwd: '/home/hallaym/masofaviy2',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: '10s',
      kill_timeout: 7000,
      max_memory_restart: '900M',
      time: true,
      env: { NODE_ENV: 'production' }
    }
  ]
};
