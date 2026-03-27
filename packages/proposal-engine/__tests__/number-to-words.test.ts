import { describe, it, expect } from 'vitest';
import { numberToWordsPtBr } from '../src/number-to-words-ptbr';

describe('numberToWordsPtBr', () => {
  it.each([
    [0.01, 'um centavo'],
    [0.50, 'cinquenta centavos'],
    [1.00, 'um real'],
    [1.01, 'um real e um centavo'],
    [100.00, 'cem reais'],
    [101.00, 'cento e um reais'],
    [1000.00, 'mil reais'],
    [1001.00, 'mil e um reais'],
    [1100.00, 'mil e cem reais'],
    [1234.56, 'mil, duzentos e trinta e quatro reais e cinquenta e seis centavos'],
    [5670.00, 'cinco mil, seiscentos e setenta reais'],
    [72135.00, 'setenta e dois mil, cento e trinta e cinco reais'],
    [100000.00, 'cem mil reais'],
    [1000000.00, 'um milhão de reais'],
    [1000000.01, 'um milhão de reais e um centavo'],
    [1500000.00, 'um milhão e quinhentos mil reais'],
    [2000000.00, 'dois milhões de reais'],
  ])('should convert %s to "%s"', (input, expected) => {
    expect(numberToWordsPtBr(input)).toBe(expected);
  });
});
