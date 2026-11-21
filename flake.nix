{
  # QuadRan geliştirme ortamı (Nix flake).
  #
  # Neden: projeyi çalıştırmak için gereken araçların (Node 22, MySQL istemcisi, ffmpeg...) sürümü
  # bilgisayardan bilgisayara değişmesin; hem sen hem Claude aynı araçlarla çalışsın.
  # Sistemdeki Node/Docker'a dokunmaz: yalnızca `nix develop` ile açılan kabukta geçerlidir.
  #
  # Kullanım:
  #   nix develop            → araçları içeren kabuk (fish kullanıyorsan: nix develop -c fish)
  #   nix develop -c npm run dev
  # direnv kuruluysa klasöre girince kendiliğinden açılır (.envrc → "use flake").
  #
  # Veritabanı Docker'da kalır (konteyner quadran-db): MySQL'i Nix'e taşımak, mevcut veriyi ve
  # docker-compose kurulumunu bozmadan bir şey kazandırmaz.
  description = "QuadRan forum geliştirme ortamı";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      # Linux ve macOS (Intel/Apple) için aynı kabuk
      sistemler = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      herSistem = f: nixpkgs.lib.genAttrs sistemler (sistem: f nixpkgs.legacyPackages.${sistem});
    in
    {
      devShells = herSistem (pkgs: {
        default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_22        # proje Node 22'nin TypeScript tip silme özelliğine dayanıyor (derleme adımı yok)
            mysql84          # yalnızca istemci için: `mysql -h 127.0.0.1` ile Docker'daki DB'ye bağlanmak
            ffmpeg-headless  # video eki denemeleri: örnek video üretmek, kodek/süre bilgisine bakmak (ffprobe)
            gh               # GitHub sürümleri (gh release create)
            jq               # JSON yanıtlarını okumak (curl ile rota denemeleri)
            curl
            git
          ];

          shellHook = ''
            # npm ile kurulan komutlar (tsc vb.) npx'siz de çalışsın
            export PATH="$PWD/node_modules/.bin:$PATH"
            echo "QuadRan geliştirme kabuğu: node $(node --version), ffmpeg ve mysql istemcisi hazır."
            if command -v docker >/dev/null 2>&1 && ! docker ps --format '{{.Names}}' 2>/dev/null | grep -qx quadran-db; then
              echo "Not: quadran-db konteyneri çalışmıyor (docker compose up -d)."
            fi
          '';
        };
      });
    };
}
