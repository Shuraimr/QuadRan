{
  # rubyyard development environment (Nix flake).
  #
  # Why: so the tools needed to run the project (Node 22, MySQL client, ffmpeg...) do not vary
  # from machine to machine; both you and Claude work with the same tools.
  # It does not touch the system Node/Docker: it only applies inside the shell opened with `nix develop`.
  #
  # Usage:
  #   nix develop            -> shell with the tools (if you use fish: nix develop -c fish)
  #   nix develop -c npm run dev
  #   ./araclar/konsol.sh    -> zellij with server + mycli + MySQL log + shell
  # If direnv is installed it activates automatically when you enter the folder (.envrc -> "use flake").
  #
  # The database stays in Docker (container rubyyard-db): moving MySQL to Nix would gain nothing
  # and could break the existing data and the docker-compose setup.
  #
  # rubyyard geliştirme ortamı (Nix flake).
  #
  # Neden: projeyi çalıştırmak için gereken araçların (Node 22, MySQL istemcisi, ffmpeg...) sürümü
  # bilgisayardan bilgisayara değişmesin; hem sen hem Claude aynı araçlarla çalışsın.
  # Sistemdeki Node/Docker'a dokunmaz: yalnızca `nix develop` ile açılan kabukta geçerlidir.
  #
  # Kullanım:
  #   nix develop            → araçları içeren kabuk (fish kullanıyorsan: nix develop -c fish)
  #   nix develop -c npm run dev
  #   ./araclar/konsol.sh    → zellij içinde sunucu + mycli + MySQL günlüğü + kabuk
  # direnv kuruluysa klasöre girince kendiliğinden açılır (.envrc → "use flake").
  #
  # Veritabanı Docker'da kalır (konteyner rubyyard-db): MySQL'i Nix'e taşımak, mevcut veriyi ve
  # docker-compose kurulumunu bozmadan bir şey kazandırmaz.
  description = "rubyyard forum geliştirme ortamı";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      # The same shell for Linux and macOS (Intel/Apple)
      # Linux ve macOS (Intel/Apple) için aynı kabuk
      sistemler = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      herSistem = f: nixpkgs.lib.genAttrs sistemler (sistem: f nixpkgs.legacyPackages.${sistem});
    in
    {
      devShells = herSistem (pkgs: {
        default = pkgs.mkShell {
          packages = with pkgs; [
            # the project relies on Node 22's TypeScript type stripping (no build step)
            # proje Node 22'nin TypeScript tip silme özelliğine dayanıyor (derleme adımı yok)
            nodejs_22
            # client only: to connect to the DB in Docker with `mysql -h 127.0.0.1`
            # yalnızca istemci için: `mysql -h 127.0.0.1` ile Docker'daki DB'ye bağlanmak
            mysql84
            # for video attachment experiments: generating sample videos, inspecting codec/duration (ffprobe)
            # video eki denemeleri: örnek video üretmek, kodek/süre bilgisine bakmak (ffprobe)
            ffmpeg-headless
            # colorful MySQL client with autocompletion (DB pane in the zellij layout)
            # MySQL için renkli, otomatik tamamlamalı istemci (zellij düzeninde DB paneli)
            mycli
            # terminal multiplexer: server, DB and logs in a single window (araclar/konsol.sh)
            # terminal çoklayıcı: sunucu, DB ve günlükler tek pencerede (araclar/konsol.sh)
            zellij
            # GitHub releases (gh release create)
            # GitHub sürümleri (gh release create)
            gh
            # reading JSON responses (route experiments with curl)
            # JSON yanıtlarını okumak (curl ile rota denemeleri)
            jq
            curl
            git
          ];

          shellHook = ''
            # Commands installed by npm (tsc etc.) work without npx too
            # npm ile kurulan komutlar (tsc vb.) npx'siz de çalışsın
            export PATH="$PWD/node_modules/.bin:$PATH"
            echo "rubyyard geliştirme kabuğu: node $(node --version), ffmpeg ve mysql istemcisi hazır."
            if command -v docker >/dev/null 2>&1 && ! docker ps --format '{{.Names}}' 2>/dev/null | grep -qx rubyyard-db; then
              echo "Not: rubyyard-db konteyneri çalışmıyor (docker compose up -d)."
            fi
          '';
        };
      });
    };
}
