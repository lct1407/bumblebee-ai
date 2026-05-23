#!/usr/bin/env bash
# Sync Cloudflare DNS A records for Bumblebee.
#
# Required env:
#   CLOUDFLARE_API_TOKEN  — token with Zone:DNS:Edit + Zone:Zone:Read
#   CLOUDFLARE_ZONE_ID    — your zone id (from CF dashboard URL)
#   DOMAIN_API            — e.g. api.bb.yourdomain.com
#   DOMAIN_WEB            — e.g. bb.yourdomain.com
#   SERVER_IP             — public IPv4 of the deploy host
#                           (skip if using Cloudflare Tunnel — tunnel manages
#                            its own CNAME via the dashboard)
#
# Idempotent: updates existing A records or creates new ones.
set -euo pipefail

API="https://api.cloudflare.com/client/v4"
AUTH="-H \"Authorization: Bearer $CLOUDFLARE_API_TOKEN\""

: "${CLOUDFLARE_API_TOKEN:?required}"
: "${CLOUDFLARE_ZONE_ID:?required}"
: "${SERVER_IP:?required (skip this script if using Cloudflare Tunnel)}"

upsert_a_record() {
  local name="$1"
  local ip="$2"
  echo "[cf] upsert $name → $ip"

  # Find existing record
  local rec_id
  rec_id=$(curl -fsS \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    "$API/zones/$CLOUDFLARE_ZONE_ID/dns_records?type=A&name=$name" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); r=d.get('result',[]); print(r[0]['id'] if r else '')")

  local body
  body=$(printf '{"type":"A","name":"%s","content":"%s","ttl":300,"proxied":true}' "$name" "$ip")

  if [ -n "$rec_id" ]; then
    curl -fsS -X PUT \
      -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
      -H "Content-Type: application/json" \
      "$API/zones/$CLOUDFLARE_ZONE_ID/dns_records/$rec_id" \
      -d "$body" >/dev/null
    echo "    updated id=$rec_id"
  else
    curl -fsS -X POST \
      -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
      -H "Content-Type: application/json" \
      "$API/zones/$CLOUDFLARE_ZONE_ID/dns_records" \
      -d "$body" >/dev/null
    echo "    created new record"
  fi
}

[ -n "${DOMAIN_API:-}" ] && upsert_a_record "$DOMAIN_API" "$SERVER_IP"
[ -n "${DOMAIN_WEB:-}" ] && upsert_a_record "$DOMAIN_WEB" "$SERVER_IP"

echo "[cf] sync done."
