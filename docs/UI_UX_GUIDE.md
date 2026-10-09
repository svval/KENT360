# KENT360 – UI/UX Rehberi

## 1. Tasarım Karakteri

**Modern kurumsal SaaS konsolu + kamu kurumu ciddiyeti.** Arayüz bir operasyon merkezidir: sakin, yoğun bilgi taşıyabilen, renk yalnızca anlam taşıdığında kullanılan bir düzen.

Kaçınılanlar: neon, cyberpunk, mor-pembe "AI startup" gradyanları, glassmorphism, ağır gölgeler, her şeyin tam yuvarlak olduğu mobil-oyuncak görünümü, dekoratif emoji.

## 2. Renk Token'ları

Token'lar `apps/web/src/app/globals.css` içinde Tailwind v4 `@theme` ile tanımlıdır.

| Token        | Değer                                          | Kullanım                                   |
| ------------ | ---------------------------------------------- | ------------------------------------------ |
| `navy`       | `#0B1F3A`                                      | Sidebar, marka alanı                       |
| `primary`    | `#2563EB` _(belediye markası ile değişebilir)_ | Birincil aksiyon, aktif durum, link        |
| `accent`     | `#0891B2` _(değişebilir)_                      | İkincil vurgu, iş emri katmanı             |
| `background` | `#F5F7FA`                                      | Sayfa zemini                               |
| `card`       | `#FFFFFF`                                      | Kart / panel                               |
| `foreground` | `#172033`                                      | Ana metin                                  |
| `muted`      | `#64748B`                                      | İkincil metin, ikon                        |
| `border`     | `#E2E8F0`                                      | Kenarlık                                   |
| `success`    | `#16A34A`                                      | Çözüldü, SLA içinde                        |
| `warning`    | `#F59E0B` (metin için `#B45309`)               | İşlemde, SLA riskte                        |
| `critical`   | `#DC2626`                                      | Kritik öncelik, SLA aşıldı, yıkıcı aksiyon |

**Beyaz etiket:** yalnızca `--brand-primary` ve `--brand-accent` belediyeye göre değişir (`BrandingProvider`, yalnızca `#RRGGBB` kabul eder). Semantik renkler (başarı/uyarı/kritik) **asla** markaya göre değişmez; aksi halde "kırmızı = kritik" anlamı kaybolur.

## 3. Tipografi

Font: **Inter** (`next/font`, `latin-ext` alt kümesi – Türkçe karakterler için).

| Rol            | Boyut / ağırlık            |
| -------------- | -------------------------- |
| Sayfa başlığı  | 28px / 700                 |
| Bölüm başlığı  | 20px / 600                 |
| Kart başlığı   | 15px / 600                 |
| Gövde          | 14px / 400–500             |
| Yardımcı metin | 13px / 400 (`muted`)       |
| Etiket / badge | 12px / 500                 |
| KPI değeri     | 26px / 700, `tabular-nums` |

Sayılar tablo ve KPI'larda `tabular` yardımcı sınıfıyla eşit genişlikte gösterilir.

## 4. Ölçüler

| Öğe                  | Değer                                                                            |
| -------------------- | -------------------------------------------------------------------------------- |
| Sidebar              | 248px · daraltılmış 72px (tercih tarayıcıda saklanır)                            |
| Topbar               | 64px, sticky                                                                     |
| Kart radius          | 12px                                                                             |
| Buton / input radius | 8px                                                                              |
| Kontrol yüksekliği   | 36px (sm 32, lg 40)                                                              |
| İçerik genişliği     | max 1600px, yatay padding 16/32px                                                |
| Gölge                | kart: `0 1px 2px rgb(15 23 42 / .04)` + 1px kenarlık; popover: yumuşak tek gölge |

## 5. Sayfa İskeleti

Her sayfa: **başlık + kısa açıklama + (varsa) ana aksiyon** (`PageHeader`).

```
Talepler                                                       [+ Yeni Talep]
Belediyeye iletilen vatandaş ve kurum taleplerini yönetin.
```

Menü başlıkları ve açıklamaları tek kaynaktan gelir: `components/layout/navigation.ts` (sidebar, breadcrumb ve sayfa başlığı aynı veriyi kullanır).

## 6. Durum Rozetleri (Badge)

Rozet her zaman **metin içerir**; renk ikincil ipucudur (WCAG 1.4.1).

| Talep durumu           | Etiket              | Ton      |
| ---------------------- | ------------------- | -------- |
| NEW                    | Yeni                | info     |
| AI_ANALYZED            | AI Analiz Edildi    | accent   |
| UNDER_REVIEW           | İncelemede          | neutral  |
| ASSIGNED_TO_DEPARTMENT | Müdürlüğe Atandı    | info     |
| WORK_ORDER_CREATED     | İş Emri Oluşturuldu | info     |
| IN_PROGRESS            | İşlemde             | warning  |
| RESOLVED               | Çözüldü             | success  |
| VERIFIED               | Doğrulandı          | success  |
| CLOSED                 | Kapandı             | neutral  |
| REJECTED               | Reddedildi          | critical |

| İş emri durumu | Etiket       | Ton      |
| -------------- | ------------ | -------- |
| CREATED        | Oluşturuldu  | neutral  |
| ASSIGNED       | Atandı       | info     |
| ACCEPTED       | Kabul Edildi | info     |
| EN_ROUTE       | Yolda        | accent   |
| ON_SITE        | Sahada       | accent   |
| IN_PROGRESS    | Çalışılıyor  | warning  |
| WAITING        | Beklemede    | warning  |
| COMPLETED      | Tamamlandı   | success  |
| VERIFIED       | Doğrulandı   | success  |
| CANCELLED      | İptal Edildi | critical |

| Öncelik  | Etiket | Ton      |     | SLA      | Etiket    | Ton      |
| -------- | ------ | -------- | --- | -------- | --------- | -------- |
| LOW      | Düşük  | neutral  |     | ON_TIME  | Zamanında | success  |
| NORMAL   | Normal | info     |     | AT_RISK  | Riskte    | warning  |
| HIGH     | Yüksek | warning  |     | BREACHED | Aşıldı    | critical |
| CRITICAL | Kritik | critical |     |          |           |          |

## 7. Veri Ekranı Durumları

Her veri bileşeni dört durumu tasarlar:

| Durum      | Uygulama                                                                             |
| ---------- | ------------------------------------------------------------------------------------ |
| Yükleniyor | İçeriğin şeklini taklit eden `Skeleton` (spinner değil)                              |
| Hata       | Sunucunun Türkçe `message`'ı + "Tekrar dene"                                         |
| Boş        | `EmptyState`: ikon + anlamlı başlık + yönlendirme ("Henüz açık iş emri bulunmuyor.") |
| Veri       | —                                                                                    |

Henüz geliştirilmemiş modüller sahte veri göstermez; `ModulePlaceholder` hangi fazda neyin geleceğini dürüstçe söyler.

## 8. Geri Bildirim Mesajları (Toast)

Merkezi sistem: `useToast()` (`providers/toast-provider.tsx`) → `toast.success(title, description?)`, `toast.error(…)`, `toast.info(…)`. Başarı/bilgi `role="status"` (polite), hata `role="alert"` (assertive) canlı bölgelerinde duyurulur; hatalar 8 sn, diğerleri 5 sn görünür. Hata toast'ı sunucunun Türkçe `message`'ını açıklama olarak gösterir.

Spesifik ol, kimi/neyi etkilediğini söyle:

- ❌ `Success`, `İşlem başarılı`
- ✅ `İş emri WO-2026-000883 Mehmet Yılmaz'a atandı.`
- ✅ `KNT-2026-001248 numaralı talebiniz alındı. Durumunu "Taleplerim" ekranından izleyebilirsiniz.`

## 9. AI Önerilerinin Sunumu

- Her zaman **"AI Önerisi"** etiketiyle, güven yüzdesiyle birlikte gösterilir (`%94 güven`).
- Kesin karar dili kullanılmaz ("Kategori: Yol Çukuru" değil, "Önerilen kategori: Yol Çukuru").
- Kullanıcı tek tıkla öneriyi değiştirebilir; değişiklik history'ye "AI önerisi düzeltildi" olarak yazılır.

## 10. Tablolar

Sticky başlık, sunucu tarafı sayfalama, arama, filtre, sıralama. Filtreler URL'de tutulur:
`/requests?status=IN_PROGRESS&priority=HIGH&page=2` — sayfa yenilense veya link paylaşılsa bile görünüm korunur.

Talepler tablosu kolonları: Talep No · Kategori · Mahalle · Müdürlük · Öncelik · Durum · SLA · Oluşturulma · İşlem.

## 11. Erişilebilirlik

- Semantik HTML (`nav`, `main`, `header`, `table`/`th scope`), sayfa başına tek `h1`
- "İçeriğe geç" bağlantısı, görünür `:focus-visible` halkası, tam klavye gezinmesi (Radix bileşenleri)
- Her form alanında `label`; hatalar `aria-invalid` + `aria-describedby` ile bağlı
- Metin kontrastı ≥ 4.5:1 (uyarı metni için `#B45309`, `#F59E0B` yalnızca dolgu/ikon)
- `prefers-reduced-motion` desteği
- İkonlar dekoratifse `aria-hidden`, tek başına buton ise `aria-label`

## 12. Responsive

- Yönetim konsolu: **masaüstü öncelikli**, tablet tam destek, telefonda temel kullanım (sidebar çekmeceye dönüşür, KPI'lar 2 kolon, tablolar yatay kaydırılır).
- Saha personelinin birincil deneyimi **Saha360** mobil uygulamasıdır.

## 13. Yerelleştirme

UI metni Türkçe; kod, veritabanı ve API alanları İngilizce. Tarih/sayı biçimlendirme `Intl` ile (`tr-TR`, kullanıcının saat dilimi) yapılır: `25.09.2026 14:32`. Metinler bileşenlerde toplu tutulur; i18n kütüphanesine geçiş (ör. `next-intl`) anahtarlara çıkarma işidir, yeniden tasarım gerektirmez.

## 14. Yönetim (Ayarlar) Ekranları

Phase 4 ekranları (`/settings/*`) ortak kalıpları kullanır:

- **Liste:** `Table` + sunucu tarafı sayfalama; arama ve durum filtresi URL'de (`useUrlState`). Boş sonuçta filtreye özel `EmptyState`.
- **Oluştur / düzenle:** `Dialog` (Radix; odak tuzağı, Escape). Değiştirilemez alanlar (kod) `readOnly` gösterilir – `disabled` değil, çünkü disabled alan form değerlerinden düşer.
- **Silme yok:** "Pasifleştir / Aktifleştir"; reddedilen işlemde sunucunun gerekçesi toast'ta gösterilir ("Bu müdürlüğe yönlendirilen 2 aktif kategori var…").
- **Yetki:** menü öğeleri izinle gizlenir; okuma izni olup yazma izni olmayan kullanıcı ekranı **salt okunur** görür (aksiyon butonları yok, "Salt okunur" rozeti).
- **Kategoriler:** solda aranabilir, açılır-kapanır ağaç; sağda seçili kategori detayı (seçim URL'de, `?id=`). SLA "1 gün (1440 dk)" ve miras alındıysa "Ana kategoriden" rozeti ile gösterilir; SLA girişinde birim (dakika/saat/gün) seçilir, API'ye dakika gider.
- **Mahalleler:** tablo + şematik SVG sınır önizlemesi (altlıksız; etkileşimli harita Phase 9). Satırın üzerine gelinince önizlemede vurgulanır.
- **GeoJSON içe aktarma:** dosya seç → istemcide ön kontrol ve özet tablo → "Yalnızca doğrula" (sunucuda `dryRun`) veya "İçe aktar" → öğe bazlı sunucu hataları listelenir; başarıda "12 mahalle başarıyla içe aktarıldı."
- **Beyaz etiket:** belediye profili kaydedilince `/auth/me` yenilenir; logo ve renkler anında konsola uygulanır. Profil ekranında canlı önizleme bulunur.

## 15. Talep Ekranları (Phase 5)

- **Liste (`/requests`):** kolonlar §10'daki gibi; tüm filtreler URL'de (`/requests?status=NEW&priority=HIGH&page=2`). Vatandaş için başlık "Taleplerim", müdürlük filtresi yok. Boş sonuç: "Bu filtrelere uygun talep bulunamadı." + "Filtreleri temizle".
- **SLA gösterimi:** her zaman rozet + metin: "SLA içinde · 3 sa 42 dk kaldı", "SLA aşıldı · 1 sa 14 dk aşıldı", kapanmışsa "Süresi içinde sonuçlandı" / "… gecikmeyle sonuçlandı". Açık taleplerde dakikada bir güncellenir (`SlaIndicator`).
- **Yeni talep (`/requests/new`):** tek sayfa, beş numaralı bölüm (Kategori → Açıklama → Konum → Fotoğraflar → Kontrol ve gönder). Alt kategori seçilince "İlgili birim" ve "Hedef çözüm süresi" bilgi olarak gösterilir; kesin değerleri sunucu belirler. Konum paneli: koordinat + adres, "Konumumu kullan", yalnız geliştirmede "Demo konumu kullan", canlı mahalle çözümü ve şematik önizleme (harita seçici Phase 9). Fotoğraflar: sürükle-bırak, önizleme, istemci tarafı tür/boyut/adet kontrolü.
- **Gönderim yaşam döngüsü:** önce talep oluşturulur, sonra fotoğraflar tek tek (ilerleme çubuğuyla) yüklenir. Bir fotoğraf başarısız olursa talep silinmez; ekran hangi dosyanın yüklenemediğini gösterir, "Tekrar dene" ve "Fotoğraflar olmadan talebe git" sunar. Vatandaşın bildirimi hiçbir koşulda kaybolmaz.
- **Detay (`/requests/[id]`):** başlıkta talep no + durum + öncelik; ana kolonda açıklama, fotoğraflar, konum, süreç (zaman çizelgesi, sonraki adım açık uçlu gösterilir); sağ panelde kategori, müdürlük, SLA, kaynak, oluşturulma, bildiren (yalnız yetkili personel). "İşlemler" kartı sunucunun `actions` listesinden oluşur; reddetme ve geri almada gerekçe zorunludur. Toast: "KNT-2026-000121 önceliği "Kritik" olarak güncellendi."
- Fotoğraf URL'leri 5 dakikalıktır; detay 4 dakikada bir sessizce yenilenir.

## 16. İş Emri ve Saha Ekranları (Phase 6)

- **Liste (`/work-orders`):** İş Emri No · Kaynak Talep · Kategori · Mahalle · Müdürlük · Ekip · Personel · Öncelik · Durum · SLA · Oluşturulma. Filtreler URL'de (arama, durum, öncelik, müdürlük, ekip, ekip seçilince personel, tarih). `workOrders.read` olmayan kullanıcıda (saha personeli, ekip sorumlusu) başlık **"Görevlerim"**, müdürlük filtresi yok; ayrı bir uygulama değil, aynı ekran sadeleşir.
- **Detay (`/work-orders/[id]`):** başlıkta `WO-…` + durum + öncelik + kaynak talep bağlantısı (talep okuma yetkisi olana). Ana kolon: Sorun (talep açıklaması, talimat, talep fotoğrafları) → **Önce / Sonra** → Çalışma sırasında galerisi → yapılan çalışma → konum → iş emri geçmişi. Sağ panel: bilgiler (müdürlük, ekip, personel, SLA), **Operasyon** kartı (yalnız sunucunun `actions` listesindeki adımlar), önemli tarihler, atama geçmişi.
- **Önce / Sonra:** masaüstünde yan yana, dar ekranda alt alta; "önce" fotoğrafı yoksa talep fotoğrafı "(talep fotoğrafı)" etiketiyle gösterilir. Fotoğraflar tıklanınca basit bir lightbox (`Dialog`) açılır; ek kütüphane yok.
- **Konum gerektiren adımlar:** diyalog, konumun alınacağını ve yarıçapı söyler; buton "Konum alınıyor…" durumuna geçer; izin reddi ve uzaklık hataları diyalogda Türkçe gösterilir.
- **İşi Tamamla:** açıklama + "sonra" fotoğrafı seçimi (önizleme, kaldırma); buton ancak ikisi de sağlanınca aktif; başarıda toast "İş emri tamamlandı."
- **Talep detayı:** `canCreateWorkOrder` ise "İş Emri Oluştur" (talimat alanı; vatandaşa gösterilmez); bağlı iş emirleri kartı (numara + durum rozeti).
- **Saha ekipleri (`/field/teams`):** ekip, müdürlük, sorumlu, üye / açık iş / tamamlanan sayıları, durum; oluştur/düzenle diyaloğu (kod ve müdürlük sonradan salt okunur), üyeler diyaloğu (müdürlüğün saha personelinden ekleme, sorumlu seçimi, çıkarma).

## 17. Operasyon Paneli ve Canlı Harita (Phase 8–9)

- **Dashboard:** üstte 6 KPI kartı (etiket → büyük `tabular-nums` değer → kısa açıklama → varsa karşılaştırma; iyileşme yeşil, kötüleşme kırmızı, nötr gri). Ardından geniş canlı harita kartı ("Haritayı aç"), trend (2/3) + kritik talepler (1/3), son talepler tablosu. Veri dakikada bir yenilenir. `requests.read` olmayan kullanıcıya (vatandaş, saha personeli) operasyon verisi yerine kısayol paneli gösterilir.
- **Trend grafiği:** "Oluşturulan" (#2563EB, düz) ve "Çözülen" (#0891B2, kesikli) – palet dataviz doğrulayıcısından geçti; kimlik yalnız renge dayanmaz (çizgi deseni, lejant, uçta direkt etiket). Tek eksen, silik ızgara, çarpı imleç + tooltip, "Tablo görünümü".
- **Harita marker'ları:** talep = mavi daire, kritik (CRITICAL veya SLA aşıldı) = kırmızı eşkenar dörtgen + "!", iş emri = amber kare (talebinin yanına kaydırılmış), çözülmüş = küçük gri daire; kümeler lacivert daire + sayı. Lejant katman panelindedir ve marker'ın şeklini taşır.
- **Harita yerleşimi:** `/map` sayfası tam genişlik; üstte filtre çubuğu (durum, öncelik, müdürlük, kategori, tarih – URL'de), sağ üstte katman paneli (sayılarla), sol altta seçim kartı, sağ altta zoom. Altlık yüklenemezse veya yapılandırılmamışsa açıklayıcı boş durum.
- **Genel arama:** topbar'da; 250 ms debounce, en az 2 karakter; sonuçlar ikon + "Talep"/"İş Emri" etiketiyle; ↑/↓, Enter, Esc.

## 18. MahallePulse ve AI (Phase 10–11)

- **Risk** her zaman sayı + seviye etiketiyle gösterilir (`67 Yüksek risk`); seviye rozeti durum tonlarıyla (düşük yeşil, orta mavi, yüksek amber, kritik kırmızı). Skor büyüklüğü (çubuk, harita) tek renk ailesinde açıktan koyuya sıralı rampayla (`RISK_RAMP`). Skorun "kural tabanlı" olduğu ekranda yazılır; AI gibi sunulmaz.
- **Anomali** cümle olarak verilir ve abartmaz ("son 7 günde normalin %82 üzerinde (5 bildirim; …)"); taban sıfırsa yüzde uydurulmaz ("önceki 4 haftada hiç yoktu").
- **Kategori dağılımı** yatay çubuklar, tek renk, değer + yüzde yazılı.
- **Harita:** "Talep yoğunluğu" (ısı haritası, mavi rampa) ve "Mahalle riski" (choropleth, amber→kırmızı rampa) katman panelinden açılır; risk lejantı 0–50–100. Mahalle tıklanınca risk kartı ve "MahallePulse detayı".
- **AI önerisi:** otomatik değil, "AI ile analiz et" düğmesiyle; panelde kategori yolu, müdürlük, öncelik, güven yüzdesi, kısa gerekçe ve kaynak (kural tabanlı / model adı). "Öneriyi uygula" yalnız formu doldurur; kullanıcı değiştirebilir.
- **Benzer bildirimler:** uyarı tonunda kart; her aday için numara, "%84 benzer", katılımcı sayısı, açıklama satırı ("55 m uzakta · aynı kategori · 3 saat önce · metin %88 benzer"); düğmeler "Detayı gör" (görebiliyorsa), "Bu talebe katıl" (vatandaş), "Yine de yeni talep oluştur".
- **Talep detayı:** personel için "AI Analizi" kartı ("Öneri" rozeti, seçilen kategoriyle karşılaştırma, olası benzer talepler, "AI karar vermez" notu); vatandaşa gösterilmez. Katılan vatandaşa "Bu talebi takip ediyorsunuz" rozeti.

## 19. Bildirimler, Raporlar, Audit ve Son Cila (Phase 13)

- **Navigasyon:** Operasyon (Dashboard, Talepler, İş Emirleri, Canlı Harita) · Kent Zekâsı (MahallePulse) · Yönetim (Saha Ekipleri, Müdürlükler, Talep Kategorileri, Mahalle Sınırları, Belediye Profili) · Raporlama (Raporlar, Audit). Bildirimler ve Profil topbar'dan. Yetkisi olmayan menü öğesi gizlenir; vatandaş yalnız Dashboard ve Talepler görür.
- **Zil:** okunmamış sayısı kırmızı rozetle (99+), `aria-label` "Bildirimler, N okunmamış"; açılır listede son 6 bildirim, tür ikonu, göreli zaman ("18 dk önce"), okunmamış nokta, "Tümünü okundu say", "Tümünü gör". Tıklanan bildirim okundu olur ve ilgili kayda gider.
- **Bildirimler sayfası:** "Tümü / Okunmamış" sekmeleri (URL'de), tür rozeti, "Yeni" rozeti, sayfalama, boş durum.
- **Raporlar:** filtre satırı + seçili dönem metni; 5 özet kartı (`tabular-nums`); müdürlük ve mahalle performans tabloları; 5 dışa aktarım kartı, indirme sırasında düğmede spinner, başarıda dosya adını söyleyen toast. Müdür için müdürlük filtresi yoktur ve kapsam metni gösterilir.
- **Audit:** filtreler (kullanıcı, işlem, kaynak, kayıt kimliği, tarih) + tablo; "Detay" penceresinde kullanıcı, kaynak, işlem kodu, IP ve **Alan / Önce / Sonra** tablosu – durum, öncelik gibi kodlar Türkçe etiketle; ham JSON yok.
- **Durum ekranları:** 404 ve beklenmeyen hata için marka işaretli tek kart (`StatusPage`); konsol içindeki hata kabuğu korur; yetkisiz sayfada "Bu sayfayı görüntüleme yetkiniz yok" + Dashboard'a dönüş (gizli `h1` ile).
- **Kimlik:** favicon `app/icon.svg`, başlık şablonu `KENT360 | Sayfa`.
- **Kabul ölçütleri:** her ana sayfada tek `h1`; yükleniyor / hata (Tekrar dene) / boş durumları; arayüzde "undefined / null / [object Object] / NaN" yok; 1440, 1024 ve 390 px'te yatay sayfa taşması yok (tablolar kendi içinde kayar).
