#!/usr/bin/env bash
# QuadRan geliştirme konsolu: nix kabuğunu açar, veritabanı konteynerini başlatır ve zellij'i
# araclar/zellij/quadran.kdl düzeniyle açar (sunucu, mycli, MySQL günlüğü, kabuk tek pencerede).
#
# Kullanım (proje klasöründe ya da herhangi bir yerden):  ./araclar/konsol.sh
# Aynı oturum zaten açıksa yenisini açmak yerine ona bağlanır (zellij attach).
set -euo pipefail

# Betik nereden çağrılırsa çağrılsın proje kökünde çalış (düzen göreli yollar kullanıyor)
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo ".env yok: önce 'cp .env.example .env' ve şifreleri doldur." >&2
  exit 1
fi

# nix develop kabuğu SHELL'i bash'e çevirir; kullanıcının kendi kabuğunu (fish vb.) "Kabuk" paneline taşımak için sakla
export QUADRAN_KABUK="${QUADRAN_KABUK:-${SHELL:-bash}}"

# DB kapalıysa mycli bağlanamaz: konteynerleri arka planda aç (açıksa hiçbir şey yapmaz)
docker compose up -d >/dev/null 2>&1

if nix develop -c zellij list-sessions --short 2>/dev/null | grep -qx quadran; then
  exec nix develop -c zellij attach quadran
fi
# --layout var olan oturuma sekme ekler; yeni oturum için --new-session-with-layout (zellij 0.46)
exec nix develop -c zellij --session quadran --new-session-with-layout araclar/zellij/quadran.kdl
