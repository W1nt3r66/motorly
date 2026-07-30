import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'motorly-tutorial-data';

const initialData = {
  owner: { name: 'Your Name', email: 'you@example.com', phone: '' },
  car: {
    make: 'Hyundai', model: 'Creta', year: '2022', fuelType: 'Petrol',
    registration: 'KA 01 AB 1234', tankCapacity: '50',
  },
  fuelEntries: [
    { id: 'fuel-1', date: '2026-06-01', odometer: 24000, litres: 35, amount: 3550, station: 'IndianOil', photo: '' },
    { id: 'fuel-2', date: '2026-06-16', odometer: 24462, litres: 35.2, amount: 3575, station: 'Shell', photo: '' },
  ],
  expenses: [
    { id: 'expense-1', date: '2026-05-10', odometer: 23500, category: 'Service', vendor: 'Authorised Service Centre', amount: 8500, description: 'Oil, filters and scheduled inspection', photo: '' },
  ],
};

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [data, setData] = useState(initialData);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => saved && setData(JSON.parse(saved)))
      .finally(() => setReady(true));
  }, []);

  function save(nextData) {
    setData(nextData);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextData));
  }

  function addFuel(entry) {
    save({ ...data, fuelEntries: [...data.fuelEntries, entry] });
  }

  function addExpense(entry) {
    save({ ...data, expenses: [...data.expenses, entry] });
  }

  function deleteFuel(id) {
    save({ ...data, fuelEntries: data.fuelEntries.filter((item) => item.id !== id) });
  }

  function deleteExpense(id) {
    save({ ...data, expenses: data.expenses.filter((item) => item.id !== id) });
  }

  function updateGarage(owner, car) {
    save({ ...data, owner, car });
  }

  return (
    <AppContext.Provider value={{ data, ready, addFuel, addExpense, deleteFuel, deleteExpense, updateGarage }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
