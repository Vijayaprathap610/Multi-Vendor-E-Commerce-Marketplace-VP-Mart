import { useEffect } from 'react';

const SITE = 'VP Mart';
function setMeta(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!content) return el?.remove();
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

// Sets the document title, description, canonical URL, social tags and optional JSON-LD.
// Private pages pass noindex so they stay out of search engines.
export function useSeo({ title, description, path, image, jsonLd, noindex = false }) {
  const jsonKey = jsonLd ? JSON.stringify(jsonLd) : '';
  useEffect(() => {
    const full = title ? `${title} | ${SITE}` : `${SITE} | Multi-vendor marketplace`;
    document.title = full;
    const origin = window.location.origin;
    const canonical = path ? origin + path : undefined;
    setMeta('name', 'description', description);
    setMeta('name', 'robots', noindex ? 'noindex, nofollow' : undefined);
    setMeta('property', 'og:title', full);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:type', 'website');
    setMeta('property', 'og:image', image);
    setMeta('property', 'og:url', canonical);
    setMeta('name', 'twitter:card', image ? 'summary_large_image' : 'summary');
    let link = document.head.querySelector('link[rel="canonical"]');
    if (canonical) {
      if (!link) {
        link = document.createElement('link');
        link.rel = 'canonical';
        document.head.appendChild(link);
      }
      link.href = canonical;
    } else link?.remove();
    let ld = document.head.querySelector('script[data-vp-jsonld]');
    if (jsonKey) {
      if (!ld) {
        ld = document.createElement('script');
        ld.type = 'application/ld+json';
        ld.dataset.vpJsonld = '1';
        document.head.appendChild(ld);
      }
      ld.textContent = jsonKey;
    } else ld?.remove();
    return () => document.head.querySelector('script[data-vp-jsonld]')?.remove();
  }, [title, description, path, image, jsonKey, noindex]);
}
