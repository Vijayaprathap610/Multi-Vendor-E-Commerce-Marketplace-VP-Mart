import env from '../config/env.js';
import Category from '../models/Category.js';
import Listing from '../models/Listing.js';
import { notFound } from '../utils/AppError.js';

const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const site = () => env.CLIENT_ORIGIN.split(',')[0].trim().replace(/\/+$/, '');
export const PUBLIC_PAGES = [
  '/',
  '/about',
  '/contact',
  '/help',
  '/faq',
  '/shipping-delivery',
  '/returns-refunds',
  '/privacy',
  '/terms',
  '/shipping-policy',
  '/cancellation-refund-policy',
  '/cookies',
  '/offers',
  '/search',
];

export async function sitemap(_req, res) {
  const [cats, listings] = await Promise.all([
    Category.find({ isActive: true }).select('slug updatedAt').lean(),
    Listing.find({ isPublic: true })
      .select('slug updatedAt')
      .sort({ updatedAt: -1 })
      .limit(49000)
      .lean(),
  ]);
  const url = (loc, lastmod) =>
    `<url><loc>${esc(site() + loc)}</loc>${lastmod ? `<lastmod>${lastmod.toISOString().slice(0, 10)}</lastmod>` : ''}</url>`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[
    ...PUBLIC_PAGES.map((p) => url(p)),
    ...cats.map((c) => url(`/c/${c.slug}`, c.updatedAt)),
    ...listings.map((l) => url(`/product/${l._id}/${l.slug}`, l.updatedAt)),
  ].join('\n')}\n</urlset>`;
  res.type('application/xml').send(xml);
}

// Plain robots.txt for the API host itself (the storefront ships its own).
export const robots = (_req, res) =>
  res
    .type('text/plain')
    .send(`User-agent: *\nDisallow: /api/\nSitemap: ${env.PUBLIC_API_URL}/sitemap.xml\n`);

const page = ({ title, description, canonical, image, jsonLd, body }) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(canonical)}">
${image ? `<meta property="og:image" content="${esc(image)}">` : ''}<meta name="twitter:card" content="summary_large_image">
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>` : ''}
</head><body>${body}</body></html>`;

// Server-rendered, crawler-friendly HTML for public pages (dynamic rendering). A reverse proxy
// can send crawler user-agents here while people get the single-page app. See README.
export async function seoProduct(req, res) {
  const l = await Listing.findOne({ _id: req.valid.params.id, isPublic: true }).lean();
  if (!l) throw notFound('Product not found');
  const canonical = `${site()}/product/${l._id}/${l.slug}`;
  const inStock = !l.manualOutOfStock && l.stock > 0;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: l.title,
    description: l.description,
    image: (l.images ?? []).map((i) => i.url),
    ...(l.brandName ? { brand: { '@type': 'Brand', name: l.brandName } } : {}),
    sku: l.sku,
    ...(l.ratingCount
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: l.ratingAvg,
            reviewCount: l.ratingCount,
          },
        }
      : {}),
    offers: {
      '@type': 'Offer',
      url: canonical,
      priceCurrency: 'INR',
      price: (l.pricePaise / 100).toFixed(2),
      availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      seller: { '@type': 'Organization', name: l.vendorName },
    },
  };
  res.type('html').send(
    page({
      title: `${l.title} | VP Mart`,
      description: (l.description || `${l.title} sold by ${l.vendorName} on VP Mart`).slice(0, 160),
      canonical,
      image: l.images?.[0]?.url,
      jsonLd,
      body: `<main><h1>${esc(l.title)}</h1><p>Sold by ${esc(l.vendorName)}</p><p>Price: ₹${(l.pricePaise / 100).toFixed(2)}</p><p>${esc(l.description)}</p><a href="${esc(canonical)}">View on VP Mart</a></main>`,
    }),
  );
}

export async function seoCategory(req, res) {
  const c = await Category.findOne({ slug: req.valid.params.slug, isActive: true }).lean();
  if (!c) throw notFound('Category not found');
  const items = await Listing.find({ isPublic: true, categoryPath: c._id })
    .sort({ soldCount: -1 })
    .limit(24)
    .select('title slug pricePaise')
    .lean();
  const canonical = `${site()}/c/${c.slug}`;
  res.type('html').send(
    page({
      title: `${c.name} | VP Mart`,
      description: c.description || `Shop ${c.name} from independent sellers on VP Mart`,
      canonical,
      body: `<main><h1>${esc(c.name)}</h1><ul>${items.map((i) => `<li><a href="${esc(`${site()}/product/${i._id}/${i.slug}`)}">${esc(i.title)}</a> ₹${(i.pricePaise / 100).toFixed(2)}</li>`).join('')}</ul></main>`,
    }),
  );
}
