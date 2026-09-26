# KENT360 – Proje Genel Bakışı

**KENT360 – Akıllı Belediye Operasyon ve Kent Zekâsı Platformu**
_Smart Municipal Operations & Urban Intelligence Platform_

## 1. Problem

Belediyelerde vatandaş talepleri; çağrı merkezi, web formu, sosyal medya ve dilekçe gibi dağınık kanallardan gelir. Talebin doğru müdürlüğe ulaşması, saha ekibine iş olarak düşmesi ve çözümün kanıtlanması çoğunlukla telefon, Excel ve kâğıt üzerinden yürür. Sonuç:

- Aynı çukur için onlarca mükerrer kayıt açılır, ekipler aynı işe birden çok kez yönlendirilir.
- Hangi talebin gerçekten acil olduğu (çocuk parkında kırık metal ekipman ↔ boya dökülmesi) ayırt edilemez.
- Çözüm süresi ve SLA ölçülemez; yönetim "hangi mahallede ne oluyor" sorusuna veriyle cevap veremez.
- Saha personelinin işi yaptığına dair kanıt (önce/sonra fotoğrafı, konum) sistematik tutulmaz.

## 2. Çözüm

KENT360, vatandaş bildiriminden saha çözümüne kadar bütün süreci tek bir platformda yöneten, harita merkezli bir **belediye operasyon platformu** ve bu operasyon verisinden anlam çıkaran bir **kent zekâsı platformudur**.

```
Vatandaş bildirimi → Fotoğraf + açıklama + konum → AI analizi (kategori, öncelik, risk, özet)
→ Benzer kayıt kontrolü → Müdürlüğe yönlendirme → İş emri → Ekibe/personele atama
→ Olay yerine varış (konum doğrulama) → İşlem → Önce/sonra fotoğrafı → Doğrulama
→ Talebin kapanması → Dashboard ve MahallePulse analitiğine yansıma
```

## 3. Kullanıcılar ve Roller

| Rol                                          | Kim                                | Temel ihtiyaç                                                 |
| -------------------------------------------- | ---------------------------------- | ------------------------------------------------------------- |
| **Citizen** (Vatandaş)                       | Mahalle sakini                     | Kolayca bildirim yapmak, durumunu takip etmek                 |
| **Field Staff** (Saha Personeli)             | Fen İşleri, Park Bahçeler çalışanı | Bugünkü görevlerini görmek, yol tarifi, kanıt fotoğrafı       |
| **Team Leader** (Ekip Sorumlusu)             | Saha ekip şefi                     | Ekibine iş dağıtmak, yeniden atamak, performansı izlemek      |
| **Department Manager** (Müdürlük Yöneticisi) | Müdür / müdür yardımcısı           | Müdürlüğe gelen talepleri yönetmek, iş emri açmak, analitik   |
| **System Admin** (Sistem Yöneticisi)         | Bilgi İşlem                        | Kullanıcı, rol/yetki, kategori, SLA, belediye ayarları, audit |

Yetkilendirme rol + izin (permission) modeliyle yapılır; bkz. [SECURITY.md](SECURITY.md).

## 4. Ürün Modülleri (MVP)

1. **Kent Operasyon Merkezi** – KPI kartları (bugünkü/açık/kritik talepler, açık iş emirleri, ortalama çözüm süresi, SLA başarısı), canlı harita, trend ve kritik talep listesi.
2. **Akıllı Talep Yönetimi** – AI destekli talep oluşturma, mükerrer kayıt tespiti, iş akışı motoru, SLA takibi, zaman çizelgesi.
3. **Saha360** – Saha ekipleri, iş emirleri, atama geçmişi, önce/sonra kanıtı ve React Native mobil uygulama.
4. **MahallePulse** – Mahalle bazında talep yoğunluğu, çözüm performansı, eğilimler ve kural tabanlı anomali uyarıları.

## 5. Uçtan Uca MVP Senaryosu

Bütün geliştirme şu senaryonun kusursuz çalışmasına odaklanır (ayrıntılı demo akışı: [DEMO_SCENARIO.md](DEMO_SCENARIO.md)):

1. Vatandaş giriş yapar → 2. yeni bildirim başlatır → 3. fotoğraf yükler → 4. haritadan konum seçer → 5. açıklama yazar
   → 6. AI analiz eder → 7. kategori ve 8. öncelik önerir → 9. benzer talepler kontrol edilir → 10. talep kaydedilir
   → 11. yönetici dashboard'da görür → 12. müdürlüğe atar → 13. iş emri oluşturur → 14. saha personeline atar
   → 15. personel mobilde görür → 16. kabul eder → 17. yola çıkar/varır → 18. işe başlar → 19. AFTER fotoğrafı yükler
   → 20. işi tamamlar → 21. yönetici çözümü görür/doğrular → 22. talep kapanır → 23. dashboard ve 24. MahallePulse güncellenir.

## 6. Öne Çıkan Özellikler (Hero Features)

| #   | Özellik                                                    | Neden önemli                            |
| --- | ---------------------------------------------------------- | --------------------------------------- |
| 1   | Canlı şehir haritası (kümeleme, heatmap, mahalle görünümü) | Yönetimin şehri tek ekranda görmesi     |
| 2   | AI talep sınıflandırma                                     | Doğru müdürlüğe ilk seferde yönlendirme |
| 3   | Mükerrer kayıt tespiti (açıklanabilir skor)                | Gereksiz saha ziyaretinin önlenmesi     |
| 4   | Talep zaman çizelgesi                                      | Vatandaşa ve yönetime şeffaflık         |
| 5   | İş akışı motoru (durum makinesi)                           | Tutarlı, denetlenebilir süreç           |
| 6   | SLA takibi (zamanında / riskte / aşıldı)                   | Hizmet kalitesinin ölçülmesi            |
| 7   | Önce / sonra fotoğraf kanıtı                               | Yapılan işin doğrulanması               |
| 8   | Mahalle heatmap ve MahallePulse                            | Kaynak planlaması için veri             |
| 9   | Saha360 mobil uygulaması                                   | Sahada kâğıtsız çalışma                 |
| 10  | Değiştirilemez audit log                                   | Kamu hesap verebilirliği                |

## 7. Tasarım İlkeleri

- **AI karar vermez, öneri üretir.** Her öneri "AI Önerisi" olarak gösterilir, insan değiştirebilir; kabul/ret bilgisi saklanır.
- **Beyaz etiket (white-label).** Belediye adı, logosu, renkleri ve iletişim bilgisi veritabanından gelir; kodda belediye adı yoktur.
- **Çok belediyeli (multi-tenant) veri modeli.** Kiracıya ait tablolar `municipality_id` taşır.
- **Veri minimizasyonu (KVKK).** Vatandaş iletişim bilgisi yalnızca yetkili rollere gösterilir.
- **Önce çalışan uçtan uca akış, sonra genişlik.** Yarım yüz özellik yerine kusursuz tek senaryo.

## 8. Kapsam Dışı (Bilinçli Olarak)

Microservices, Kubernetes, event sourcing, Kafka, Elasticsearch, GraphQL ve vector DB ilk sürümde **kullanılmaz**. Gerekçeler ve bunların hangi koşulda devreye gireceği [ARCHITECTURE.md](ARCHITECTURE.md#11-evrim-yolu) içinde açıklanmıştır.
