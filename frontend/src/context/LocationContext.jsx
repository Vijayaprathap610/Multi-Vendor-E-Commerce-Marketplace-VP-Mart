import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const KEY = 'vp_pincode';
const LocationContext = createContext(null);
export const isValidPincode = (p) => /^[1-9][0-9]{5}$/.test(String(p ?? ''));

function read() {
  try {
    const v = localStorage.getItem(KEY);
    return isValidPincode(v) ? v : '';
  } catch {
    return '';
  }
}

// The delivery PIN code lives in this browser only. It is sent with product requests to
// calculate delivery estimates; it is not tied to an account.
export function LocationProvider({ children }) {
  const [pincode, setPin] = useState(read);
  const [open, setOpen] = useState(false);
  const setPincode = useCallback((p) => {
    const v = isValidPincode(p) ? p : '';
    setPin(v);
    try {
      v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY);
    } catch {
      /* storage unavailable: keep in memory only */
    }
  }, []);
  const value = useMemo(
    () => ({
      pincode,
      setPincode,
      open,
      openPicker: () => setOpen(true),
      closePicker: () => setOpen(false),
    }),
    [pincode, setPincode, open],
  );
  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export const useLocationPin = () => {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useLocationPin must be used inside <LocationProvider>');
  return ctx;
};
