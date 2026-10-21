#!/usr/bin/env bash
# Install Fuckball research training on the authorized NEW VPS only.
# Usage: FUCKBALL_SOURCE_SHA=<exact 40-char commit> bash ops/bootstrap-fuckball-new-vps.sh
set -Eeuo pipefail
EXPECTED_HOST=VM-7eb5ee16-2c71-440d-b7fd-8095d204e930
if [[ "$(hostname)" != "$EXPECTED_HOST" ]]; then
  echo "REFUSED: not authorized new VPS ($EXPECTED_HOST); this host is $(hostname)" >&2
  exit 70
fi
[[ "$EUID" -eq 0 ]] || { echo 'Root required' >&2; exit 77; }
SOURCE_SHA="${FUCKBALL_SOURCE_SHA:-}"
[[ "$SOURCE_SHA" =~ ^[a-f0-9]{40}$ ]] || { echo 'FUCKBALL_SOURCE_SHA: exact commit required' >&2; exit 64; }
for cmd in git node python3 systemctl; do
  command -v "$cmd" >/dev/null || { echo "Missing: $cmd" >&2; exit 69; }
done
[[ "$(node -p 'Number(process.versions.node.split(".")[0])')" -ge 22 ]] ||
  { echo 'Install Node 22+ first (no service changed)' >&2; exit 69; }
python3 -m venv --help >/dev/null || { echo 'Install python3-venv first' >&2; exit 69; }
APP=/opt/fuckball-ai
DATA=/var/lib/fuckball-ai
UNIT=fuckball-ai-training.service
mkdir -p "$DATA"
[[ ! -f "$DATA/STOP" ]] || { echo 'STOP exists, operator veto' >&2; exit 73; }
FREE_KIB="$(df -Pk "$DATA" | awk 'NR==2 {print $4}')"
(( FREE_KIB >= 13 * 1024 * 1024 )) || { echo 'Need >=13 GiB free' >&2; exit 75; }
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
git init -q "$STAGE/source"
git -C "$STAGE/source" remote add origin https://github.com/Zennay/fuckball.git
git -C "$STAGE/source" fetch --quiet --depth 1 origin "$SOURCE_SHA"
git -C "$STAGE/source" checkout --quiet --detach FETCH_HEAD
[[ "$(git -C "$STAGE/source" rev-parse HEAD)" == "$SOURCE_SHA" ]] || exit 65
for f in training/continuous.cjs training/haxlab_selfplay.cjs training/league.cjs training/train.py; do
  [[ -f "$STAGE/source/$f" ]] || { echo "Missing $f" >&2; exit 65; }
done
node --check "$STAGE/source/training/continuous.cjs"
node --check "$STAGE/source/training/haxlab_selfplay.cjs"
node --check "$STAGE/source/training/league.cjs"
id -u fuckball-ai >/dev/null 2>&1 ||
  useradd --system --home-dir "$DATA" --shell /usr/sbin/nologin fuckball-ai
install -d -m 0750 -o fuckball-ai -g fuckball-ai "$DATA"
install -d -m 0755 "$APP" "$APP/releases"
if [[ ! -d "$APP/releases/$SOURCE_SHA" ]]; then
  mkdir -p "$APP/releases/$SOURCE_SHA"
  cp -a "$STAGE/source/." "$APP/releases/$SOURCE_SHA/"
fi
[[ -x "$APP/venv/bin/python3" ]] || python3 -m venv "$APP/venv"
"$APP/venv/bin/python3" -m pip install --disable-pip-version-check --no-input 'numpy>=2.1,<3'
NODE="$(command -v node)"
cat > "$STAGE/$UNIT" <<UNITFILE
[Unit]
Description=Fuckball autonomous AI training (new VPS only)
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=3600
StartLimitBurst=3

[Service]
Type=simple
User=fuckball-ai
Group=fuckball-ai
WorkingDirectory=$APP/releases/$SOURCE_SHA
Environment=CODEX_PRIMARY_RUNTIME_PYTHON=$APP/venv/bin/python3
Environment=HAXLAB_EPISODES=72
Environment=HAXLAB_GENERATIONS=6
Environment=HAXLAB_LEAGUE_FRAMES=2400
Environment=HAXLAB_DISK_RESERVE_GIB=10
Environment=HAXLAB_PLATEAU_STEP=24
Environment=HAXLAB_KEEP_DATASETS=1
ExecStart=$NODE $APP/releases/$SOURCE_SHA/training/continuous.cjs $DATA forever
Restart=on-failure
RestartSec=90
CPUQuota=200%
MemoryMax=4G
Nice=12
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$DATA

[Install]
WantedBy=multi-user.target
UNITFILE
install -m 0644 "$STAGE/$UNIT" "/etc/systemd/system/$UNIT"
systemctl daemon-reload
systemctl enable --now "$UNIT"
sleep 2
if ! systemctl is-active --quiet "$UNIT"; then
  echo 'Fuckball failed, HaxLab untouched' >&2
  journalctl --no-pager -u "$UNIT" -n 20 >&2 || true
  exit 1
fi
# Pause HaxLab training, not ingestion/game data, only on the verified new host.
for old in haxlab-autonomy.service haxlab-generation-loop.service haxlab-native-training.service; do
  if systemctl list-unit-files --no-legend "$old" 2>/dev/null | grep -Fq "$old "; then
    systemctl disable --now "$old"
    echo "PAUSED_TRAINING $old"
  fi
done
printf '%s\n' "$SOURCE_SHA" > "$APP/active-source-sha"
echo "NEW_VPS_FUCKBALL_TRAINER_ACTIVE host=$(hostname) source=$SOURCE_SHA"
systemctl is-active "$UNIT"
