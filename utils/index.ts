export const formatCurrency = (value: number, currency: string = 'BRL') =>
  new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);

