/**
 * Converts a number to words in Brazilian Portuguese (no currency suffix).
 * E.g. 60 -> "sessenta", 90 -> "noventa"
 */
const UNITS = [
  '', 'um', 'dois', 'três', 'quatro', 'cinco',
  'seis', 'sete', 'oito', 'nove', 'dez',
  'onze', 'doze', 'treze', 'quatorze', 'quinze',
  'dezesseis', 'dezessete', 'dezoito', 'dezenove',
];

const TENS = [
  '', '', 'vinte', 'trinta', 'quarenta', 'cinquenta',
  'sessenta', 'setenta', 'oitenta', 'noventa',
];

const HUNDREDS = [
  '', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos',
  'seiscentos', 'setecentos', 'oitocentos', 'novecentos',
];

function groupToWords(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'cem';

  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const remainder = n % 100;

  if (h > 0) {
    parts.push(HUNDREDS[h]);
  }

  if (remainder > 0) {
    if (remainder < 20) {
      parts.push(UNITS[remainder]);
    } else {
      const t = Math.floor(remainder / 10);
      const u = remainder % 10;
      if (u === 0) {
        parts.push(TENS[t]);
      } else {
        parts.push(`${TENS[t]} e ${UNITS[u]}`);
      }
    }
  }

  return parts.join(' e ');
}

export function numberToWordsSimple(value: number): string {
  const n = Math.floor(Math.abs(value));
  if (n === 0) return 'zero';

  const thousands = Math.floor(n / 1000);
  const units = n % 1000;

  const parts: string[] = [];

  if (thousands > 0) {
    if (thousands === 1) {
      parts.push('mil');
    } else {
      parts.push(`${groupToWords(thousands)} mil`);
    }
  }

  if (units > 0) {
    parts.push(groupToWords(units));
  }

  if (parts.length === 2 && units <= 100) {
    return parts.join(' e ');
  }

  return parts.join(', ');
}
