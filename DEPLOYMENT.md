# Deployment

## PM2
```bash
npm install
pm2 start ecosystem.config.cjs
pm2 save
```

## Docker
```bash
docker build -t mrnutt3r-abi-bot .
docker run --env-file .env mrnutt3r-abi-bot
```

## Monitoring
- heartbeat file: `heartbeat/last_alive.json`
- logs: `logs/bot.log`
- audit log: `audit/admin.log`

Recommended checks:
- `!abi status`
- `!abi version`
- `npm run test:all`
