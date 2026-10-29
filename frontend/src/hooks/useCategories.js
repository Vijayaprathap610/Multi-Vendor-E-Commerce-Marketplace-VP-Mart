import { useEffect, useState } from 'react';
import { catalogService } from '../services/catalogService.js';

// Category tree is shared by the header, footer and filters, so fetch it once per page load.
let cache = null;
let inflight = null;
export function useCategories() {
  const [cats, setCats] = useState(cache || []);
  useEffect(() => {
    if (cache) return;
    inflight ??= catalogService
      .categories()
      .then((c) => (cache = c))
      .finally(() => (inflight = null));
    let alive = true;
    inflight.then((c) => alive && setCats(c)).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return cats;
}
export const resetCategoryCache = () => {
  cache = null;
};
