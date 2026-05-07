module.exports = {
  apps: [
    {
      name: "mrnutt3r-abi-bot",
      script: "src/index.js",
      interpreter: "node",
      env: {
        NODE_ENV: "production"
      },
      autorestart: true,
      max_restarts: 20,
      exp_backoff_restart_delay: 100,
      watch: false,
      time: true
    }
  ]
};
