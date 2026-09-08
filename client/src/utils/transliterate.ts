/**
 * Transliterate English text or numbers to Marathi Devanagari script.
 * Tries server API first (which can use AI), falls back to fast local phonetic rules.
 */
export async function convertToDevanagari(text: string, apiKey?: string): Promise<string> {
  if (!text || !text.trim()) return '';

  try {
    const res = await fetch('/api/copilot/transliterate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, apiKey }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.transliterated) {
        return data.transliterated;
      }
    }
  } catch (e) {
    console.warn('API transliteration failed, falling back to local phonetic:', e);
  }

  return localPhoneticTransliterate(text);
}

export function localPhoneticTransliterate(input: string): string {
  if (!input) return '';

  const digitMap: Record<string, string> = {
    '0': '०', '1': '१', '2': '२', '3': '३', '4': '४',
    '5': '५', '6': '६', '7': '७', '8': '८', '9': '९'
  };

  const wordMap: Record<string, string> = {
    'nitin': 'नितीन',
    'madhukar': 'मधुकर',
    'mahajan': 'महाजन',
    'patil': 'पाटील',
    'sanjeevani': 'संजीवनी',
    'radheshyam': 'राधेश्याम',
    'amalner': 'अमळनेर',
    'jalgaon': 'जळगाव',
    'dhule': 'धुळे',
    'pune': 'पुणे',
    'mumbai': 'मुंबई',
    'service': 'सेवा (नोकरी)',
    'job': 'नोकरी',
    'housewife': 'गृहिणी',
    'business': 'व्यवसाय',
    'farmer': 'शेती',
    'agriculture': 'शेती',
    'advocate': 'ॲडव्होकेट',
    'adv': 'ॲड.',
    'court': 'कोर्ट',
    'district': 'जिल्हा',
    'taluka': 'तालुका',
    'ta': 'ता.',
    'dist': 'जि.',
    'post': 'पो.',
    'at': 'रा.'
  };

  let result = input;

  result = result.replace(/\b[A-Za-z]+\b/g, (w) => {
    const lower = w.toLowerCase();
    if (wordMap[lower]) return wordMap[lower];

    return lower
      .replace(/sh/g, 'श')
      .replace(/ch/g, 'च')
      .replace(/th/g, 'थ')
      .replace(/dh/g, 'ध')
      .replace(/kh/g, 'ख')
      .replace(/gh/g, 'घ')
      .replace(/bh/g, 'भ')
      .replace(/ph/g, 'फ')
      .replace(/aa/g, 'आ')
      .replace(/ee/g, 'ई')
      .replace(/oo/g, 'ऊ')
      .replace(/a/g, 'ा')
      .replace(/i/g, 'ि')
      .replace(/u/g, 'ु')
      .replace(/e/g, 'े')
      .replace(/o/g, 'ो')
      .replace(/k/g, 'क')
      .replace(/g/g, 'ग')
      .replace(/j/g, 'ज')
      .replace(/t/g, 'त')
      .replace(/d/g, 'द')
      .replace(/n/g, 'न')
      .replace(/p/g, 'प')
      .replace(/b/g, 'ब')
      .replace(/m/g, 'म')
      .replace(/y/g, 'य')
      .replace(/r/g, 'र')
      .replace(/l/g, 'ल')
      .replace(/v/g, 'व')
      .replace(/w/g, 'व')
      .replace(/s/g, 'स')
      .replace(/h/g, 'ह');
  });

  result = result.replace(/[0-9]/g, (d) => digitMap[d] || d);
  return result;
}
