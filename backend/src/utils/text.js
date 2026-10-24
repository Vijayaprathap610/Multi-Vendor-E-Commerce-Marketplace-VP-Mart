export const slugify = (s) =>
  String(s)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'item';

export const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const normKey = (...parts) =>
  parts
    .map((p) =>
      String(p ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' '),
    )
    .join('|');
