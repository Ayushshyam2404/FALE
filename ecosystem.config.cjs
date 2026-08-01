module.exports = {
  apps: [
    {
      name: 'falcon-api',
      script: 'src/server.js',
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        ENABLE_WORKERS: 'false',
        WORKER_ROLE: 'false',
      },
    },
    {
      name: 'falcon-workers',
      script: 'src/workers/index.js',
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        ENABLE_WORKERS: 'false',
        WORKER_ROLE: 'true',
      },
    },
  ],
};
