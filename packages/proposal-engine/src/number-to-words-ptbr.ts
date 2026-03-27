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

export function numberToWordsPtBr(value: number): string {
  // Round to 2 decimal places to avoid floating point issues
  const rounded = Math.round(value * 100) / 100;
  const intPart = Math.floor(rounded);
  const centavos = Math.round((rounded - intPart) * 100);

  // Split integer part into groups: billions, millions, thousands, units
  const billions = Math.floor(intPart / 1_000_000_000);
  const millions = Math.floor((intPart % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((intPart % 1_000_000) / 1_000);
  const units = intPart % 1_000;

  const reaisParts: string[] = [];

  if (billions > 0) {
    const bWords = groupToWords(billions);
    if (billions === 1) {
      reaisParts.push('um bilhão');
    } else {
      reaisParts.push(`${bWords} bilhões`);
    }
  }

  if (millions > 0) {
    const mWords = groupToWords(millions);
    if (millions === 1) {
      reaisParts.push('um milhão');
    } else {
      reaisParts.push(`${mWords} milhões`);
    }
  }

  if (thousands > 0) {
    if (thousands === 1) {
      reaisParts.push('mil');
    } else {
      reaisParts.push(`${groupToWords(thousands)} mil`);
    }
  }

  if (units > 0) {
    reaisParts.push(groupToWords(units));
  }

  // Build reais string
  // Brazilian joining rules:
  // - Between groups, use ", " by default
  // - Use " e " before the last group IF its raw value is <= 100
  // - The "units" group raw value determines the separator before it
  // - When there's no units group, the last group is thousands, and we use " e " before it
  //   if its raw value is <= 100
  let reaisStr = '';
  if (intPart > 0) {
    // Track which groups are present and their raw values for separator logic
    const groupInfos: { text: string; rawValue: number; level: 'billions' | 'millions' | 'thousands' | 'units' }[] = [];
    if (billions > 0) groupInfos.push({ text: '', rawValue: billions, level: 'billions' });
    if (millions > 0) groupInfos.push({ text: '', rawValue: millions, level: 'millions' });
    if (thousands > 0) groupInfos.push({ text: '', rawValue: thousands, level: 'thousands' });
    if (units > 0) groupInfos.push({ text: '', rawValue: units, level: 'units' });

    if (reaisParts.length === 1) {
      reaisStr = reaisParts[0];
    } else {
      // Join pairwise: the separator before the last part depends on the last group's raw value
      const lastInfo = groupInfos[groupInfos.length - 1];
      const lastPart = reaisParts[reaisParts.length - 1];
      const beforeLast = reaisParts.slice(0, -1);

      // Use " e " before last group if:
      // - its raw value is <= 100, OR
      // - the last group is NOT the units group (i.e., thousands/millions as last group always use "e")
      const needsE = lastInfo.rawValue <= 100 || lastInfo.level !== 'units';

      if (needsE) {
        reaisStr = beforeLast.join(', ') + ' e ' + lastPart;
      } else {
        reaisStr = beforeLast.join(', ') + ', ' + lastPart;
      }
    }

    // Add "de reais" if ends in million/billion with no thousands/units
    const endsInMillionOrBillion = (millions > 0 || billions > 0) && thousands === 0 && units === 0;

    if (intPart === 1) {
      reaisStr += ' real';
    } else if (endsInMillionOrBillion) {
      reaisStr += ' de reais';
    } else {
      reaisStr += ' reais';
    }
  }

  // Build centavos string
  let centavosStr = '';
  if (centavos > 0) {
    const cWords = groupToWords(centavos);
    if (centavos === 1) {
      centavosStr = `${cWords} centavo`;
    } else {
      centavosStr = `${cWords} centavos`;
    }
  }

  // Combine
  if (reaisStr && centavosStr) {
    return `${reaisStr} e ${centavosStr}`;
  } else if (reaisStr) {
    return reaisStr;
  } else if (centavosStr) {
    return centavosStr;
  } else {
    return 'zero reais';
  }
}
