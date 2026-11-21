#!/usr/bin/env bash
# rubyyard development console: opens the nix shell, starts the database container and opens zellij
# with the araclar/zellij/rubyyard.kdl layout (server, mycli, MySQL log, shell in a single window).
#
# Usage (from the project folder or anywhere):  ./araclar/konsol.sh
# If the same session is already open, it attaches to it instead of opening a new one (zellij attach).
#
# rubyyard geliştirme konsolu: nix kabuğunu açar, veritabanı konteynerini başlatır ve zellij'i
# araclar/zellij/rubyyard.kdl düzeniyle açar (sunucu, mycli, MySQL günlüğü, kabuk tek pencerede).
#
# Kullanım (proje klasöründe ya da herhangi bir yerden):  ./araclar/konsol.sh
# Aynı oturum zaten açıksa yenisini açmak yerine ona bağlanır (zellij attach).
set -euo pipefail

# Run from the project root no matter where the script is called from (the layout uses relative paths)
# Betik nereden çağrılırsa çağrılsın proje kökünde çalış (düzen göreli yollar kullanıyor)
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo ".env yok: önce 'cp .env.example .env' ve şifreleri doldur." >&2
  exit 1
fi

# `nix develop` switches SHELL to bash; keep the user's own shell (fish etc.) so it can be moved to the "Kabuk" (Shell) pane
# nix develop kabuğu SHELL'i bash'e çevirir; kullanıcının kendi kabuğunu (fish vb.) "Kabuk" paneline taşımak için sakla
export RUBYYARD_KABUK="${RUBYYARD_KABUK:-${SHELL:-bash}}"

# If the DB is down mycli cannot connect: start the containers in the background (does nothing if already running)
# DB kapalıysa mycli bağlanamaz: konteynerleri arka planda aç (açıksa hiçbir şey yapmaz)
docker compose up -d >/dev/null 2>&1

if nix develop -c zellij list-sessions --short 2>/dev/null | grep -qx rubyyard; then
  exec nix develop -c zellij attach rubyyard
fi
# --layout adds a tab to an existing session; for a new session use --new-session-with-layout (zellij 0.46)
# --layout var olan oturuma sekme ekler; yeni oturum için --new-session-with-layout (zellij 0.46)
exec nix develop -c zellij --session rubyyard --new-session-with-layout araclar/zellij/rubyyard.kdl
