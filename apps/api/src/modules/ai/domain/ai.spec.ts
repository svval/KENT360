import { duplicateExplanation, duplicateScore } from './duplicate-score';
import { type CategoryOption, classifyByKeywords, summarise } from './keyword-classifier';
import { maskPersonalData } from './pii';

const categories: CategoryOption[] = [
  {
    code: 'ROAD_POTHOLE',
    name: 'Yol Çukuru',
    parentName: 'Yol ve Kaldırım',
    keywords: ['çukur', 'göçük', 'asfalt'],
    parentKeywords: ['yol', 'kaldırım'],
    defaultPriority: 'HIGH',
  },
  {
    code: 'ROAD_SIDEWALK',
    name: 'Kaldırım Bozukluğu',
    parentName: 'Yol ve Kaldırım',
    keywords: ['kaldırım', 'parke', 'bordür'],
    parentKeywords: ['yol', 'kaldırım'],
    defaultPriority: 'NORMAL',
  },
  {
    code: 'CLEANING_GARBAGE',
    name: 'Çöp Toplanmaması',
    parentName: 'Temizlik',
    keywords: ['çöp', 'koku'],
    parentKeywords: [],
    defaultPriority: 'NORMAL',
  },
];

describe('classifyByKeywords (mock AI)', () => {
  it('suggests the category whose keywords appear, with a traceable reason', () => {
    const result = classifyByKeywords(
      'Okul önündeki yolda büyük bir çukur var, asfalt tamamen göçmüş.',
      categories,
    );
    expect(result.categoryCode).toBe('ROAD_POTHOLE');
    expect(result.matchedKeywords).toEqual(expect.arrayContaining(['çukur', 'asfalt']));
    expect(result.reasoning).toContain('Yol ve Kaldırım › Yol Çukuru');
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
    expect(result.confidence).toBeLessThanOrEqual(0.95);
  });

  it('raises the priority for danger words and explains it', () => {
    expect(classifyByKeywords('Sokakta çöp birikmiş, koku var.', categories).priority).toBe(
      'NORMAL',
    );
    expect(
      classifyByKeywords('Çöp konteyneri devrildi, çocuk yaralandı!', categories),
    ).toMatchObject({ categoryCode: 'CLEANING_GARBAGE', priority: 'CRITICAL' });
    const high = classifyByKeywords('Kaldırım parkeleri kırık, yaşlılar düşüyor.', categories);
    expect(high).toMatchObject({ categoryCode: 'ROAD_SIDEWALK', priority: 'HIGH' });
    expect(high.reasoning).toContain('öncelik yükseltildi');
  });

  it('admits when it does not know (low confidence, no category)', () => {
    expect(classifyByKeywords('Merhaba, bir sorunum var.', categories)).toMatchObject({
      categoryCode: null,
      confidence: 0.2,
    });
  });

  it('keeps confidence in 0–1 for many matches', () => {
    const many = classifyByKeywords('çukur çukur göçük asfalt yol kaldırım', categories);
    expect(many.confidence).toBeLessThanOrEqual(0.95);
  });

  it('matches at word starts only', () => {
    expect(classifyByKeywords('Kaçukur diye bir yer', categories).categoryCode).toBeNull();
    expect(classifyByKeywords('Çukuru kimse kapatmadı', categories).categoryCode).toBe(
      'ROAD_POTHOLE',
    );
  });

  it('summarises to the first sentence', () => {
    expect(summarise('İlk cümle burada. İkinci cümle uzun uzun devam ediyor.')).toBe(
      'İlk cümle burada.',
    );
  });
});

describe('maskPersonalData', () => {
  it('masks e-mail, phone, national id and IBAN', () => {
    expect(
      maskPersonalData(
        'Bana zeynep@example.com veya 0532 123 45 67 adresinden ulaşın, TC 12345678901, IBAN TR12 0006 1005 1978 6457 8413 26.',
      ),
    ).toBe('Bana [e-posta] veya [telefon] adresinden ulaşın, TC [kimlik no], IBAN [iban].');
    expect(maskPersonalData('Yolda 3 çukur var, 150 m ileride.')).toBe(
      'Yolda 3 çukur var, 150 m ileride.',
    );
  });
});

describe('duplicateScore', () => {
  it('reproduces the documented example (≈ 0.84)', () => {
    const input = {
      distanceMeters: 55,
      sameCategory: true,
      sameParent: true,
      textSimilarity: 0.88,
      ageMinutes: 180,
    };
    const result = duplicateScore(input);
    expect(result.score).toBeCloseTo(0.84, 2);
    expect(result.possibleDuplicate).toBe(true);
    expect(duplicateExplanation(input)).toBe(
      '55 m uzakta · aynı kategori · 3 saat önce · metin %88 benzer',
    );
  });

  it('scores distant, old and unrelated requests lower', () => {
    const near = duplicateScore({
      distanceMeters: 20,
      sameCategory: true,
      sameParent: true,
      textSimilarity: 0.5,
      ageMinutes: 60,
    });
    const far = duplicateScore({
      distanceMeters: 140,
      sameCategory: true,
      sameParent: true,
      textSimilarity: 0.5,
      ageMinutes: 60,
    });
    const old = duplicateScore({
      distanceMeters: 20,
      sameCategory: true,
      sameParent: true,
      textSimilarity: 0.5,
      ageMinutes: 20 * 1440,
    });
    const other = duplicateScore({
      distanceMeters: 20,
      sameCategory: false,
      sameParent: false,
      textSimilarity: 0.1,
      ageMinutes: 60,
    });
    expect(far.score).toBeLessThan(near.score);
    expect(old.score).toBeLessThan(near.score);
    expect(other.score).toBeLessThan(0.6);
    expect(other.possibleDuplicate).toBe(false);
  });
});
