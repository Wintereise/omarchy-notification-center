#!/usr/bin/env bash
# Run: bash tests/store.test.sh
# Drives bin/notification-store against scratch directories.
set -uo pipefail

here=$(cd "$(dirname "$0")/.." && pwd)
store_bin=$here/bin/notification-store
tmp=$(mktemp -d)
trap 'kill "${watch_pid:-}" 2>/dev/null; rm -rf "$tmp"' EXIT

export NS_SRC_DIR=$tmp/src NS_STORE=$tmp/store
mkdir -p "$NS_SRC_DIR"
live=$NS_SRC_DIR/live.json history=$NS_SRC_DIR/history.json

failed=0
ok() { if eval "$2"; then echo "PASS $1"; else echo "FAIL $1"; failed=$((failed + 1)); fi; }

# Omarchy rewrites each file whole, by atomic rename.
put() { printf '%s\n' "$2" > "$1.tmp" && mv -f "$1.tmp" "$1"; }

now=$(date +%s)
old=$((now - 40 * 86400))
row() { # key ts app summary [extra json]
  jq -cn --arg k "$1" --argjson ts "$2" --arg a "$3" --arg s "$4" --argjson x "${5:-{\}}" \
    '{key: $k, originalId: 0, app: $a, appIcon: "", summary: $s, body: "b", urgency: 1, ts: $ts} + $x'
}
r1=$(row nabc1 "$((now - 2)).5" Slack one '{"closed_ts":1,"closed_reason":"dismissed"}')
r2=$(row n_def2 "$((now - 1)).25" "" two '{"originalId":2,"appIcon":"com.mitchellh.ghostty","urgency":2,"execArgv":"[\"omarchy-cmd-screenshot-edit\",\"/home/u/Pictures/shot one.png\"]"}')
r3=$(row nold3 "$old" Old old '{"closed_ts":1}')
put "$history" "[$r1,$r3,{\"key\":\"../bad\",\"ts\":$now},\"junk\"]"
put "$live" "[$r2]"

out=$("$store_bin" sync)
ok "sync ok" '[[ $(jq -r .ok <<< "$out") == true ]]'
list=$("$store_bin" list)
ok "old entry pruned, junk skipped" '[[ $(jq length <<< "$list") == 2 ]]'
ok "newest first" '[[ $(jq -r ".[0].summary" <<< "$list") == two ]]'
ok "timestamp in ms" '[[ $(jq -r ".[0].timestamp" <<< "$list") == $(( (now - 1) * 1000 + 250 )) ]]'
ok "key with underscore kept" '[[ $(jq -r ".[0].key" <<< "$list") == n_def2 ]]'
ok "picture path kept from execArgv" '[[ $(jq -r ".[0].file" <<< "$list") == "/home/u/Pictures/shot one.png" ]]'
ok "command itself not kept" '[[ $(jq -r ".[0] | has(\"execArgv\")" <<< "$list") == false ]]'
ok "originalId kept" '[[ $(jq -r ".[0].originalId" <<< "$list") == 2 ]]'
ok "live lists on-screen keys" '[[ $("$store_bin" live) == "[\"n_def2\"]" ]]'

# A card moving from live into history must not be archived twice.
put "$live" "[]"
put "$history" "[$(jq -c '. + {closed_ts: 1}' <<< "$r2"),$r1,$r3]"
"$store_bin" sync >/dev/null
ok "no duplicate after move to history" '[[ $("$store_bin" list | jq length) == 2 ]]'
ok "live empty" '[[ $("$store_bin" live) == "[]" ]]'

# Watch picks up the service's atomic rewrites.
"$store_bin" watch > "$tmp/watch.out" &
watch_pid=$!
sleep 1
put "$live" "[$(row nfour4 "$now" Signal four)]"
for _ in 1 2 3 4 5 6 7 8 9 10; do grep -q '"four"' "$tmp/watch.out" && break; sleep 0.3; done
ok "watch emits new entry" 'grep -q "\"summary\":\"four\"" "$tmp/watch.out"'
"$store_bin" seen 777 >/dev/null
for _ in 1 2 3 4 5 6 7 8 9 10; do grep -q '"changed"' "$tmp/watch.out" && break; sleep 0.3; done
ok "watch reports store changes" 'grep -q "\"changed\":true" "$tmp/watch.out"'
kill "$watch_pid" 2>/dev/null; wait "$watch_pid" 2>/dev/null
ok "watch archived it" '[[ $("$store_bin" list | jq length) == 3 ]]'

key=$("$store_bin" list | jq -r '.[0].key')
"$store_bin" remove "$key" >/dev/null
ok "remove" '[[ $("$store_bin" list | jq length) == 2 ]]'
"$store_bin" sync >/dev/null
ok "removed entry stays removed after sync" '[[ $("$store_bin" list | jq length) == 2 ]]'
ok "remove rejects junk key" '! "$store_bin" remove "../x" >/dev/null'

NS_MAX_ITEMS=1 "$store_bin" prune >/dev/null
ok "maxItems keeps newest" '[[ $("$store_bin" list | jq -r ".[0].summary") == two && $("$store_bin" list | jq length) == 1 ]]'

"$store_bin" seen 12345 >/dev/null
ok "seen round-trips" '[[ $("$store_bin" seen | jq .seen) == 12345 ]]'

"$store_bin" clear >/dev/null
ok "clear" '[[ $("$store_bin" list | jq length) == 0 ]]'
"$store_bin" sync >/dev/null
ok "clear survives sync" '[[ $("$store_bin" list | jq length) == 0 ]]'
put "$live" "[]"; put "$history" "[]"
"$store_bin" prune >/dev/null
ok "tombstones dropped once source is gone" '[[ ! -s "$NS_STORE/removed" ]]'

"$store_bin" seed 5 >/dev/null
ok "seed" '[[ $("$store_bin" list | jq length) == 5 ]]'

# A damaged line is skipped, and pruning keeps everything around it.
sed -i '2s/.*/{"key":"broken/' "$NS_STORE/archive.jsonl"
ok "list skips a damaged line" '[[ $("$store_bin" list | jq length) == 4 ]]'
"$store_bin" prune >/dev/null
ok "prune keeps lines after a damaged one" '[[ $(wc -l < "$NS_STORE/archive.jsonl") == 4 ]]'

ok "archive is private" '[[ $(stat -c %a "$NS_STORE") == 700 ]]'

echo
(( failed == 0 )) && echo "all passed" || echo "$failed failed"
exit $(( failed > 0 ))
