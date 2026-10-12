#!/bin/sh
# Installs a pre-commit hook that runs the balance check when rules files are staged.
set -e
root=$(git rev-parse --show-toplevel); hook="$(git rev-parse --git-path hooks)/pre-commit"
cat > "$hook" <<'H'
#!/bin/sh
if git diff --cached --name-only | grep -qE '^(play/rules\.js|sim/zones(-core)?\.(mjs|js)|sim/text_sim\.mjs|text/gather\.js|sim/balance_check\.mjs|sim/game_sim\.mjs|scripts/install-hooks\.sh|text/text\.js|sim/replay_guard\.mjs|sim/replay-fixtures\.json)$'; then
  echo "Rules changed: running balance check (~1 min)..."
  node "$(git rev-parse --show-toplevel)/sim/balance_check.mjs" || { echo "Balance check failed; commit aborted (bypass: git commit --no-verify)"; exit 1; }
fi
H
chmod +x "$hook"; echo "Installed $hook"
