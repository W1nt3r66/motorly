export const money = (value) =>
  `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export const number = (value, digits = 1) =>
  Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: digits });

export function mileageEntries(fuelEntries) {
  const sorted = [...fuelEntries].sort((a, b) => a.odometer - b.odometer);

  return sorted
    .slice(1)
    .map((entry, index) => ({
      ...entry,
      mileage: (entry.odometer - sorted[index].odometer) / entry.liters,
    }))
    .filter((entry) => entry.mileage > 0 && entry.mileage < 100);
}

export function getAnalytics(fuelEntries, expenses) {
  const mileage = mileageEntries(fuelEntries);
  const orderedFuel = [...fuelEntries].sort((a, b) => a.odometer - b.odometer);
  const fuelSpend = fuelEntries.reduce((total, item) => total + Number(item.amount), 0);
  const expenseSpend = expenses.reduce((total, item) => total + Number(item.amount), 0);
  const distance = orderedFuel.length > 1
    ? orderedFuel.at(-1).odometer - orderedFuel[0].odometer
    : 0;

  return {
    averageMileage: mileage.length
      ? mileage.reduce((total, item) => total + item.mileage, 0) / mileage.length
      : 0,
    latestMileage: mileage.at(-1)?.mileage || 0,
    fuelSpend,
    expenseSpend,
    totalSpend: fuelSpend + expenseSpend,
    totalLitres: fuelEntries.reduce((total, item) => total + Number(item.liters), 0),
    distance,
    costPerKm: distance ? (fuelSpend + expenseSpend) / distance : 0,
    latestOdometer: orderedFuel.at(-1)?.odometer || 0,
  };
}
