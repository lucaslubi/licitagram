#!/usr/bin/env bash
# Smoke test pra fixes do Auto-Pilot (F1-F12) — valida API + DB.
#
# Uso:
#   BOT_API_KEY=lgk_... CONFIG_ID=<uuid-de-bot_config> \
#     BASE_URL=https://app.licitagram.com.br \
#     ./scripts/smoke-test-bot-fixes.sh
#
# Defaults:
#   BASE_URL=http://localhost:3000
#
# Cobertura:
#   F2  — piso obrigatório (POST sem min_price em auto_bid → 400)
#   F2  — piso > 0 (POST com min_price=0 → 400)
#   F2  — piso válido (POST com min_price=10 → 201, cleanup cancela)
#   F10 — PATCH strategy: floor edit ao vivo
#   F10 — PATCH strategy: status pause/resume/cancel
#   F10 — PATCH strategy: rejeita auto_bid sem piso
#
# F1/F4/F7 são cobertos pelos unit tests em dispute-engine.test.ts
# F3/F5/F6/F8/F9 exigem worker rodando — validar via worker logs
# durante uma sessão real (vide /docs/engineering/auto-pilot-state-machine.md).

set -u

BASE_URL="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
RESULTS=()

if [[ -z "${BOT_API_KEY:-}" ]]; then
  echo "✗ BOT_API_KEY não definido. Crie em /conta/api-keys e exporte." >&2
  exit 2
fi
if [[ -z "${CONFIG_ID:-}" ]]; then
  echo "✗ CONFIG_ID não definido (UUID de bot_configs)." >&2
  exit 2
fi

PREGAO_ID="${PREGAO_ID:-99999999900000001}" # ID fake; sessão fica pending mas a validação acontece antes

# ── helpers ───────────────────────────────────────────────────────────
post() {
  local body="$1"
  curl -s -X POST "${BASE_URL}/api/v1/bot/sessions" \
    -H "Authorization: Bearer ${BOT_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "${body}" \
    -w "\nHTTP=%{http_code}"
}
patch_strat() {
  local sid="$1"
  local body="$2"
  curl -s -X PATCH "${BASE_URL}/api/bot/sessions/${sid}/strategy" \
    -H "Authorization: Bearer ${BOT_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "${body}" \
    -w "\nHTTP=%{http_code}"
}
http_code() { echo "$1" | grep "^HTTP=" | cut -d= -f2; }
body() { echo "$1" | sed '/^HTTP=/d'; }

assert_eq() {
  local name="$1"; local expected="$2"; local actual="$3"; local detail="${4:-}"
  if [[ "${expected}" == "${actual}" ]]; then
    echo "  ✓ ${name}"
    PASS=$((PASS + 1))
    RESULTS+=("PASS|${name}")
  else
    echo "  ✗ ${name}: esperado=${expected} obtido=${actual} ${detail}"
    FAIL=$((FAIL + 1))
    RESULTS+=("FAIL|${name}|expected=${expected} got=${actual}")
  fi
}

assert_contains() {
  local name="$1"; local needle="$2"; local haystack="$3"
  if echo "${haystack}" | grep -q "${needle}"; then
    echo "  ✓ ${name}"
    PASS=$((PASS + 1))
    RESULTS+=("PASS|${name}")
  else
    echo "  ✗ ${name}: '${needle}' não encontrado em response"
    FAIL=$((FAIL + 1))
    RESULTS+=("FAIL|${name}")
  fi
}

# ── F2 — piso obrigatório ─────────────────────────────────────────────
echo
echo "━━━ F2 — piso obrigatório no enqueue ━━━"

resp=$(post "{\"config_id\":\"${CONFIG_ID}\",\"pregao_id\":\"${PREGAO_ID}-a\",\"mode\":\"auto_bid\"}")
assert_eq "F2.1: auto_bid sem min_price → 400"          "400" "$(http_code "$resp")"
assert_contains "F2.1.body: code=piso_obrigatorio"      "piso_obrigatorio" "$(body "$resp")"

resp=$(post "{\"config_id\":\"${CONFIG_ID}\",\"pregao_id\":\"${PREGAO_ID}-b\",\"mode\":\"auto_bid\",\"min_price\":0}")
assert_eq "F2.2: auto_bid com min_price=0 → 400"        "400" "$(http_code "$resp")"

resp=$(post "{\"config_id\":\"${CONFIG_ID}\",\"pregao_id\":\"${PREGAO_ID}-c\",\"mode\":\"auto_bid\",\"min_price\":-5}")
assert_eq "F2.3: auto_bid com min_price negativo → 400" "400" "$(http_code "$resp")"

resp=$(post "{\"config_id\":\"${CONFIG_ID}\",\"pregao_id\":\"${PREGAO_ID}-d\",\"mode\":\"supervisor\"}")
sup_code=$(http_code "$resp")
assert_contains "F2.4: supervisor SEM piso é aceito (200/201)" "20" "${sup_code}"
SUP_ID=$(body "$resp" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -1)

resp=$(post "{\"config_id\":\"${CONFIG_ID}\",\"pregao_id\":\"${PREGAO_ID}-e\",\"mode\":\"auto_bid\",\"min_price\":10}")
auto_code=$(http_code "$resp")
assert_contains "F2.5: auto_bid com min_price=10 é aceito (200/201)" "20" "${auto_code}"
AUTO_ID=$(body "$resp" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -1)

# ── F10 — PATCH strategy ──────────────────────────────────────────────
if [[ -n "${AUTO_ID:-}" ]]; then
  echo
  echo "━━━ F10 — PATCH strategy ao vivo ━━━"

  resp=$(patch_strat "${AUTO_ID}" '{"min_price":15}')
  assert_eq "F10.1: edit min_price → 200"                "200" "$(http_code "$resp")"

  resp=$(patch_strat "${AUTO_ID}" '{"min_price":-1}')
  assert_eq "F10.2: min_price negativo → 400"            "400" "$(http_code "$resp")"

  resp=$(patch_strat "${AUTO_ID}" '{"strategy_config":{"minDelayBetweenOwnBidsMs":5000,"maxBidsPerMinute":10}}')
  assert_eq "F10.3: rate-limit edit → 200"               "200" "$(http_code "$resp")"

  resp=$(patch_strat "${AUTO_ID}" '{"strategy_config":{"stopLossPct":30,"stopLossWindowSec":60}}')
  assert_eq "F10.4: stop-loss edit → 200"                "200" "$(http_code "$resp")"

  resp=$(patch_strat "${AUTO_ID}" '{"status":"paused"}')
  assert_eq "F10.5: PAUSE → 200"                         "200" "$(http_code "$resp")"

  resp=$(patch_strat "${AUTO_ID}" '{"status":"active"}')
  assert_eq "F10.6: RESUME → 200"                        "200" "$(http_code "$resp")"

  resp=$(patch_strat "${AUTO_ID}" '{"status":"INVALID"}')
  assert_eq "F10.7: status inválido → 400"               "400" "$(http_code "$resp")"

  if [[ -n "${SUP_ID:-}" ]]; then
    resp=$(patch_strat "${SUP_ID}" '{"mode":"auto_bid"}')
    assert_eq "F10.8: trocar pra auto_bid sem piso → 400" "400" "$(http_code "$resp")"
    assert_contains "F10.8.body: code=piso_obrigatorio"    "piso_obrigatorio" "$(body "$resp")"
  fi
fi

# ── Cleanup ───────────────────────────────────────────────────────────
echo
echo "━━━ Cleanup (PANIC stop sessões criadas) ━━━"
for sid in "${SUP_ID:-}" "${AUTO_ID:-}"; do
  if [[ -n "${sid}" ]]; then
    patch_strat "${sid}" '{"status":"cancelled"}' >/dev/null
    echo "  ↳ ${sid} → cancelled"
  fi
done

# ── Summary ───────────────────────────────────────────────────────────
echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Smoke F1-F12: ${PASS} pass / ${FAIL} fail"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [[ ${FAIL} -gt 0 ]]; then
  echo
  echo "Falhas:"
  printf '%s\n' "${RESULTS[@]}" | grep '^FAIL' | sed 's/^/  /'
  exit 1
fi
exit 0
