#!/usr/bin/env bash
# auto-scale.sh — Auto-scale Licitagram workers based on queue depth
# Install: crontab -e -> */5 * * * * /opt/licitagram/packages/workers/scripts/auto-scale.sh
set -euo pipefail

LOG_DIR="/var/log/licitagram"
LOG_FILE="$LOG_DIR/auto-scale.log"
REDIS_PASS="a15b96315876efb68a5a9bb4fd48b66e"
ECOSYSTEM="/opt/licitagram/packages/workers/ecosystem.config.js"

mkdir -p "$LOG_DIR"

ts() { date '+%Y-%m-%d %H:%M:%S'; }

log() { echo "[$(ts)] $*" >> "$LOG_FILE"; }

# Get queue size (waiting + delayed + active)
queue_size() {
  local queue="$1"
  local waiting delayed active
  waiting=$(redis-cli -a "$REDIS_PASS" --no-auth-warning LLEN "bull:${queue}:wait" 2>/dev/null || echo 0)
  delayed=$(redis-cli -a "$REDIS_PASS" --no-auth-warning ZCARD "bull:${queue}:delayed" 2>/dev/null || echo 0)
  active=$(redis-cli -a "$REDIS_PASS" --no-auth-warning LLEN "bull:${queue}:active" 2>/dev/null || echo 0)
  echo $(( waiting + delayed + active ))
}

# Count running PM2 instances of a given process name
instance_count() {
  local name="$1"
  pm2 jlist 2>/dev/null | jq -r "[.[] | select(.name == \"${name}\" and .pm2_env.status == \"online\")] | length" 2>/dev/null || echo 0
}

# Scale a worker up or down
scale_worker() {
  local name="$1"
  local queue="$2"
  local threshold="$3"
  local size instances

  size=$(queue_size "$queue")
  instances=$(instance_count "$name")

  if [ "$size" -gt "$threshold" ] && [ "$instances" -lt 2 ]; then
    log "SCALE UP: ${name} (queue=${queue}, size=${size}, threshold=${threshold}, instances=${instances}->2)"
    pm2 scale "$name" 2 --no-autorestart 2>/dev/null || \
      log "ERROR: Failed to scale up ${name}"
  elif [ "$size" -le "$threshold" ] && [ "$instances" -gt 1 ]; then
    log "SCALE DOWN: ${name} (queue=${queue}, size=${size}, threshold=${threshold}, instances=${instances}->1)"
    pm2 scale "$name" 1 2>/dev/null || \
      log "ERROR: Failed to scale down ${name}"
  fi
}

# --- Main ---
scale_worker "worker-extraction" "extraction" 5000
scale_worker "worker-matching"   "semantic-matching" 10000

# Rotate log (keep last 10K lines)
if [ -f "$LOG_FILE" ] && [ "$(wc -l < "$LOG_FILE")" -gt 10000 ]; then
  tail -5000 "$LOG_FILE" > "${LOG_FILE}.tmp" && mv "${LOG_FILE}.tmp" "$LOG_FILE"
  log "Log rotated"
fi
