// Tiny shared formatters for admin pages.
export const money = (c) => c == null ? '' :
  (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: c % 100 ? 2 : 0 });

export const shortDate = (v) => v
  ? new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  : '';
