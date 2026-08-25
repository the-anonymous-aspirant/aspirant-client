#!/usr/bin/env bash
# Guard against a committed node_modules — the #191/#4288 main-breaker class.
#
# PR #191 committed `node_modules` as a self-referential symlink (mode 120000 ->
# /home/aspirant/aspirant-client/node_modules). It slipped past `.gitignore`
# (whose `node_modules/` dir-pattern does not match a symlink named
# node_modules) and past review + the branch's own e2e (the symlink resolved to
# a real dir on that branch), then broke every fresh checkout / `npm ci` /
# `vite build` / deploy on main for ~3h. `.gitignore` now anchors
# `/node_modules`; this guard is the enforcing CI backstop.
#
# Fails (exit 1) when the tree tracks:
#   1. any path named `node_modules` or nested under one, and/or
#   2. any symlink (git mode 120000) whose target contains `node_modules`.
# Runnable locally: `npm run guard:node-modules`.
set -euo pipefail

problems=0

# 1. Tracked path named node_modules or nested under a tracked node_modules.
if tracked=$(git ls-files | grep -E '(^|/)node_modules(/|$)'); then
  echo "ERROR: git is tracking node_modules path(s):" >&2
  echo "$tracked" | sed 's/^/  /' >&2
  problems=1
fi

# 2. Tracked symlink (mode 120000) whose target contains node_modules
#    (catches a symlink NOT named node_modules but pointing into one).
while IFS=$'\t' read -r meta path; do
  mode=${meta%% *}
  [ "$mode" = "120000" ] || continue
  sha=$(awk '{print $2}' <<<"$meta")
  target=$(git cat-file blob "$sha" 2>/dev/null || true)
  if [[ "$target" == *node_modules* ]]; then
    echo "ERROR: tracked symlink '$path' -> '$target' targets node_modules" >&2
    problems=1
  fi
done < <(git ls-files -s)

if [ "$problems" -ne 0 ]; then
  echo "node_modules guard FAILED — remove the tracked path(s) and keep /node_modules gitignored." >&2
  exit 1
fi

echo "node_modules guard: OK (no tracked node_modules paths or symlinks)."
