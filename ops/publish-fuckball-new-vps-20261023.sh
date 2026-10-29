#!/usr/bin/env bash
# Publish an already-running Fuckball game on the NEW VPS via Caddy HTTPS.
# No game, trainer, database, browser or runner is started/stopped here.
# Default: read-only status; apply needs deliberate, scoped cutover approval.
set -Eeuo pipefail

MODE="${1:---status}"
TARGET_HOST='VM-7eb5ee16-2c71-440d-b7fd-8095d204e930'
TARGET_IP='95.211.40.88'
DOMAIN='fuckball.zennay.nl'
CADDYFILE='/etc/caddy/Caddyfile'
SITES='/etc/caddy/sites-enabled'
SITE='/etc/caddy/sites-enabled/fuckball-game.caddy'
IMPORT='import /etc/caddy/sites-enabled/*'
# Shared lock with the independent zCloud dashboard publisher.
LOCK='/run/lock/zcloud-dashboard-publication.lock'

die() { printf 'REFUSED: %s\n' "$*" >&2; exit 2; }
say() { printf '%s\n' "$*"; }
[[ "$MODE" == --status || "$MODE" == --apply ]] || die 'usage: --status | --apply'
[[ "$(hostname)" == "$TARGET_HOST" ]] || die 'wrong VPS'
for cmd in curl getent python3 caddy ss systemctl flock mktemp ln unlink; do
  command -v "$cmd" >/dev/null || die "missing executable: $cmd"
done

backend_ready() {
  local listeners
  listeners="$(ss -H -ltn '( sport = :3417 )' | awk '{print $4}' | sort -u)"
  [[ "$listeners" == '127.0.0.1:3417' ]] || return 1
  curl --noproxy '*' --fail --silent --show-error --max-time 5 \
    'http://127.0.0.1:3417/health' |
    python3 -c 'import json,sys; x=json.load(sys.stdin); assert x.get("ok") is True and x.get("engine")=="node-haxball-2.3.1" and x.get("physicsHz")==60 and x.get("snapshotHz")==30'
}

dns_ready() {
  local a
  a="$(getent ahostsv4 "$DOMAIN" | awk '{print $1}' | sort -u || true)"
  [[ "$a" == "$TARGET_IP" ]] || return 1
  # No known new-host IPv6 address; refuse a real AAAA record.
  # getent ahostsv6 may synthesize IPv4-mapped IPv6, so query AF_INET6
  # explicitly without AI_V4MAPPED and fail closed on DNS errors.
  python3 - "$DOMAIN" <<'PY'
import socket, sys
try:
    entries = socket.getaddrinfo(sys.argv[1], None, socket.AF_INET6,
                                  socket.SOCK_STREAM, flags=0)
except socket.gaierror as exc:
    if exc.errno in (socket.EAI_NONAME, getattr(socket, 'EAI_ADDRFAMILY', -999)):
        raise SystemExit(0)
    raise SystemExit(1)
raise SystemExit(1 if entries else 0)
PY
}

caddy_import_ready() {
  [[ -f "$CADDYFILE" && ! -L "$CADDYFILE" &&
     -d "$SITES" && ! -L "$SITES" ]] &&
    grep -Fxq "$IMPORT" "$CADDYFILE"
}

public_health() {
  # Verify Caddy's local TLS/SNI route, not an accidental old-VPS response.
  curl --noproxy '*' --fail --silent --show-error --max-time 8 \
    --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/health" |
    python3 -c 'import json,sys; x=json.load(sys.stdin); assert x.get("ok") is True and x.get("engine")=="node-haxball-2.3.1" and x.get("physicsHz")==60'
}

say "target=$TARGET_HOST ip=$TARGET_IP domain=$DOMAIN"
if backend_ready; then say 'backend=healthy_loopback'; else say 'backend=not_ready'; fi
if dns_ready; then say 'dns=target_ipv4_no_stale_ipv6'; else say 'dns=not_ready'; fi
if caddy_import_ready; then say 'caddy_import=ready'; else say 'caddy_import=missing'; fi
if systemctl is-active --quiet caddy; then say 'caddy=active'; else say 'caddy=inactive'; fi
if public_health; then say 'local_tls_route=healthy'; else say 'local_tls_route=not_proven'; fi
[[ "$MODE" == --apply ]] || exit 0

[[ "$EUID" -eq 0 ]] || die 'root required'
[[ "${FUCKBALL_CUTOVER_CONFIRMED:-}" == yes ]] ||
  die 'require explicit new-VPS app-state/route cutover confirmation'
exec 9>"$LOCK"
flock -n 9 || die 'another site publication is active'
backend_ready || die 'port 3417 must be healthy and bound only to 127.0.0.1'
dns_ready || die 'fix A/AAAA at authoritative DNS before publication'
caddy_import_ready || die 'Caddy owner must approve the existing sites-enabled import'
systemctl is-active --quiet caddy || die 'Caddy not running'
if [[ -e "$SITE" || -L "$SITE" ]]; then
  public_health && { say 'ALREADY_LIVE_LOCAL_TLS_HEALTHY'; exit 0; }
  die 'existing site is not healthy; refusing to overwrite'
fi

STAGED=''
cleanup_stage() { if [[ -n "$STAGED" && -f "$STAGED" ]]; then unlink "$STAGED"; fi; }
trap cleanup_stage EXIT
STAGED="$(mktemp /etc/caddy/.fuckball-site-staged.XXXXXXXX)"
cat >"$STAGED" <<'CADDY'
fuckball.zennay.nl {
    encode zstd gzip
    header {
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
    }
    # Caddy forwards WebSocket upgrades for /ws automatically.
    reverse_proxy 127.0.0.1:3417
}
CADDY
chmod 0644 "$STAGED"
ln "$STAGED" "$SITE" || die 'site path occupied; no overwrite'
unlink "$STAGED"
STAGED=''

rollback() {
  local reason="$1"
  mv "$SITE" "/etc/caddy/.fuckball-site-rejected-$(date +%s)-$$.caddy" || true
  caddy validate --config "$CADDYFILE" --adapter caddyfile >/dev/null 2>&1 &&
    systemctl reload caddy || true
  die "$reason; own site removed from active imports"
}
caddy validate --config "$CADDYFILE" --adapter caddyfile >/dev/null 2>&1 ||
  rollback 'Caddy configuration validation failed'
systemctl reload caddy || rollback 'Caddy reload failed'
# TLS issuance can take a little time; retry without disabling certificate validation.
ok=false
for attempt in 1 2 3 4 5 6 7 8; do
  if public_health; then ok=true; break; fi
  sleep 3
done
[[ "$ok" == true ]] || rollback 'TLS/SNI or /health not verified'
say 'FUCKBALL_NEW_VPS_LOCAL_HTTPS_HEALTH_GREEN'
say 'Verify public HTTPS, homepage, same-origin WebSockets and multiplayer externally.'
