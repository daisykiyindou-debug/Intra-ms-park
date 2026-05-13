import { createContext, useContext } from "react";

export const AppContext = createContext({
  me: null,
  employees: [],
  notifications: [],
  refreshNotifications: () => {},
  findEmployee: () => null,
});

export const useApp = () => useContext(AppContext);
