/**
 * Indonesian amount in words (terbilang), e.g. 6500000 → "enam juta lima ratus ribu".
 * @param {number} value
 * @returns {string}
 */
export function amountToTerbilang(value) {
  let n = Math.floor(Math.abs(Number(value) || 0));
  if (!Number.isFinite(n) || n < 0) return '';
  if (n === 0) return 'nol';

  const parts = [];
  const scales = [
    { div: 1_000_000_000, word: 'miliar' },
    { div: 1_000_000, word: 'juta' },
    { div: 1_000, word: 'ribu' },
  ];

  for (const { div, word } of scales) {
    if (n >= div) {
      const chunk = Math.floor(n / div);
      n %= div;
      const chunkWords = terbilangUnder1000(chunk);
      if (chunkWords) parts.push(`${chunkWords} ${word}`);
    }
  }
  if (n > 0) parts.push(terbilangUnder1000(n));
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function terbilangUnder1000(n) {
  let num = Math.floor(Number(n) || 0);
  if (num <= 0) return '';
  if (num >= 1000) return terbilangUnder1000(num % 1000);

  const parts = [];
  const hundreds = Math.floor(num / 100);
  num %= 100;

  if (hundreds === 1) parts.push('seratus');
  else if (hundreds > 1) parts.push(`${digitWord(hundreds)} ratus`);

  if (num > 0) {
    if (num < 10) parts.push(digitWord(num));
    else if (num < 20) {
      if (num === 10) parts.push('sepuluh');
      else if (num === 11) parts.push('sebelas');
      else parts.push(`${digitWord(num - 10)} belas`);
    } else {
      const tens = Math.floor(num / 10);
      const ones = num % 10;
      if (tens === 1) parts.push('sepuluh');
      else parts.push(`${digitWord(tens)} puluh`);
      if (ones > 0) parts.push(digitWord(ones));
    }
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function digitWord(n) {
  const words = [
    '',
    'satu',
    'dua',
    'tiga',
    'empat',
    'lima',
    'enam',
    'tujuh',
    'delapan',
    'sembilan',
  ];
  return words[Number(n)] || '';
}

/** Title case + suffix "Rupiah" (template: Enam Juta … Rupiah). */
export function amountToTerbilangRupiah(value) {
  const raw = amountToTerbilang(value);
  if (!raw) return '';
  const titled = raw.replace(/\b\w+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));
  return `${titled} Rupiah`;
}

export default { amountToTerbilang, amountToTerbilangRupiah };
