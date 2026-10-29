import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { cartService } from '../services/cartService.js';
import { useAuth } from './AuthContext.jsx';

const CartContext = createContext(null);
const EMPTY = {
  lines: [],
  shipments: [],
  totals: { subtotalPaise: 0, discountPaise: 0, shippingPaise: 0, taxPaise: 0, totalPaise: 0 },
  hasIssues: false,
};

// The server is the only source of prices and totals; this context just mirrors its answer.
export function CartProvider({ children }) {
  const { user } = useAuth();
  const isBuyer = user?.role === 'buyer';
  const [cart, setCart] = useState(EMPTY);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!isBuyer) return setCart(EMPTY);
    setLoading(true);
    try {
      setCart(await cartService.get());
    } catch {
      /* keep the last known cart; the cart page shows its own error */
    } finally {
      setLoading(false);
    }
  }, [isBuyer]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const run = useCallback(async (fn) => {
    const next = await fn();
    setCart(next);
    return next;
  }, []);

  const value = useMemo(
    () => ({
      cart,
      loading,
      isBuyer,
      count: cart.lines.reduce((n, l) => n + l.quantity, 0),
      refresh,
      add: (id, q = 1) => run(() => cartService.add(id, q)),
      setQuantity: (id, q) => run(() => cartService.setQuantity(id, q)),
      remove: (id) => run(() => cartService.remove(id)),
      clear: () => run(() => cartService.clear()),
    }),
    [cart, loading, isBuyer, refresh, run],
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
};
