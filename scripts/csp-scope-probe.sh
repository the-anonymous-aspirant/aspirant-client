#!/bin/sh
# Probe which responses carry the SPA's Content-Security-Policy-Report-Only
# header (system_3 #9132). The header must follow the LOCATION nginx serves a
# request from, not the spelling of its URI: nginx decodes %2f and resolves
# `..` and `//` before it picks a location, so a raw-URI rule can be stripped
# by /admin/penpot/..%2f..%2flogin (served by the SPA) or wrongly applied by
# //admin/penpot/ (served by Penpot). Each path is sent unnormalised
# (curl --path-as-is) and checked for the header; the enforcing
# Content-Security-Policy must be present on every response.
#
# usage:
#   scripts/csp-scope-probe.sh <base-url>   probe a running site
#   scripts/csp-scope-probe.sh --docker     serve ./dist with ./default.conf in
#                                           nginx:alpine on a loopback port and
#                                           probe that (build first)
#
# Under --docker there are no upstreams, so the probe runs a copy of the
# config with two test-only edits: the admin auth gate answers 204, and the
# resolver points at a closed local port so each proxied app fails fast with a
# real 502 (which carries the server's headers) instead of hanging on DNS.
# Location matching, the $csp_surface map and every add_header are untouched.
set -eu

fail=0
if [ "${1:-}" = "--docker" ]; then
  [ -f dist/index.html ] || { echo "csp-scope-probe: no dist/index.html; build first" >&2; exit 2; }
  tmp=$(mktemp -d)
  name="csp-scope-probe-$$"
  trap 'docker rm -f "$name" >/dev/null 2>&1 || true; rm -rf "$tmp"' EXIT
  awk '
    /resolver 127\.0\.0\.11/ { print "  resolver 127.0.0.1:1 valid=10s ipv6=off; resolver_timeout 1s;"; next }
    /location = \/_internal\/verify-admin \{/ { print; print "    internal;"; print "    return 204;"; skip = 1; next }
    skip && /^  \}/ { skip = 0 }
    skip { next }
    { print }
  ' default.conf > "$tmp/default.conf"
  grep -q 'return 204;' "$tmp/default.conf" || { echo "csp-scope-probe: could not stub the auth gate" >&2; exit 2; }
  docker run -d --rm --name "$name" -p 127.0.0.1::80 \
    -v "$tmp/default.conf:/etc/nginx/conf.d/default.conf:ro" \
    -v "$PWD/dist:/usr/share/nginx/html:ro" \
    nginx:alpine >/dev/null
  base="http://$(docker port "$name" 80/tcp | head -n 1)"
  i=0; until curl -s -o /dev/null "$base/" || [ $i -ge 20 ]; do i=$((i + 1)); sleep 0.5; done
else
  base="${1:?usage: csp-scope-probe.sh <base-url> | --docker}"
fi

check() { # check <path> <report-only: present|absent>
  h=$(curl -s --path-as-is -o /dev/null -D - --max-redirs 0 --max-time 10 "$base$1" | tr -d '\r' || true)
  ro=absent; echo "$h" | grep -qi '^content-security-policy-report-only:' && ro=present
  en=absent; echo "$h" | grep -qi '^content-security-policy:' && en=present
  status=$(echo "$h" | grep -E '^HTTP/' | tail -n 1 | awk '{print $2}')
  verdict=ok
  if [ -z "$status" ] || [ "$ro" != "$2" ] || [ "$en" != present ]; then verdict=FAIL; fail=1; fi
  printf '%-4s %-44s %-4s report-only=%-7s enforcing=%-7s (want report-only=%s)\n' \
    "$verdict" "$1" "${status:-none}" "$ro" "$en" "$2"
}

# The SPA and its static pages: the policy applies.
check / present
check /login present
check /admin present
check /constellations-rulebook.html present
check /remarkable/calendar.html present
check /others/vinoly/2026_bday_invitation present
# Spellings nginx normalises INTO the SPA: the policy must still apply.
check '/admin/penpot/..%2f..%2flogin' present
check '/admin/histoire/..%2flogin' present
check '/admin/explorer/..%2f..%2flogin' present
check '/admin/apps/system_3/..%2f..%2f..%2flogin' present
check '/browser-flows/..%2flogin' present
# The proxied apps, canonical and with a doubled slash: no SPA policy.
check /admin/penpot/ absent
check //admin/penpot/ absent
check /admin/histoire/ absent
check /admin/explorer/ absent
check /admin/apps/system_3/ absent
check /browser-flows/ absent
check //browser-flows/ absent

if [ "${1:-}" = "--docker" ]; then
  # The unnormalised spellings must have reached nginx as sent.
  log=$(docker logs "$name" 2>&1 || true)
  for p in '/admin/penpot/..%2f..%2flogin' '//admin/penpot/'; do
    echo "$log" | grep -qF "\"GET $p " || { echo "FAIL $p did not reach nginx as sent"; fail=1; }
  done
fi

if [ "$fail" = 0 ]; then echo "csp-scope-probe: OK"; else echo "csp-scope-probe: FAILED"; exit 1; fi
