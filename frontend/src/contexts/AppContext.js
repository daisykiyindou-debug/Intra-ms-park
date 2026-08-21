import { createContext, useContext } from "react";

export const AppContext = createContext({
  me: null,
  employees: [],
  notifications: [],
  refreshMe: () => {},
  refreshEmployees: () => {},
  refreshNotifications: () => {},
  findEmployee: () => null,
});

/** Return true if `me` has any of the passed permission keys, or is a full admin. */
export const hasPermission = (me, ...keys) => {
  if (!me) return false;
  if (me.is_admin) return true;
  const perms = new Set(me.permissions || []);
  if (perms.has("full_admin")) return true;
  return keys.some((k) => perms.has(k));
};

export const useApp = () => useContext(AppContext);
