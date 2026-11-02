#!/bin/sh
# Probe the request-body caps on the explorer API (system_3 #4121-B2, #9602).
# The upload relay location takes a 32 MiB part; the rest of the explorer API,
# and everything else, keeps the server's 25m. A body over its location's cap
# gets 413 before nginx proxies anything; one within it is forwarded.
#
# usage:
#   scripts/upload-cap-probe.sh <base-url>   probe a running site (an admin
#                                            session is needed past the gate)
#   scripts/upload-cap-probe.sh --docker     run ./default.conf in nginx:alpine
#                                            on a loopback port and probe that
#
# Under --docker there are no upstreams. As in csp-scope-probe.sh, the copy of
# the config gets two test-only edits: the admin auth gate answers 204, and the
# resolver points at a closed local port, so a request nginx forwards fails
# fast with a real 502 instead of hanging on DNS. Location matching and every
# client_max_body_size are untouched. A forwarded request then answers 502 (the
# upstream cannot be resolved), and only 502 counts as "through": a 500 here
# was the admin gate's own 25m cap rejecting the body inside its subrequest
# (system_3 #9602), and reading any non-413 as success hid it.
set -eu

fail=0

# Static pin (security review, system_3 #9602 c59329): the uploads location
# streams parts and never spools them to the container's unencrypted disk.
# Read from the block itself, so a later edit that drops a line fails here.
block=$(awk '/^  location \/admin\/explorer\/api\/uploads\/ \{/ { on = 1 } on { print } on && /^  \}/ { exit }' default.conf)
for d in 'proxy_request_buffering off;' 'proxy_http_version 1.1;' 'client_max_body_size 40m;'; do
  if printf '%s\n' "$block" | grep -q "^ *$d"; then echo "ok   uploads location: $d"
  else echo "FAIL uploads location lacks: $d"; fail=1; fi
done

tmp=$(mktemp -d)
name="upload-cap-probe-$$"
if [ "${1:-}" = "--docker" ]; then
  trap 'docker rm -f "$name" >/dev/null 2>&1 || true; rm -rf "$tmp"' EXIT
  awk '
    /resolver 127\.0\.0\.11/ { print "  resolver 127.0.0.1:1 valid=10s ipv6=off; resolver_timeout 1s;"; next }
    /location = \/_internal\/verify-admin \{/ { print; print "    internal;"; print "    return 204;"; skip = 1; next }
    skip && /^  \}/ { skip = 0 }
    # Keep the gate'"'"'s own body cap: it is part of what this probe tests.
    skip && /client_max_body_size/ { print; next }
    skip { next }
    { print }
  ' default.conf > "$tmp/default.conf"
  grep -q 'return 204;' "$tmp/default.conf" || { echo "upload-cap-probe: could not stub the auth gate" >&2; exit 2; }
  docker run --rm -v "$tmp/default.conf:/etc/nginx/conf.d/default.conf:ro" nginx:alpine nginx -t 2>&1 |
    grep -q 'test is successful' || { echo "FAIL nginx -t rejects default.conf"; exit 1; }
  echo "ok   nginx -t"
  docker run -d --rm --name "$name" -p 127.0.0.1::80 \
    -v "$tmp/default.conf:/etc/nginx/conf.d/default.conf:ro" nginx:alpine >/dev/null
  base="http://$(docker port "$name" 80/tcp | head -n 1)"
  i=0; until curl -s -o /dev/null "$base/" || [ $i -ge 20 ]; do i=$((i + 1)); sleep 0.5; done
else
  trap 'rm -rf "$tmp"' EXIT
  base="${1:?usage: upload-cap-probe.sh <base-url> | --docker}"
fi

docker_mode=no; [ "${1:-}" = "--docker" ] && docker_mode=yes

check() { # check <path> <MiB> <want: 413|through>
  f="$tmp/body-$2"
  [ -f "$f" ] || head -c "$(($2 * 1024 * 1024))" /dev/zero > "$f"
  status=$(curl -s -o /dev/null -w '%{http_code}' --max-time 60 -X PUT -T "$f" "$base$1" || true)
  # Through: under --docker the forwarded request's 502; against a live site,
  # any answer that is neither a refusal (413) nor a server error (5xx).
  case "$status" in
    413) got=413 ;;
    502) if [ "$docker_mode" = yes ]; then got=through; else got=5xx; fi ;;
    5*|000|'') got=$status ;;
    *) if [ "$docker_mode" = yes ]; then got=$status; else got=through; fi ;;
  esac
  verdict=ok; if [ -z "$status" ] || [ "$status" = 000 ] || [ "$got" != "$3" ]; then verdict=FAIL; fail=1; fi
  printf '%-4s %-40s %3s MiB -> %s (want %s)\n' "$verdict" "$1" "$2" "${status:-none}" "$3"
}

# The upload relay: a 32 MiB part plus overhead goes through, a 41 MiB body does not.
check /admin/explorer/api/uploads/part 33 through
check /admin/explorer/api/uploads/part 41 413
# The rest of the explorer API keeps 25m.
check /admin/explorer/api/health 26 413
check /admin/explorer/api/health 24 through
# Penpot's location allows 100m behind the same admin gate.
check /admin/penpot/api/upload 30 through

# Behavioural half, under --docker: with buffering on, nginx writes the whole
# part to client_temp before it even resolves the upstream, and logs it. With
# buffering off it must not. (The health request above still buffers: that
# location is not the upload path, and its log line is the positive control.)
if [ "$docker_mode" = yes ]; then
  log=$(docker logs "$name" 2>&1 || true)
  if echo "$log" | grep -q 'buffered to a temporary file.*PUT /admin/explorer/api/uploads/'; then
    echo "FAIL uploads part was spooled to a temp file"; fail=1
  else echo "ok   uploads part not spooled to a temp file"; fi
  if echo "$log" | grep -q 'buffered to a temporary file.*PUT /admin/explorer/api/health'; then
    echo "ok   control: a buffered location's body is spooled (the log check can see it)"
  else echo "FAIL control: no spool logged for the buffered health request"; fail=1; fi
fi

if [ "$fail" = 0 ]; then echo "upload-cap-probe: OK"; else echo "upload-cap-probe: FAILED"; exit 1; fi
