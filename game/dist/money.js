const currency = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', trailingZeroDisplay: 'stripIfInteger',
});

export const formatMoney = amount => currency.format(amount);
