#!/usr/bin/env bash
set -euo pipefail
# Continual offload of completed, non-active Fuckball training cycles.
# Keep the latest completed cycle and all champion/model pointers local.
ROOT=/opt/fuckball-training
RCLONE=/home/ubuntu/.local/bin/rclone
REMOTE=vpsarchive:zcloud-vps/cold/Fuckball/training-cycles
LOCK=/run/user/1000/fuckball-cold-archive.lock
SPOOL=$ROOT/.archive-staging
LOG=/home/ubuntu/zennay-cloud/fuckball-cold-archive-20261021.log
exec >> "$LOG" 2>&1
echo "$(date -Is) archive scan start"
exec 9>"$LOCK"
flock -n 9 || { echo "Another archive already running"; exit 0; }
[[ -x "$RCLONE" && -f "$ROOT/status.json" ]] || { echo 'Missing rclone or trainer status'; exit 2; }
# Verify remote mount is available; write through rclone (the mount is read-only).
findmnt --target /home/ubuntu/VPS-Archief -n -o FSTYPE | grep -qx fuse.rclone || { echo 'Encrypted archive not mounted'; exit 3; }
completed=$(python3 - <<'PY'
import json
s=json.load(open('/opt/fuckball-training/status.json'))
assert isinstance(s.get('cycles'),int) and s['cycles']>=0
print(s['cycles'])
PY
)
[[ "$completed" =~ ^[0-9]+$ ]] || exit 4
for dir in "$ROOT"/cycle-[0-9][0-9][0-9][0-9][0-9]; do
  [[ -d "$dir" && ! -L "$dir" ]] || continue
  base=${dir##*/}
  idx=$((10#${base#cycle-}))
  ((idx < completed)) || continue
  # Do not archive an incomplete cycle or anything newer than retained checkpoint.
  [[ -f "$ROOT/cycle-${idx}-report.json" ]] || continue
  updated=$(python3 - <<'PY'
import json
s=json.load(open('/opt/fuckball-training/status.json'))
print(s.get('activeCycle',0))
PY
)
  if [[ "$updated" =~ ^[0-9]+$ ]] && (( idx >= updated )); then continue; fi
  free_kib=$(df -Pk "$ROOT" | awk 'NR==2 {print $4}')
  if ((free_kib < 300000)); then echo 'Too little local scratch, refusing to create tar'; exit 5; fi
  mkdir -p "$SPOOL"
  tmp="$SPOOL/${base}.tar"
  echo "$(date -Is) archiving completed ${base}"
  # One remote tar per completed cycle avoids uploading hundreds of tiny individual files.
  tar -C "$ROOT" -cf "$tmp" "$base"
  local_hash=$(sha256sum "$tmp" | cut -d' ' -f1)
  target="$REMOTE/${base}-${local_hash:0:16}.tar"
  "$RCLONE" copyto "$tmp" "$target" --transfers 1 --checkers 1 --retries 6 --low-level-retries 4 --contimeout 15s --timeout 120s
  # Read back the uploaded contents and compare full SHA256, not just listing/size.
  remote_hash=$("$RCLONE" cat "$target" --retries 6 --low-level-retries 4 --contimeout 15s --timeout 120s | sha256sum | cut -d' ' -f1)
  if [[ "$local_hash" != "$remote_hash" ]]; then
     echo "HASH MISMATCH for $base; preserving local"; exit 6
  fi
  # Confirm trainer did not switch to this cycle before local removal.
  active=$(python3 - <<'PY'
import json
s=json.load(open('/opt/fuckball-training/status.json'))
print(s.get('activeCycle',0))
PY
)
  [[ "$active" =~ ^[0-9]+$ ]] && ((idx < active)) || { echo 'Active cycle safety lock; preserving local'; exit 7; }
  echo "$(date -Is) verified remote copy SHA256=$local_hash; removing only completed local ${base}"
  rm -rf --one-file-system -- "$dir"
  rm -f -- "$tmp"
  printf '%s\t%s\t%s\t%s\n' "$(date -Is)" "$base" "$target" "$local_hash" >> "$ROOT/archived-cycles.tsv"
done
echo "$(date -Is) archive scan finished"
df -h "$ROOT" | tail -1
