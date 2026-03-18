#!/usr/bin/env bash
# Start workers with constrained heap (512 MB) to prevent OOM on VPS
# Usage: bash start-workers.sh   OR   pm2 start start-workers.sh
set -euo pipefail
cd "$(dirname "$0")"
exec node --max-old-space-size=512 --expose-gc dist/index.js
