#!/usr/bin/env bash
# End-to-end integration test: backend + frontend ăn khớp.
# Requires: backend on $API_URL, frontend on $WEB_URL.
# Usage: API_URL=http://localhost:8002 WEB_URL=http://localhost:3000 bash scripts/test-e2e-integration.sh
set -euo pipefail

API_URL="${API_URL:-http://localhost:8002}"
WEB_URL="${WEB_URL:-http://localhost:3000}"
SLUG="${SLUG:-bb}"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
PASS=0; FAIL=0

pass() { echo -e "${GREEN}✓${NC} $1"; PASS=$((PASS+1)); }
fail() { echo -e "${RED}✗${NC} $1"; FAIL=$((FAIL+1)); }

check_http() {
  local url="$1" expected="${2:-200}" name="$3"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  if [ "$code" = "$expected" ]; then pass "$name (HTTP $code)"; else fail "$name (got $code, expected $expected)"; fi
}

echo "======================================================="
echo "  bumblebee-ai E2E Integration Test"
echo "  API:    $API_URL"
echo "  Web:    $WEB_URL"
echo "  Slug:   $SLUG"
echo "======================================================="
echo ""

# ============ 1. Backend liveness ============
echo "[1] Backend liveness"
check_http "$API_URL/health" 200 "GET /health"
check_http "$API_URL/health/db" 200 "GET /health/db"
echo ""

# ============ 2. Frontend pages ============
echo "[2] Frontend pages render"
check_http "$WEB_URL/" 200 "GET / (dashboard)"
check_http "$WEB_URL/issues" 200 "GET /issues"
check_http "$WEB_URL/plugins" 200 "GET /plugins"
check_http "$WEB_URL/notifications" 200 "GET /notifications"
echo ""

# ============ 3. Backend API endpoints (frontend uses these) ============
echo "[3] Backend API endpoints"
PROJECTS=$(curl -s "$API_URL/api/projects")
if echo "$PROJECTS" | python -c "import sys,json; d=json.load(sys.stdin); assert any(p['slug']=='$SLUG' for p in d)" 2>/dev/null; then
  pass "GET /api/projects includes slug=$SLUG"
else
  fail "GET /api/projects missing $SLUG"
fi

ISSUES=$(curl -s "$API_URL/api/projects/$SLUG/issues")
ISSUE_COUNT=$(echo "$ISSUES" | python -c "import sys,json; print(len(json.load(sys.stdin)))")
if [ "$ISSUE_COUNT" -ge 3 ]; then
  pass "GET /api/projects/$SLUG/issues returned $ISSUE_COUNT issues"
else
  fail "GET issues returned only $ISSUE_COUNT (expected ≥3)"
fi

check_http "$API_URL/api/plugins" 200 "GET /api/plugins"
check_http "$API_URL/api/notifications" 200 "GET /api/notifications"
echo ""

# ============ 4. E2E create issue via frontend's API path ============
echo "[4] E2E: create issue via REST (same path frontend uses)"
RESP=$(curl -s -X POST "$API_URL/api/projects/$SLUG/issues" \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"e2e-test-$(date +%s)\",\"type\":\"task\",\"priority\":\"medium\"}")
ISSUE_ID=$(echo "$RESP" | python -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "")
if [ -n "$ISSUE_ID" ]; then
  pass "Created issue id=$ISSUE_ID"
else
  fail "Issue creation failed: $RESP"
fi
echo ""

# ============ 5. E2E: trigger workflow (verifies multi-node + real Claude) ============
echo "[5] E2E: trigger workflow (multi-node LangGraph traversal)"
if [ -n "$ISSUE_ID" ]; then
  TRIGGER=$(curl -s -X POST "$API_URL/api/workflow-runs/trigger" \
    -H "Content-Type: application/json" \
    -d "{\"issue_id\":\"$ISSUE_ID\"}")
  STATUS=$(echo "$TRIGGER" | python -c "import sys,json; print(json.load(sys.stdin).get('status','?'))" 2>/dev/null)
  if [ "$STATUS" = "completed" ]; then
    pass "Workflow run completed"
  else
    fail "Workflow status: $STATUS ($TRIGGER)"
  fi

  # Verify event chain
  EVENTS=$(curl -s "$API_URL/api/events?issue_id=$ISSUE_ID&limit=30")
  PYTHONIOENCODING=utf-8 PYTHONUTF8=1 echo "$EVENTS" | python -c "
import sys, json
events = json.load(sys.stdin)
types = [e['type'] for e in events]
required = {'workflow_started', 'session_started', 'llm_call', 'cost_charged', 'session_completed', 'workflow_completed'}
missing = required - set(types)
if not missing:
    sessions = sum(1 for t in types if t == 'session_started')
    llm_calls = sum(1 for t in types if t == 'llm_call')
    print(f'  [ok] event chain complete: {sessions} sessions, {llm_calls} LLM calls')
    sys.exit(0)
else:
    print(f'  [fail] missing event types: {missing}')
    sys.exit(1)
" && pass "Event chain complete" || fail "Event chain incomplete"
fi
echo ""

# ============ 6. Plugin system end-to-end ============
echo "[6] Plugin system end-to-end"
RELOAD=$(curl -s -X POST "$API_URL/api/plugins/reload")
if echo "$RELOAD" | python -c "import sys,json; d=json.load(sys.stdin); assert 'example' in d.get('loaded', [])" 2>/dev/null; then
  pass "Plugin 'example' reloaded successfully"
else
  echo "  plugin reload response: $RELOAD"
fi

PLUGINS=$(curl -s "$API_URL/api/plugins")
if echo "$PLUGINS" | python -c "import sys,json; d=json.load(sys.stdin); ex=[p for p in d if p['name']=='example']; assert ex and ex[0]['status']=='loaded'" 2>/dev/null; then
  pass "Plugin 'example' status=loaded in registry"
else
  fail "Plugin 'example' not registered or not loaded"
fi
echo ""

# ============ 7. Notification flow ============
echo "[7] Notification system"
NOTIF_LIST=$(curl -s "$API_URL/api/notifications?limit=10")
NOTIF_COUNT=$(echo "$NOTIF_LIST" | python -c "import sys,json; print(len(json.load(sys.stdin)))")
pass "GET /api/notifications returned $NOTIF_COUNT items"
echo ""

# ============ Summary ============
TOTAL=$((PASS + FAIL))
echo "======================================================="
if [ $FAIL -eq 0 ]; then
  echo -e "${GREEN}E2E PASS: $PASS/$TOTAL${NC}"
  exit 0
else
  echo -e "${RED}E2E FAIL: $FAIL/$TOTAL failed${NC}"
  exit 1
fi
