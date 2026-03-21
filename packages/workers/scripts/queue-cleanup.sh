#!/usr/bin/env bash
# queue-cleanup.sh — Daily Redis queue cleanup for Licitagram
# Removes completed jobs >24h and failed jobs >48h to save Redis memory
# Install: crontab -e -> 0 3 * * * /opt/licitagram/packages/workers/scripts/queue-cleanup.sh
set -euo pipefail

LOG_DIR="/var/log/licitagram"
LOG_FILE="$LOG_DIR/queue-cleanup.log"
REDIS_PASS="a15b96315876efb68a5a9bb4fd48b66e"

mkdir -p "$LOG_DIR"

ts() { date '+%Y-%m-%d %H:%M:%S'; }
log() { echo "[$(ts)] $*" >> "$LOG_FILE"; }

# All known queues
QUEUES=(
  "scraping"
  "extraction"
  "matching"
  "semantic-matching"
  "ai-triage"
  "hot-alerts"
  "notification"
  "telegram-notification"
  "whatsapp-notification"
  "pending-notifications"
  "results-scraping"
  "fornecedor-enrichment"
  "competition-analysis"
  "contact-enrichment"
  "comprasgov-scraping"
  "comprasgov-arp"
  "comprasgov-legado"
  "bec-sp-scraping"
  "document-expiry"
  "certidoes"
  "map-cache"
  "company-profiler"
  "keyword-matcher"
  "outcome-check"
  "pipeline-health"
  "daily-audit"
  "ai-competitor-classifier"
  "competitor-relevance"
  "proactive-supplier-scraping"
)

log "=== Queue cleanup started ==="

TOTAL_COMPLETED=0
TOTAL_FAILED=0

# Timestamps
NOW_MS=$(( $(date +%s) * 1000 ))
COMPLETED_CUTOFF=$(( NOW_MS - 86400000 ))    # 24h ago
FAILED_CUTOFF=$(( NOW_MS - 172800000 ))       # 48h ago

for queue in "${QUEUES[@]}"; do
  # Count completed jobs before cleanup
  completed_before=$(redis-cli -a "$REDIS_PASS" --no-auth-warning ZCARD "bull:${queue}:completed" 2>/dev/null || echo 0)

  # Remove completed jobs older than 24h (scored by timestamp)
  completed_removed=$(redis-cli -a "$REDIS_PASS" --no-auth-warning ZREMRANGEBYSCORE "bull:${queue}:completed" 0 "$COMPLETED_CUTOFF" 2>/dev/null || echo 0)

  # Count failed jobs before cleanup
  failed_before=$(redis-cli -a "$REDIS_PASS" --no-auth-warning ZCARD "bull:${queue}:failed" 2>/dev/null || echo 0)

  # Remove failed jobs older than 48h
  failed_removed=$(redis-cli -a "$REDIS_PASS" --no-auth-warning ZREMRANGEBYSCORE "bull:${queue}:failed" 0 "$FAILED_CUTOFF" 2>/dev/null || echo 0)

  if [ "$completed_removed" -gt 0 ] || [ "$failed_removed" -gt 0 ]; then
    log "  ${queue}: completed=${completed_removed}/${completed_before} removed, failed=${failed_removed}/${failed_before} removed"
  fi

  TOTAL_COMPLETED=$(( TOTAL_COMPLETED + completed_removed ))
  TOTAL_FAILED=$(( TOTAL_FAILED + failed_removed ))
done

# Clean up orphaned job data keys
# BullMQ stores job data in hash keys like bull:<queue>:<jobId>
# After removing from sorted sets, the hash keys may remain
# We skip this for now as it requires iterating all keys (expensive)

# Report Redis memory usage
REDIS_MEM=$(redis-cli -a "$REDIS_PASS" --no-auth-warning INFO memory 2>/dev/null | grep "used_memory_human" | cut -d: -f2 | tr -d '\r' || echo "unknown")

log "=== Cleanup complete: ${TOTAL_COMPLETED} completed + ${TOTAL_FAILED} failed jobs removed ==="
log "Redis memory: ${REDIS_MEM}"

# Rotate cleanup log (keep last 1000 lines)
if [ -f "$LOG_FILE" ] && [ "$(wc -l < "$LOG_FILE")" -gt 1000 ]; then
  tail -500 "$LOG_FILE" > "${LOG_FILE}.tmp" && mv "${LOG_FILE}.tmp" "$LOG_FILE"
  log "Cleanup log rotated"
fi
