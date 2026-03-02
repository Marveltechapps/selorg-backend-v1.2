# Redis Setup Guide

## Current Status
✅ **Redis connection errors are fixed** - The backend can now run without Redis using an in-memory queue fallback.

## Running Backend Without Redis (Current Setup)

The backend is configured to run without Redis by default. To explicitly disable Redis:

**PowerShell:**
```powershell
$env:DISABLE_REDIS='true'
cd backend
node src/server.js
```

**Or add to `.env` file:**
```
DISABLE_REDIS=true
```

When Redis is disabled:
- ✅ No Redis connection attempts
- ✅ No Redis connection errors
- ✅ Queue service uses in-memory queues (messages lost on restart)
- ⚠️ Queue persistence is not available

## Enabling Redis Later (When Docker is Available)

### Option 1: Docker (Recommended)

1. **Install Docker Desktop** (if not installed):
   - Download: https://www.docker.com/get-started
   - Enable WSL 2 integration during installation

2. **Start Redis container:**
   ```powershell
   docker run --name rider-redis -p 6379:6379 -d redis:7
   ```

3. **Verify Redis is running:**
   ```powershell
   docker ps --filter name=rider-redis
   docker logs rider-redis --tail 50
   ```

4. **Remove DISABLE_REDIS from `.env` or unset it:**
   ```powershell
   # Remove DISABLE_REDIS=true from .env, or:
   $env:DISABLE_REDIS=$null
   ```

5. **Restart backend:**
   ```powershell
   cd backend
   node src/server.js
   ```

   You should see: `✅ Redis connected` and `✅ Redis ready`

### Option 2: Cloud Redis

1. **Get Redis URL from your cloud provider** (e.g., Redis Cloud, AWS ElastiCache)

2. **Set REDIS_URL in `.env`:**
   ```
   REDIS_URL=redis://:password@host:6379
   DISABLE_REDIS=false  # or remove DISABLE_REDIS
   ```

3. **Restart backend**

### Option 3: WSL/Ubuntu (If using WSL)

```bash
sudo apt update
sudo apt install -y redis-server
sudo service redis-server start
redis-cli ping  # Should return PONG
```

Then remove `DISABLE_REDIS` and restart backend.

## Verification

**With Redis disabled:**
- ✅ No Redis connection errors in logs
- ✅ Backend starts successfully
- ✅ Queue service uses in-memory queues

**With Redis enabled:**
- ✅ Logs show: `✅ Redis connected` and `✅ Redis ready`
- ✅ No `ECONNREFUSED` errors
- ✅ Queue service uses Redis for persistence

## Troubleshooting

**If you see Redis connection errors:**
1. Check if Redis is running: `docker ps` or `redis-cli ping`
2. Verify port 6379 is not blocked by firewall
3. Check `REDIS_URL` in `.env` matches your Redis instance
4. Temporarily disable Redis: `DISABLE_REDIS=true`

**If backend won't start:**
- Check MongoDB connection (separate issue)
- Check all required environment variables are set
- Review server logs for specific error messages
