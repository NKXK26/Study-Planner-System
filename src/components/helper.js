import RequireAuth from '@app/RequireAuth';

export const redirect = (address) => {
  window.location.href = `${process.env.NEXT_PUBLIC_SERVER_URL}${address}`;
};

export const ConditionalRequireAuth = ({ children }) => {
  // Only bypass auth in explicit DEV mode; otherwise require auth
  const isDevMode = process.env.NEXT_PUBLIC_MODE === "DEV";
  return isDevMode ? children : <RequireAuth>{children}</RequireAuth>;
};