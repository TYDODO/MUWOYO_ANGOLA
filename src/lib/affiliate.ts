export const formatKwanza = (value: number) => {
  const amount = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  return `${amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')} Kz`;
};

export const getAvailableBalance = (rows: Array<{ amount_kz: number; movement_type: string }>) =>
  rows.reduce((total, row) => {
    switch (row.movement_type) {
      case 'commission':
        return total + row.amount_kz;
      case 'withdrawal_reserved':
        return total - row.amount_kz;
      case 'withdrawal_release':
        return total + row.amount_kz;
      case 'adjustment_credit':
        return total + row.amount_kz;
      case 'adjustment_debit':
        return total - row.amount_kz;
      default:
        return total;
    }
  }, 0);
