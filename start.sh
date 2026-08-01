#!/usr/bin/env bash
#
# Falcon AI - start.sh
#
# 1. Verifies project dependencies (.env, node_modules).
# 2. Checks MongoDB and Redis; starts them (Homebrew services preferred,
#    direct binary fallback) if they are not running.
# 3. Waits until both are reachable, then starts Falcon AI.
#
# Usage:
#   ./start.sh            # runs in dev mode (node --watch)
#   ./start.sh start      # runs npm start (no file watching)
#   ./start.sh worker     # runs only the worker process
#   ./start.sh check      # only check/start dependencies, do not run the app
#

set -uo pipefail

cd "$(dirname "$0")"

# ---- colors -------------------------------------------------------
if [ -t 1 ]; then
  C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'; C_CYAN=$'\033[36m'; C_RESET=$'\033[0m'
else
  C_GREEN=""; C_YELLOW=""; C_RED=""; C_CYAN=""; C_RESET=""
fi

log()  { echo "${C_CYAN}[start]${C_RESET} $*"; }
ok()   { echo "${C_GREEN}[ok]${C_RESET} $*"; }
warn() { echo "${C_YELLOW}[warn]${C_RESET} $*"; }
die()  { echo "${C_RED}[error]${C_RESET} $*" >&2; exit 1; }

have() { command -v "$1" >/dev/null 2>&1; }

# ---- helpers -------------------------------------------------------
mongo_up() {
  if have mongosh; then
    mongosh --quiet --norc --eval 'quit(db.runCommand({ping:1}).ok ? 0 : 1)' >/dev/null 2>&1
  elif have mongo; then
    mongo --quiet --norc --eval 'quit(db.runCommand({ping:1}).ok ? 0 : 1)' >/dev/null 2>&1
  else
    nc -z 127.0.0.1 27017 >/dev/null 2>&1
  fi
}

redis_up() {
  if have redis-cli; then
    redis-cli ping 2>/dev/null | grep -q "PONG"
  else
    nc -z 127.0.0.1 6379 >/dev/null 2>&1
  fi
}

wait_for() {
  local name="$1" check_fn="$2" seconds="${3:-30}"
  local i
  for ((i = 0; i < seconds; i++)); do
    if $check_fn; then
      ok "$name is up."
      return 0
    fi
    sleep 1
  done
  warn "$name did not become reachable within ${seconds}s."
  return 1
}

# ---- 1. project dependencies ----------------------------------------
if [ ! -f .env ]; then
  warn "No .env found. Creating it from .env.example..."
  cp .env.example .env
  die "Created .env from template. Open it and fill in your real credentials, then re-run ./start.sh"
fi
ok ".env present."

if [ ! -d node_modules ]; then
  log "node_modules missing. Installing dependencies..."
  npm install || die "npm install failed."
else
  ok "node_modules present."
fi

# ---- 2. MongoDB ------------------------------------------------------
if mongo_up; then
  ok "MongoDB already running."
else
  log "MongoDB not running. Starting it..."
  if have brew; then
    local_formula=""
    for f in mongodb-community mongodb-community@8.0 mongodb-community@7.0 mongodb; do
      if brew list --versions "$f" >/dev/null 2>&1; then local_formula="$f"; break; fi
    done
    if [ -n "$local_formula" ]; then
      if ! brew services start "$local_formula" >/dev/null 2>&1; then
        # Homebrew refuses to manage formulae from an untrusted tap.
        # The formula is installed from the user's own mongodb/brew tap, so trust it and retry.
        warn "brew services failed (untrusted tap). Trusting mongodb/brew and retrying..."
        brew trust mongodb/brew >/dev/null 2>&1 || brew trust "$local_formula" >/dev/null 2>&1 || true
        brew services start "$local_formula" >/dev/null 2>&1 || warn "brew services start $local_formula failed."
      fi
    else
      warn "MongoDB formula not found via brew."
    fi
  fi
  if ! mongo_up && have mongod; then
    log "Falling back to direct mongod..."
    mkdir -p .data/mongo
    nohup mongod --dbpath .data/mongo --port 27017 >/tmp/falcon-mongod.log 2>&1 &
    disown || true
  fi
  wait_for "MongoDB" mongo_up 40 || die "MongoDB is not reachable on 127.0.0.1:27017."
fi

# ---- 3. Redis ---------------------------------------------------------
if redis_up; then
  ok "Redis already running."
else
  log "Redis not running. Starting it..."
  if have brew; then
    brew services start redis || warn "brew services start redis failed."
  fi
  if ! redis_up && have redis-server; then
    log "Falling back to direct redis-server..."
    nohup redis-server --daemonize yes >/tmp/falcon-redis.log 2>&1 || true
  fi
  wait_for "Redis" redis_up 30 || die "Redis is not reachable on 127.0.0.1:6379."
fi

# ---- 4. start the app --------------------------------------------------
MODE="${1:-dev}"
case "$MODE" in
  check)
    ok "Dependencies ready. Not starting the app (check mode)."
    ;;
  start)
    log "Starting Falcon AI (npm start)..."
    exec npm start
    ;;
  worker)
    log "Starting Falcon AI worker process..."
    exec npm run worker
    ;;
  dev|*)
    log "Starting Falcon AI (dev, file watching)..."
    exec npm run dev
    ;;
esac
