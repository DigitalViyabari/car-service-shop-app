module.exports = {
  apps: [
    {
      name: "carserviceapp-api",
      cwd: "/var/www/carserviceapp",
      script: "/bin/bash",
      args: "-lc 'set -a; source /etc/dvcs/api.env; set +a; exec pnpm --filter @dvcs/api start'",
      interpreter: "none",
      autorestart: true,
      max_memory_restart: "350M",
    },
  ],
};
