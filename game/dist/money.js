const currency = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', trailingZeroDisplay: 'stripIfInteger',
});

export const formatMoney = amount => currency.format(amount);

// A ride reserves its quoted fare on the tender chosen at boarding.
export function availableCents(sim, method, bank=sim.bank) {
  const balance=method==='card' ? bank?.checking ?? 0 : Math.round(sim.cash*100);
  const held=(sim.ridePaymentMethod || 'cash')===method ? sim.rideHoldCents || 0 : 0;
  return Math.max(0,balance-held);
}

export function purchaseLimit(sim) {
  return Math.max(availableCents(sim,'card'),availableCents(sim,'cash'))/100;
}

export function paymentMethod(sim, amount) {
  const cents=Math.round(amount*100);
  if(!Number.isFinite(amount) || !Number.isSafeInteger(cents) || amount<0)return null;
  const preferred=sim.bank?.preferredPayment==='cash' || !sim.bank ? 'cash' : 'card';
  const other=preferred==='card'?'cash':'card';
  if(availableCents(sim,preferred)>=cents)return preferred;
  return availableCents(sim,other)>=cents ? other : null;
}

export function payFor(sim, amount, label, method=paymentMethod(sim,amount)) {
  const cents=Math.round(amount*100);
  if(!method || !Number.isFinite(amount) || !Number.isSafeInteger(cents) || amount<0 || cents>availableCents(sim,method))return null;
  if(method==='card'){
    if(!sim.bank)return null;
    const clock=sim.bankClock?.() ?? '';
    sim.bank.sync(sim.cash,clock);
    sim.bank.checking-=cents;
    if(cents)sim.bank.addEntry(label,-cents,clock,'Debit card');
  }else if(method==='cash')sim.cash=(Math.round(sim.cash*100)-cents)/100;
  else return null;
  return method;
}
