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

## 2. Kimlik Doğrulama (Phase 3) ✅

- **Parola:** Argon2id (`argon2` paketi, OWASP önerilen parametreler: m=19 MiB, t=2, p=1). Minimum 10 karakter.
- **Access token:** JWT, 15 dk, `sub`, `mid` (municipalityId), `roles`; imza `JWT_SECRET` (≥32 karakter, env şemasıyla zorunlu ✅).
- **Refresh token:** 7 gün, opak rastgele değer (256 bit); DB'de yalnızca **HMAC-SHA256** hash'i (`refresh_tokens.token_hash`, anahtar: `JWT_REFRESH_SECRET`) – sızan bir tablo tek başına token doğrulamaya/üretmeye yetmez.
- **Rotation:** Her `/auth/refresh` eski token'ı iptal eder ve aynı `family_id` ile yenisini verir.
- **Reuse detection:** Daha önce döndürülmüş bir token tekrar gelirse **bütün aile** iptal edilir (token çalınmış kabul edilir) ve audit log yazılır. Aynı token'la eşzamanlı iki refresh'ten yalnızca biri kazanır (koşullu `UPDATE … WHERE revoked_at IS NULL`); kaybeden reuse sayılır. Web istemcisi bu yüzden refresh'i sekme içinde tek promise'e, sekmeler arasında Web Locks ile sıraya sokar.
- **Anında iptal:** Access token `sid` (oturum ailesi) taşır; `JwtAuthGuard` her istekte kullanıcının aktif olduğunu, kiracının eşleştiğini ve oturumun iptal edilmediğini DB'den kontrol eder. Logout, logout-all, oturum iptali ve kullanıcı pasifleştirme 15 dk beklemeden etkili olur; rol/izin değişiklikleri de bir sonraki istekte geçerlidir.
- **Web'de saklama:** access token yalnızca bellekte; refresh token `httpOnly; Secure; SameSite=Strict; Path=/api/v1/auth` cookie (`Secure` production'da varsayılan, `AUTH_COOKIE_SECURE` ile değiştirilebilir). localStorage'da token tutulmaz. Sayfa yenilenince oturum `/auth/refresh` ile geri yüklenir.
- **Mobilde saklama:** Expo SecureStore (Keychain / Keystore).
- **Hesap kilidi:** 10 ardışık başarısız girişte 15 dk (`failed_login_count`, `locked_until`). Hata mesajı hesap varlığını ele vermez ("E-posta veya şifre hatalı."); bilinmeyen e-postada da sahte bir Argon2 doğrulaması yapılarak yanıt süresi eşitlenir. Kilit ve pasif hesap durumu yalnızca doğru şifreyi bilen kişiye söylenir.

## 3. Yetkilendirme (RBAC + izin) ✅

- Roller izin kümeleridir; kontrol her zaman **izin** üzerinden yapılır (`@Permissions('workOrders.assign')`, `PermissionsGuard`), rol adı üzerinden değil. Varsayılan eşleme: `packages/shared-types/src/permissions.ts` ✅.
- **Kiracı izolasyonu:** Servisler kiracı verisine `prisma.forTenant(municipalityId)` üzerinden erişir; bu Prisma extension'ı kiracıya ait modellerde her filtreye `municipalityId` ekler (istemcinin gönderdiği değeri ezer) ve oluşturulan kayda damgalar. Başka belediyenin kaydı 404 döner (varlığı sızdırılmaz). Sınırlar: ilişkisel (nested) sorgular ve raw SQL otomatik kapsanmaz; `Role` bilinçli olarak elle kapsanır (sistem rolleri paylaşımlı).
- **Sistem Yöneticisi:** belediyenin kendi yöneticisidir – tüm izinler, ama yalnız kendi belediyesinde; müdürlük kısıtından muaftır (`TenantContext.departmentScoped = false`). MVP'de belediyeler arası "süper admin" yoktur.
- **Sistem rolleri** tüm belediyelerde ortaktır ve API'den değiştirilemez; belediyeler kendi rollerini oluşturup izinlerini yönetir. Kullanıcı kendi rolünü ve durumunu değiştiremez.
- **Satır bazlı kurallar** (servis katmanında):
  - Talepler (Phase 5 ✅): sistem yöneticisi belediyenin tümünü, diğer personel kendi müdürlüğünü, herkes kendi bildirdiklerini görür; kapsam dışı → 404 (API_DESIGN §9).
  - Vatandaş yalnızca kendi taleplerini görür (`requests.readOwn`); yanıtlarda personel adları ve iç kullanıcı bilgisi yer almaz.
  - İş emirleri (Phase 6 ✅): yönetici tümünü, müdürlük yöneticisi kendi müdürlüğünü, ekip sorumlusu ve saha personeli kendisine/ekibine atananları görür (`workOrders.readAssigned`); kapsam dışı → 404, filtreler kapsamı genişletemez (API_DESIGN §10).
  - Saha adımları ve fotoğraf yükleme yalnız işi yürüten kişiye (atanan / ekip / ekip sorumlusu); ekip sorumlusu yalnız kendi ekipleri arasında atama yapar; atanabilen kişi aynı belediyeden, aktif ve `workOrders.execute` sahibidir (rastgele kullanıcı / başka belediye / vatandaş ID'si reddedilir).
  - İş emri durumu yalnız durum makinesinden geçer; iyimser eşzamanlılık (`WHERE status = …`) ve istemcinin `from` alanı eşzamanlı / bayat istekleri `409` ile reddeder. Tamamlama açıklaması ve AFTER fotoğrafı olmadan tamamlanamaz; tamamlanmış işin açıklaması ve fotoğrafları sessizce değiştirilemez (DB trigger).
  - Dashboard, harita ve arama (Phase 8–9 ✅) liste uçlarıyla aynı kapsamı kullanır; raw PostGIS sorgularında kapsam `scopeToSql()` ile SQL'e çevrilir – yalnız izinli kolonlar, parametreli değerler, tanınmayan kapsam anahtarında hata (genişletme yerine reddetme). Harita GeoJSON'u açıklama / adres / bildiren taşımaz. Vatandaş ve saha personeli dashboard'a (403), vatandaş haritaya erişemez; saha personeli haritada yalnız kendi/ekibinin iş emirlerini görür.
  - Konum doğrulaması sunucuda (PostGIS) yapılır; `FIELD_LOCATION_BYPASS` yalnız development/test içindir, production'da uygulama başlamaz ve kullanıldığında geçmişe yazılır.
  - Müdürlük yöneticisi kendi müdürlüğüyle sınırlıdır (System Admin hariç).
- Frontend yalnızca gizler; **yetki kararı her zaman backend'dedir.**

## 4. HTTP Güvenliği ✅

- **Helmet:** CSP, HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` vb.
- **CORS:** `CORS_ORIGINS` beyaz listesi; `credentials: true` yalnızca bu origin'ler için.
- **Doğrulama:** Global `ValidationPipe` — `whitelist` + `forbidNonWhitelisted` (beklenmeyen alan → 400; mass-assignment engellenir).
- **Rate limit:** Global 120/dk/IP ✅; hassas uçlar için özel limitler 🗓 ([API_DESIGN.md](API_DESIGN.md#6-rate-limit)). Çoklu instance'ta Redis storage'a geçilir.
- **Web başlıkları:** Next.js `X-Frame-Options: DENY`, `Permissions-Policy` (kamera/konum yalnızca kendi origin), `poweredByHeader: false` ✅.

## 5. Dosya Yükleme (Phase 5 ✅, iş emri kanıtı Phase 6 ✅)

- İzinli türler: **JPEG, PNG, WEBP**. Tür dosyanın **ilk baytlarındaki imzadan** (magic byte) belirlenir; bildirilen `Content-Type` imzayla uyuşmalıdır, uzantı ve dosya adı hiç kullanılmaz (GIF'i `.jpg` diye göndermek → `415`).
- Boyut sınırı: **10 MB/dosya** (multer sınırı → `413 PAYLOAD_TOO_LARGE`), talep başına **5** fotoğraf; iş emrinde tür (BEFORE / DURING / AFTER) başına **5**.
- Tek hat: `ImageUploadService` – talep ve iş emri fotoğrafları aynı doğrulama/normalizasyon/depolama kodundan geçer; iş emri key'i `municipalities/{mid}/work-orders/{id}/{type}/{uuid}.{ext}`.
- Object key tamamen sunucuda üretilir: `municipalities/{municipalityId}/requests/{requestId}/{uuid}.{ext}` → path traversal ve üzerine yazma imkânsız.
- Bucket **private**; imzasız erişim `403`. Erişim, talep erişim kontrolünden sonra verilen **5 dakikalık** presigned URL ile (`MEDIA_URL_TTL_SECONDS`). Kalıcı URL saklanmaz; `storage_key` doğruluk kaynağıdır.
- Veritabanı kaydı başarısız olursa yüklenen nesneler silinir.
- **Görüntü normalizasyonu ✅** (`storage/image-normalizer.ts`, `sharp`/libvips): kullanıcıdan gelen bayt **olduğu gibi saklanmaz**.
  1. İmza + bildirilen tür kontrolü (yukarıdaki kural).
  2. Yalnızca başlık okunur (piksel çözülmeden): **> 40 MP** veya bir kenarı **> 12 000 px** → `413 IMAGE_DIMENSIONS_TOO_LARGE` (decompression bomb koruması; çözme de `limitInputPixels` ile sınırlı). Çok kareli (animasyonlu WEBP/PNG) → `415`.
  3. Tam çözülür; bozuk/eksik veri → `400 INVALID_IMAGE`.
  4. EXIF yönü piksellere uygulanır, en uzun kenar **4096 px**'e küçültülür (büyütülmez).
  5. **Aynı formatta** yeniden kodlanır (JPEG q85 mozjpeg, PNG lossless, WEBP q85) ve **hiçbir meta veri yazılmaz**: EXIF (GPS, cihaz marka/model/seri no dahil), XMP, IPTC, yorumlar, ICC profili (pikseller sRGB'ye dönüştürülür). Saklanan `mime_type` / `size_bytes` çıktıya aittir.
  - Çıktı formatı = girdi formatı: PNG/WEBP şeffaflığı korunur, istemcinin gönderdiği tür arkasından değişmez; üç format da yeniden kodlandıktan sonra tarayıcıda güvenle gösterilir.
  - Konum talebin kendi `latitude/longitude` alanındadır; fotoğraftaki GPS hiçbir zaman okunmaz ve saklanmaz.
  - Testler gerçek görsellerle yapılır (`test/support/images.ts`: EXIF + GPS + XMP + Orientation 6 içeren JPEG, meta verili PNG/WEBP, başlığı 20 000² diyen PNG, animasyonlu WEBP, bozuk JPEG) ve çıktıda meta veri alanlarının yanı sıra gömülü metinlerin bayt düzeyinde de bulunmadığı doğrulanır.

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

## 8. Audit Edilen İşlemler (Phase 3 ✅, domain olayları Phase 5+)

Başarısız login (eşik aşımı), kullanıcı oluşturma/güncelleme, rol değişikliği, rol-izin değişikliği, talep durum/müdürlük/öncelik değişikliği, iş emri atama/tamamlama/doğrulama/iptal, sistem ve belediye ayarı değişikliği, refresh token reuse tespiti.

Phase 3'te uygulananlar: `LOGIN_SUCCESS`, `LOGIN_FAILED` (bilinen hesaplar), `ACCOUNT_LOCKED`, `LOGOUT`, `LOGOUT_ALL`, `SESSION_REVOKED`, `REFRESH_TOKEN_REUSE_DETECTED`, `USER_CREATED`, `USER_UPDATED`, `USER_STATUS_CHANGED`, `USER_ROLE_CHANGED`, `ROLE_CREATED`, `ROLE_PERMISSION_CHANGED` (kodlar: `@kent360/shared-types` → `AuditAction`).

Her kayıt: aktör, işlem, varlık türü/ID, önce/sonra, IP, user-agent, zaman. `AuditService` her yükü yazmadan önce merkezi olarak temizler: `password`, `*Hash`, `*token*`, `secret`, `cookie`, `authorization` anahtarları ve `Bearer …` / `$argon2…` değerleri `[REDACTED]` olur. Denetlenen değişiklik bir transaction içindeyse audit satırı da aynı transaction'da yazılır.

## 9. KVKK

- **Minimizasyon:** yalnızca hizmet için gerekli veri toplanır; T.C. kimlik no, adres (konum dışında) istenmez.
- **Amaçla sınırlılık:** vatandaş iletişim bilgisi yalnızca `users.read` izni olan personele gösterilir; saha personeli yalnızca konum ve talep içeriğini görür.
- **AI sağlayıcısına** kişisel veri gönderilmez (Phase 11 ✅): açıklama `maskPersonalData` ile maskelenir (e-posta, telefon, kimlik no, IBAN); ad, iletişim, konum gönderilmez. Saklanan analizde açıklamanın tamamı ve prompt yoktur; audit kaydında metin yoktur. AI gerekçesi ve analiz paneli yalnız personele döner.
- **Mükerrer adayları:** kiracı izolasyonu her zaman; personel kendi talep kapsamında; vatandaş belediye genelindeki adayları yalnız kamuya açık alanlarla görür (numara, kategori, mesafe, yaş, skor – açıklama, adres, bildiren yok). Katılma bir kez, isimsiz zaman çizelgesi kaydı, katılan vatandaş talebi takipçi kuralıyla görür (`requests.readOwn`).
- **MahallePulse:** `analytics.read` + `requests.read`; müdürlük yöneticisi kendi müdürlüğü; vatandaş ve saha personeli 403.
- **Saklama:** kapatılan taleplerin fotoğrafları için belediye bazlı saklama süresi (`settings.mediaRetentionDays`) 🗓.

## 9.1 Bildirim, Rapor ve Audit Ekranı (Phase 13) ✅

- **Bildirim sahipliği:** liste ve okundu işaretleme yalnız `userId = oturum sahibi` ve kendi belediyesi; başkasının bildirimi için 404 (varlık sızdırılmaz). Vatandaş iç bildirim türlerini sorgu düzeyinde de göremez; vatandaşa giden metinlerde personel adı ve iç ayrıntı yoktur. Kimse kendi eylemi için bildirim almaz.
- **Raporlar:** `reports.export` + `requests.read`; müdürlük yöneticisi kendi müdürlüğü ile sınırlıdır ve filtreyle genişletemez. CSV formül enjeksiyonu (`= + - @`, sekme, CR) etkisizleştirilir; açıklama ve bildiren dışa aktarılmaz; `Cache-Control: no-store`; saatlik hız sınırı.
- **Audit ekranı:** `audit.read` (sistem yöneticisi). Sırlar yazılırken temizlenir; ekran ayrıca gövde, prompt, başlık, tarayıcı ve oturum kimliği alanlarını hiç göstermez, ham JSON döndürmez. IP adresi yalnız bu yetkiye sahip kullanıcıya görünür.
- **Son kontrol (web MVP):** refresh çerezi httpOnly + `SameSite=Strict` + `/api/v1/auth` yolu + üretimde `Secure`; refresh rotasyonu ve yeniden kullanım tespiti; Helmet başlıkları; CORS izin listesi (yalnız `Content-Disposition` açılır); medya imza + yeniden kodlama + private bucket + kısa ömürlü imzalı URL; AI PII maskeleme; arama, harita, dashboard, MahallePulse ve raporlar nesne kapsamını SQL'de uygular.

## 10. Secret Yönetimi ✅

- `.env` git'e girmez (`.gitignore`); `.env.example` yalnızca development değerleri içerir.
- Production'da örnek JWT secret ile süreç **başlamaz** (env doğrulaması).
- Seed parolaları yalnızca development içindir ve README'de belirtilir.

## 11. Güvenlik Açığı Bildirimi

Bir güvenlik açığı bulursanız lütfen public issue açmayın; proje sahibine doğrudan e-posta ile bildirin.
