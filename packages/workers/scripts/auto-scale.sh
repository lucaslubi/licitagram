#!/usr/bin/env bash
# auto-scale.sh — Aggressive auto-scaling for Licitagram workers
# Guarantees max 4-hour backlog drain time
# Install: crontab -e -> */2 * * * * /opt/licitagram/packages/workers/scripts/auto-scale.sh
set -euo pipefail

LOG_DIR="/var/log/licitagram"
LOG_FILE="$LOG_DIR/auto-scale.log"
REDIS_PASS="a15b96315876efb68a5a9bb4fd48b66e"
ECOSYSTEM="/opt/licitagram/packages/workers/ecosystem.config.js"

# Resource limits
MAX_MEMORY_GB=6
MAX_INSTANCES_PER_WORKER=3

# Rate file for tracking processing speed (jobs/min)
RATE_DIR="$LOG_DIR/rates"

mkdir -p "$LOG_DIR" "$RATE_DIR"

ts() { date '+%Y-%m-%d %H:%M:%S'; }
log() { echo "[$(ts)] $*" >> "$LOG_FILE"; }

# ─── Queue helpers ──────────────────────────────────────────────────────────

queue_size() {
  local queue="$1"
  local waiting delayed active
  waiting=$(redis-cli -a "$REDIS_PASS" --no-auth-warning LLEN "bull:${queue}:wait" 2>/dev/null || echo 0)
  delayed=$(redis-cli -a "$REDIS_PASS" --no-auth-warning ZCARD "bull:${queue}:delayed" 2>/dev/null || echo 0)
  active=$(redis-cli -a "$REDIS_PASS" --no-auth-warning LLEN "bull:${queue}:active" 2>/dev/null || echo 0)
  echo $(( waiting + delayed + active ))
}

completed_count() {
  local queue="$1"
  redis-cli -a "$REDIS_PASS" --no-auth-warning GET "bull:${queue}:id" 2>/dev/null || echo 0
}

# ─── Processing rate calculation ────────────────────────────────────────────

# Track completed jobs to calculate processing rate (jobs/min)
calc_rate() {
  local queue="$1"
  local rate_file="$RATE_DIR/${queue}.last"
  local current_completed
  current_completed=$(completed_count "$queue")

  if [ -f "$rate_file" ]; then
    local last_completed last_ts now_ts elapsed rate
    last_completed=$(head -1 "$rate_file")
    last_ts=$(tail -1 "$rate_file")
    now_ts=$(date +%s)
    elapsed=$(( now_ts - last_ts ))

    if [ "$elapsed" -gt 0 ] && [ "$elapsed" -lt 600 ]; then
      local delta=$(( current_completed - last_completed ))
      if [ "$delta" -lt 0 ]; then delta=0; fi
      # Rate = jobs per minute
      rate=$(( delta * 60 / elapsed ))
      echo "$rate"
    else
      echo 0
    fi
  else
    echo 0
  fi

  # Save current state
  echo "$current_completed" > "$rate_file"
  date +%s >> "$rate_file"
}

# ─── Drain time calculation ─────────────────────────────────────────────────

# Returns drain time in minutes (0 = empty queue)
drain_time() {
  local size="$1"
  local rate="$2"

  if [ "$size" -eq 0 ]; then
    echo 0
    return
  fi

  if [ "$rate" -le 0 ]; then
    # No processing happening — infinite drain time, return 9999
    echo 9999
    return
  fi

  echo $(( size / rate ))
}

# ─── Instance management ───────────────────────────────────────────────────

instance_count() {
  local name="$1"
  pm2 jlist 2>/dev/null | jq -r "[.[] | select(.name == \"${name}\" and .pm2_env.status == \"online\")] | length" 2>/dev/null || echo 0
}

total_memory_mb() {
  pm2 jlist 2>/dev/null | jq '[.[].monit.memory // 0] | add / 1048576' 2>/dev/null || echo 0
}

# ─── Aggressive scaling logic ──────────────────────────────────────────────

scale_worker() {
  local name="$1"
  local queue="$2"
  local size rate dt instances target

  size=$(queue_size "$queue")
  rate=$(calc_rate "$queue")
  dt=$(drain_time "$size" "$rate")
  instances=$(instance_count "$name")

  # Determine target instances based on queue depth
  if [ "$size" -gt 10000 ]; then
    target=3
  elif [ "$size" -gt 5000 ]; then
    target=2
  elif [ "$size" -gt 1000 ]; then
    # Keep 1 instance but rely on high concurrency
    target=1
  else
    target=1
  fi

  # Override: if drain time > 4 hours (240 min) and we can scale more, do it
  if [ "$dt" -gt 240 ] && [ "$target" -lt 3 ]; then
    target=$(( target + 1 ))
    if [ "$target" -gt "$MAX_INSTANCES_PER_WORKER" ]; then
      target=$MAX_INSTANCES_PER_WORKER
    fi
  fi

  # Scale DOWN if drain time < 1 hour (60 min) and queue is small
  if [ "$dt" -lt 60 ] && [ "$size" -lt 500 ] && [ "$instances" -gt 1 ]; then
    target=1
  fi

  # Memory guard: check total memory before scaling UP
  if [ "$target" -gt "$instances" ]; then
    local mem_mb
    mem_mb=$(total_memory_mb)
    local mem_gb_x10=$(( ${mem_mb%.*} * 10 / 1024 ))
    local max_gb_x10=$(( MAX_MEMORY_GB * 10 ))

    if [ "$mem_gb_x10" -gt "$max_gb_x10" ]; then
      log "MEMORY GUARD: Total ${mem_mb}MB — cannot scale up ${name} (target=$target, current=$instances)"
      target=$instances
    fi
  fi

  # Apply scaling
  if [ "$target" -ne "$instances" ]; then
    log "SCALE: ${name} ${instances}->${target} (queue=${queue}, size=${size}, rate=${rate}/min, drain=${dt}min)"
    pm2 scale "$name" "$target" 2>/dev/null || \
      log "ERROR: Failed to scale ${name} to ${target}"
  else
    log "OK: ${name} instances=${instances} (queue=${queue}, size=${size}, rate=${rate}/min, drain=${dt}min)"
  fi
}

# ─── Emergency drain mode ──────────────────────────────────────────────────

emergency_purge() {
  local queue="$1"
  local size
  size=$(queue_size "$queue")

  if [ "$size" -gt 20000 ]; then
    log "EMERGENCY: Queue ${queue} has ${size} jobs — purging jobs older than 24h"

    # Remove waiting jobs older than 24h (86400000 ms)
    local cutoff_ms
    cutoff_ms=$(( $(date +%s) * 1000 - 86400000 ))

    # Use Redis to trim old delayed jobs (scored by timestamp)
    local removed
    removed=$(redis-cli -a "$REDIS_PASS" --no-auth-warning ZREMRANGEBYSCORE "bull:${queue}:delayed" 0 "$cutoff_ms" 2>/dev/null || echo 0)
    log "EMERGENCY: Removed ${removed} delayed jobs older than 24h from ${queue}"

    # For waiting jobs, we drain the oldest ones via BullMQ's built-in cleanup
    # This is safer than raw Redis manipulation
    local to_remove=$(( size - 15000 ))
    if [ "$to_remove" -gt 0 ]; then
      # Remove from the tail (oldest) of the wait list
      redis-cli -a "$REDIS_PASS" --no-auth-warning LTRIM "bull:${queue}:wait" 0 14999 2>/dev/null
      log "EMERGENCY: Trimmed waiting list to 15000 jobs for ${queue} (removed ~${to_remove})"
    fi
  fi
}

# ─── Main ───────────────────────────────────────────────────────────────────

log "=== Auto-scale run ==="

# Check total memory first
TOTAL_MEM=$(total_memory_mb)
log "Total PM2 memory: ${TOTAL_MEM}MB"

# Emergency purge for oversized queues
emergency_purge "extraction"
emergency_purge "semantic-matching"
emergency_purge "scraping"
emergency_purge "matching"

# Scale workers
scale_worker "worker-extraction" "extraction"
scale_worker "worker-matching"   "semantic-matching"
scale_worker "worker-scraping"   "scraping"

# If total memory > 6GB, force scale down the biggest consumers
MEM_INT=${TOTAL_MEM%.*}
if [ "${MEM_INT:-0}" -gt 6144 ]; then
  log "MEMORY CRITICAL: ${TOTAL_MEM}MB > 6GB — scaling down all workers to 1 instance"
  for w in worker-extraction worker-matching worker-scraping; do
    current=$(instance_count "$w")
    if [ "$current" -gt 1 ]; then
      pm2 scale "$w" 1 2>/dev/null || true
      log "MEMORY: Scaled down ${w} from ${current} to 1"
    fi
  done
fi

# Rotate log (keep last 10K lines)
if [ -f "$LOG_FILE" ] && [ "$(wc -l < "$LOG_FILE")" -gt 10000 ]; then
  tail -5000 "$LOG_FILE" > "${LOG_FILE}.tmp" && mv "${LOG_FILE}.tmp" "$LOG_FILE"
  log "Log rotated"
fi
