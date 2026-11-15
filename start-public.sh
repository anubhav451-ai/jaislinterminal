#!/usr/bin/env bash
# One command: starts the server AND a free public link (Cloudflare quick tunnel), then prints the link.
# Usage (Termux):  bash start-public.sh        Stop with CTRL+C.
cd "$(dirname "$0")" || exit 1

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "Installing cloudflared (one time)..."
  pkg install -y cloudflared || { echo "Could not install cloudflared."; exit 1; }
fi

if ! grep -Eq '^APP_PASSWORD=.+' .env 2>/dev/null; then
  echo "STOP: a public link needs a password. Open .env (nano .env) and add a line:"
  echo "APP_PASSWORD=your-strong-password"
  exit 1
fi

[ -d client/dist ] || { echo "Build first:  npm run build --prefix client"; exit 1; }

command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock

cleanup() { kill "$SERVER_PID" "$TUNNEL_PID" 2>/dev/null; }
trap cleanup EXIT INT TERM

node server/index.js > server.log 2>&1 &
SERVER_PID=$!
sleep 3
if ! kill -0 "$SERVER_PID" 2>/dev/null; then echo "Server did not start:"; tail -n 20 server.log; exit 1; fi

cloudflared tunnel --no-autoupdate --url http://localhost:8080 > tunnel.log 2>&1 &
TUNNEL_PID=$!

echo "Waiting for the public link..."
URL=""
for _ in $(seq 1 45); do
  URL=$(grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' tunnel.log | head -1)
  [ -n "$URL" ] && break
  sleep 1
done
if [ -z "$URL" ]; then echo "Could not get a link. Last lines of tunnel.log:"; tail -n 20 tunnel.log; exit 1; fi

echo
echo "=============================================="
echo " PUBLIC LINK:  $URL"
echo " Password:     the APP_PASSWORD from .env (user name: anything)"
echo " Keep this window open. CTRL+C stops everything."
echo "=============================================="
echo
tail -n 5 server.log
wait "$SERVER_PID"
