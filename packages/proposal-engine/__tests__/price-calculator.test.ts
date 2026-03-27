import { describe, it, expect } from 'vitest';
import {
  calculateItemTotal,
  calculateGlobalValue,
  calculateMonthlyValue,
  formatCurrencyBRL,
  formatCNPJ,
  formatCPF,
  formatDateExtensoBR,
} from '../src/price-calculator';

describe('price-calculator', () => {
  describe('calculateItemTotal', () => {
    it('should calculate item total correctly', () => {
      expect(calculateItemTotal(10, 5.50)).toBe(55.00);
    });
  });

  describe('calculateGlobalValue', () => {
    it('should sum all item total_price values', () => {
      const items = [
        { item_number: 1, description: 'Item A', quantity: 10, unit: 'UN', unit_price: 5.50, total_price: 55.00 },
        { item_number: 2, description: 'Item B', quantity: 5, unit: 'UN', unit_price: 20.00, total_price: 100.00 },
        { item_number: 3, description: 'Item C', quantity: 2, unit: 'UN', unit_price: 75.25, total_price: 150.50 },
      ];
      expect(calculateGlobalValue(items)).toBe(305.50);
    });
  });

  describe('calculateMonthlyValue', () => {
    it('should divide global value by months', () => {
      expect(calculateMonthlyValue(12000, 12)).toBe(1000);
    });
  });

  describe('formatCurrencyBRL', () => {
    it('should format 72135.00 correctly', () => {
      expect(formatCurrencyBRL(72135.00)).toBe('72.135,00');
    });

    it('should format 1234.56 correctly', () => {
      expect(formatCurrencyBRL(1234.56)).toBe('1.234,56');
    });
  });

  describe('formatCNPJ', () => {
    it('should format CNPJ correctly', () => {
      expect(formatCNPJ('00000000000100')).toBe('00.000.000/0001-00');
    });
  });

  describe('formatCPF', () => {
    it('should format CPF correctly', () => {
      expect(formatCPF('12345678900')).toBe('123.456.789-00');
    });
  });

  describe('formatDateExtensoBR', () => {
    it('should format date in Brazilian Portuguese', () => {
      expect(formatDateExtensoBR(new Date(2026, 2, 25))).toBe('25 de março de 2026');
    });
  });
});
