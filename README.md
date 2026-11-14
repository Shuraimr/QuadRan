# QuadRan

> 🚧 **Geliştirme aşamasında.** Özellikler ve veritabanı yapısı değişebilir.

Çok amaçlı bir forum sitesi. Kullanıcılar kategorilere ayrılmış konular açabilir, cevap yazabilir, rozet ve rütbe kazanabilir, birbirlerine özel mesaj gönderebilir.

**Teknolojiler:** MySQL 8.4 · Node.js · Express · TypeScript · EJS

## Veritabanı yapısı

| Tablo | Açıklama |
|---|---|
| `roles` | Kullanıcı rolleri (admin, moderatör, üye) |
| `ranks` | Puana göre rütbeler (Çaylak, Müdavim, Usta, Efsane) |
| `users` | Kullanıcı bilgileri, puan ve rol |
| `categories` | Forum kategorileri |
| `topics` | Konular (bir kategoriye ve kullanıcıya ait) |
| `posts` | Konulara yazılan mesajlar |
| `badges` | Kazanılabilir rozetler |
| `user_badges` | Hangi kullanıcının hangi rozeti kazandığı |
| `chat_messages` | Genel sohbet mesajları |
| `messages` | Kullanıcılar arası özel mesajlar |

**Öne çıkan ilişkiler:**
- Kullanıcı ↔ rozet ilişkisi **N:N**, `user_badges` ara tablosuyla kuruluyor.
- Özel mesajda gönderen ve alıcının ikisi de `users` tablosuna bağlı.
- Bir konu kalıcı olarak silinirse ona bağlı mesajlar da silinir (`ON DELETE CASCADE`).
- Rütbe ayrıca saklanmıyor, kullanıcının puanından hesaplanıyor.
- Kullanıcı, konu ve mesajlarda **soft delete** kullanılıyor (`deleted_at`).

## Kurulum

Gereksinimler: Docker (Compose ile) ve Node.js 22.18+

Şuanda Beta Aşamasında Hazır Değil

```sh
git clone https://github.com/Shuraimr/QuadRan.git
cd QuadRan
cp .env.example .env   # .env içindeki şifreleri doldur
docker compose up -d
npm install
npm run dev
```

- Site: http://localhost:3000
- Adminer (veritabanı paneli): http://localhost:8080
