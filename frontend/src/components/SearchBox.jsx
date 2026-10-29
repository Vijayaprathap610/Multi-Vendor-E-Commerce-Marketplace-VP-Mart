import { useEffect, useId, useRef, useState } from 'react';
import { FiSearch } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { useDebounce } from '../hooks/useDebounce.js';
import { catalogService } from '../services/catalogService.js';

// Accessible combobox: debounced suggestions, arrow-key navigation, Enter to search.
export default function SearchBox({ categories = [], initialQuery = '', initialCategory = '' }) {
  const navigate = useNavigate();
  const id = useId();
  const [q, setQ] = useState(initialQuery);
  const [cat, setCat] = useState(initialCategory);
  const [open, setOpen] = useState(false);
  const [sugg, setSugg] = useState(null);
  const [active, setActive] = useState(-1);
  const box = useRef(null);
  const dq = useDebounce(q.trim(), 250);

  useEffect(() => {
    let alive = true;
    if (dq.length < 2) return void setSugg(null);
    catalogService
      .suggest(dq)
      .then((s) => alive && setSugg(s))
      .catch(() => alive && setSugg(null));
    return () => {
      alive = false;
    };
  }, [dq]);

  useEffect(() => {
    const away = (e) => !box.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);

  const options = sugg
    ? [
        ...sugg.products.map((t) => ({ label: t, kind: 'Product', go: () => run(t, cat) })),
        ...sugg.brands.map((b) => ({
          label: b.name,
          kind: 'Brand',
          go: () => navigate(`/search?brand=${b.slug}`),
        })),
        ...sugg.categories.map((c) => ({
          label: c.name,
          kind: 'Category',
          go: () => navigate(`/c/${c.slug}`),
        })),
      ]
    : [];

  function run(text, category) {
    const p = new URLSearchParams();
    if (text.trim()) p.set('q', text.trim());
    if (category) p.set('category', category);
    setOpen(false);
    navigate(`/search${p.toString() ? `?${p}` : ''}`);
  }

  function onKey(e) {
    if (e.key === 'ArrowDown' && options.length) {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a + 1) % options.length);
    } else if (e.key === 'ArrowUp' && options.length) {
      e.preventDefault();
      setActive((a) => (a <= 0 ? options.length - 1 : a - 1));
    } else if (e.key === 'Escape') setOpen(false);
    else if (e.key === 'Enter' && open && active >= 0 && options[active]) {
      e.preventDefault();
      setQ(options[active].kind === 'Product' ? options[active].label : q);
      options[active].go();
      setOpen(false);
    }
  }

  return (
    <form
      className="vp-search"
      role="search"
      ref={box}
      onSubmit={(e) => {
        e.preventDefault();
        run(q, cat);
      }}
    >
      <label htmlFor={`${id}-cat`} className="visually-hidden">
        Search category
      </label>
      <select
        id={`${id}-cat`}
        value={cat}
        onChange={(e) => setCat(e.target.value)}
        className="vp-search-cat"
      >
        <option value="">All</option>
        {categories.map((c) => (
          <option key={c.id} value={c.slug}>
            {c.name}
          </option>
        ))}
      </select>
      <label htmlFor={`${id}-q`} className="visually-hidden">
        Search VP Mart
      </label>
      <input
        id={`${id}-q`}
        type="search"
        className="vp-search-input"
        placeholder="Search products, brands and categories"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && options.length > 0}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${id}-o${active}` : undefined}
      />
      <button type="submit" className="vp-search-btn" aria-label="Search">
        <FiSearch aria-hidden="true" />
      </button>
      {open && options.length > 0 && (
        <ul id={`${id}-list`} className="vp-suggest" role="listbox" aria-label="Suggestions">
          {options.map((o, n) => (
            <li
              key={`${o.kind}-${o.label}`}
              id={`${id}-o${n}`}
              role="option"
              aria-selected={n === active}
              className={n === active ? 'on' : ''}
              onMouseDown={(e) => {
                e.preventDefault();
                o.go();
                setOpen(false);
              }}
            >
              <span>{o.label}</span>
              <small>{o.kind}</small>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
