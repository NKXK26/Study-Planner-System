'use client';

import RequireAuth from '@app/RequireAuth';
import { useRole } from '@app/context/RoleContext';

export const redirect = (address) => {
  window.location.href = `${process.env.NEXT_PUBLIC_SERVER_URL}${address}`;
};

export const ConditionalRequireAuth = ({ children }) => {
  const { localPlanner } = useRole();
  const isDevMode = process.env.NEXT_PUBLIC_MODE === "DEV";
  return localPlanner || isDevMode ? children : <RequireAuth>{children}</RequireAuth>;
};
