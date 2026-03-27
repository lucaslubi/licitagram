import type { ProposalItem } from './types';

export function calculateItemTotal(quantity: number, unitPrice: number): number {
  return Math.round(quantity * unitPrice * 100) / 100;
}

export function calculateGlobalValue(items: ProposalItem[]): number {
  return Math.round(items.reduce((sum, item) => sum + item.total_price, 0) * 100) / 100;
}

export function calculateMonthlyValue(globalValue: number, months: number = 12): number {
  return Math.round((globalValue / months) * 100) / 100;
}

export function formatCurrencyBRL(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatCNPJ(cnpj: string): string {
  const clean = cnpj.replace(/\D/g, '').padStart(14, '0');
  return `${clean.slice(0,2)}.${clean.slice(2,5)}.${clean.slice(5,8)}/${clean.slice(8,12)}-${clean.slice(12,14)}`;
}

export function formatCPF(cpf: string): string {
  const clean = cpf.replace(/\D/g, '').padStart(11, '0');
  return `${clean.slice(0,3)}.${clean.slice(3,6)}.${clean.slice(6,9)}-${clean.slice(9,11)}`;
}

export function formatDateExtensoBR(date: Date): string {
  const months = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
  ];
  return `${date.getDate()} de ${months[date.getMonth()]} de ${date.getFullYear()}`;
}
