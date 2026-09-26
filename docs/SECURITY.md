# KENT360 – Güvenlik

Durum: ✅ uygulandı · 🗓 planlandı (faz)

## 1. Tehdit Modeli (özet)

| Varlık                  | Tehdit                              | Önlem                                                        |
| ----------------------- | ----------------------------------- | ------------------------------------------------------------ |
| Kullanıcı hesapları     | Kaba kuvvet, credential stuffing    | Argon2id, login rate limit, hesap kilidi                     |
| Oturumlar               | Token çalınması / yeniden kullanımı | Kısa ömürlü access token, refresh rotation + reuse detection |
| Vatandaş kişisel verisi | Yetkisiz görüntüleme (KVKK)         | İzin bazlı alan filtreleme, veri minimizasyonu               |
| Talep / iş emri         | IDOR, başka belediyenin verisi      | Kiracı kapsamı her sorguda, UUIDv7 ID'ler                    |
| Dosya yükleme           | Zararlı dosya, path traversal       | MIME + uzantı + magic byte kontrolü, sunucu üretimli key     |
| Denetim izi             | Kayıt silme/değiştirme              | DB trigger ile append-only                                   |
| Altyapı                 | Secret sızıntısı                    | `.env` git dışında, loglarda redaksiyon                      |

## 2. Kimlik Doğrulama (Phase 3) 🗓

- **Parola:** Argon2id (`argon2` paketi, OWASP önerilen parametreler: m=19 MiB, t=2, p=1). Minimum 10 karakter.
- **Access token:** JWT, 15 dk, `sub`, `mid` (municipalityId), `roles`; imza `JWT_SECRET` (≥32 karakter, env şemasıyla zorunlu ✅).
- **Refresh token:** 7 gün, opak rastgele değer (256 bit); DB'de yalnızca SHA-256 hash (`refresh_tokens.token_hash`).
- **Rotation:** Her `/auth/refresh` eski token'ı iptal eder ve aynı `family_id` ile yenisini verir.
- **Reuse detection:** Daha önce döndürülmüş bir token tekrar gelirse **bütün aile** iptal edilir (token çalınmış kabul edilir) ve audit log yazılır.
- **Web'de saklama:** access token yalnızca bellekte; refresh token `httpOnly; Secure; SameSite=Strict; Path=/api/v1/auth` cookie. localStorage'da token tutulmaz.
- **Mobilde saklama:** Expo SecureStore (Keychain / Keystore).
- **Hesap kilidi:** 10 ardışık başarısız girişte 15 dk (`failed_login_count`, `locked_until`). Hata mesajı hesap varlığını ele vermez ("E-posta veya şifre hatalı.").

## 3. Yetkilendirme (RBAC + izin) 🗓

- Roller izin kümeleridir; kontrol her zaman **izin** üzerinden yapılır (`@RequirePermissions('workOrders.assign')`), rol adı üzerinden değil. Varsayılan eşleme: `packages/shared-types/src/permissions.ts` ✅.
- **Kiracı izolasyonu:** Her sorgu JWT'deki `municipalityId` ile kapsanır; başka belediyenin kaydı 404 döner (varlığı sızdırılmaz).
- **Satır bazlı kurallar** (servis katmanında):
  - Vatandaş yalnızca kendi taleplerini görür (`requests.readOwn`).
  - Saha personeli yalnızca kendisine/ekibine atanmış iş emirlerini görür (`workOrders.readAssigned`).
  - Müdürlük yöneticisi kendi müdürlüğüyle sınırlıdır (System Admin hariç).
- Frontend yalnızca gizler; **yetki kararı her zaman backend'dedir.**

## 4. HTTP Güvenliği ✅

- **Helmet:** CSP, HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` vb.
- **CORS:** `CORS_ORIGINS` beyaz listesi; `credentials: true` yalnızca bu origin'ler için.
- **Doğrulama:** Global `ValidationPipe` — `whitelist` + `forbidNonWhitelisted` (beklenmeyen alan → 400; mass-assignment engellenir).
- **Rate limit:** Global 120/dk/IP ✅; hassas uçlar için özel limitler 🗓 ([API_DESIGN.md](API_DESIGN.md#6-rate-limit)). Çoklu instance'ta Redis storage'a geçilir.
- **Web başlıkları:** Next.js `X-Frame-Options: DENY`, `Permissions-Policy` (kamera/konum yalnızca kendi origin), `poweredByHeader: false` ✅.

## 5. Dosya Yükleme (Phase 5–6) 🗓

- İzinli türler: **JPEG, PNG, WEBP**. Üç katmanlı kontrol: `Content-Type`, uzantı ve dosyanın **magic byte** imzası (istemcinin beyanına güvenilmez).
- Boyut sınırı: 8 MB/dosya, talep başına 5 fotoğraf.
- Object key sunucuda üretilir (`{municipalityId}/requests/{yyyy}/{mm}/{uuidv7}.{ext}`); istemci dosya adı hiçbir yerde kullanılmaz → path traversal imkânsız.
- EXIF temizliği: konum dışındaki meta veriler silinir (cihaz seri no vb.).
- Bucket private; erişim 5–15 dk ömürlü presigned URL ile.

## 6. Veritabanı ✅

- Prisma parametreli sorgular; raw SQL yalnızca tagged template `$queryRaw\`…\``ile.`$queryRawUnsafe`/`$executeRawUnsafe` **yasak** (code review kuralı).
- Audit log DB seviyesinde append-only (UPDATE/DELETE/TRUNCATE trigger ile reddedilir).
- CHECK kısıtları ile veri bütünlüğü (koordinat, skor, güven aralıkları).
- Uygulama kullanıcısı production'da tablo sahibi olmayan ayrı bir rol olmalıdır (DDL yetkisi yalnızca migration rolünde).

## 7. Loglama ✅

- Structured JSON log (pino), her istekte `x-request-id`.
- Redakte edilen alanlar: `authorization`, `cookie`, `set-cookie`, `password`, `passwordHash`, `refreshToken`, `accessToken`.
- Access log yalnızca `id, method, url, statusCode, responseTime` içerir; header ve body loglanmaz.
- 5xx yanıtlarında istemciye iç hata ayrıntısı dönmez; ayrıntı yalnızca sunucu logunda.
- Health endpoint'leri access log'a yazılmaz (gürültü).

## 8. Audit Edilen İşlemler 🗓 (Phase 3+)

Başarısız login (eşik aşımı), kullanıcı oluşturma/güncelleme, rol değişikliği, rol-izin değişikliği, talep durum/müdürlük/öncelik değişikliği, iş emri atama/tamamlama/doğrulama/iptal, sistem ve belediye ayarı değişikliği, refresh token reuse tespiti.

Her kayıt: aktör, işlem, varlık türü/ID, önce/sonra (beyaz listeli alanlar), IP, user-agent, zaman.

## 9. KVKK

- **Minimizasyon:** yalnızca hizmet için gerekli veri toplanır; T.C. kimlik no, adres (konum dışında) istenmez.
- **Amaçla sınırlılık:** vatandaş iletişim bilgisi yalnızca `users.read` izni olan personele gösterilir; saha personeli yalnızca konum ve talep içeriğini görür.
- **AI sağlayıcısına** kişisel veri gönderilmez; `raw_response` temizlenerek saklanır.
- **Saklama:** kapatılan taleplerin fotoğrafları için belediye bazlı saklama süresi (`settings.mediaRetentionDays`) 🗓.

## 10. Secret Yönetimi ✅

- `.env` git'e girmez (`.gitignore`); `.env.example` yalnızca development değerleri içerir.
- Production'da örnek JWT secret ile süreç **başlamaz** (env doğrulaması).
- Seed parolaları yalnızca development içindir ve README'de belirtilir.

## 11. Güvenlik Açığı Bildirimi

Bir güvenlik açığı bulursanız lütfen public issue açmayın; proje sahibine doğrudan e-posta ile bildirin.
