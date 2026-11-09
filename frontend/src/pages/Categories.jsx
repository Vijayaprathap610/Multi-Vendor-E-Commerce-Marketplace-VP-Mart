import { useMemo, useState } from 'react';
import { Badge, Form } from 'react-bootstrap';
import { FiArrowRight, FiGrid, FiSearch } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import { useCategories } from '../hooks/useCategories.js';
import { useSeo } from '../hooks/useSeo.js';

export default function Categories() {
  useSeo({
    title: 'All Categories',
    description: 'Explore all shopping departments and product categories on VP Mart.',
    path: '/categories',
  });

  const categories = useCategories();
  const [filterQuery, setFilterQuery] = useState('');

  const filteredCategories = useMemo(() => {
    if (!filterQuery.trim()) return categories;
    const q = filterQuery.toLowerCase().trim();
    return categories.filter((c) => {
      const matchParent = c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q);
      const matchChild = c.children?.some(
        (sub) => sub.name.toLowerCase().includes(q) || sub.slug.toLowerCase().includes(q),
      );
      return matchParent || matchChild;
    });
  }, [categories, filterQuery]);

  return (
    <div className="container-xl py-4 vp-categories-page">
      {/* Header & Breadcrumb */}
      <nav aria-label="breadcrumb" className="mb-3">
        <ol className="breadcrumb small mb-1">
          <li className="breadcrumb-item">
            <Link to="/" className="text-decoration-none">
              Home
            </Link>
          </li>
          <li className="breadcrumb-item active" aria-current="page">
            All Categories
          </li>
        </ol>
      </nav>

      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
        <div>
          <h1 className="h2 mb-1 d-flex align-items-center gap-2">
            <FiGrid className="text-primary" /> All Categories
          </h1>
          <p className="text-secondary mb-0">
            Explore {categories.length} department categories and hundreds of products on VP Mart
          </p>
        </div>

        {/* Search / Filter input */}
        <div style={{ maxWidth: 320, width: '100%' }}>
          <div className="input-group">
            <span className="input-group-text bg-white border-end-0">
              <FiSearch className="text-muted" />
            </span>
            <Form.Control
              type="search"
              placeholder="Filter categories or sub-items…"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="border-start-0 ps-1"
            />
          </div>
        </div>
      </div>

      {/* Categories Grid */}
      <div className="row g-4">
        {filteredCategories.map((c) => (
          <div key={c.id} className="col-12 col-md-6 col-lg-4">
            <div className="vp-cat-card h-100 d-flex flex-column">
              {/* Category Header Image */}
              <Link to={`/c/${c.slug}`} className="vp-cat-card-cover position-relative">
                {c.imageUrl ? (
                  <img
                    src={c.imageUrl}
                    alt={c.name}
                    loading="lazy"
                    className="w-100 h-100 object-fit-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="vp-cat-card-placeholder w-100 h-100 d-flex align-items-center justify-content-center bg-dark text-white">
                    <span className="display-6 font-weight-bold">{c.name[0]}</span>
                  </div>
                )}
                <div className="vp-cat-card-overlay d-flex align-items-end p-3">
                  <div>
                    <h2 className="h4 text-white mb-0 text-shadow">{c.name}</h2>
                    {c.children && (
                      <span className="badge bg-light text-dark mt-1">
                        {c.children.length} sub-categories
                      </span>
                    )}
                  </div>
                </div>
              </Link>

              {/* Card Body with Subcategories */}
              <div className="p-3 d-flex flex-column flex-grow-1">
                {c.children && c.children.length > 0 && (
                  <div className="mb-3 flex-grow-1">
                    <div className="text-uppercase text-muted small fw-bold mb-2">
                      Popular Sub-categories
                    </div>
                    <div className="d-flex flex-wrap gap-2">
                      {c.children.map((sub) => (
                        <Link
                          key={sub.id}
                          to={`/c/${sub.slug}`}
                          className="badge bg-light text-dark text-decoration-none border px-2 py-1 vp-subcat-chip"
                        >
                          {sub.imageUrl && (
                            <img
                              src={sub.imageUrl}
                              alt=""
                              width="16"
                              height="16"
                              className="rounded-circle me-1"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          )}
                          {sub.name}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {/* Footer action */}
                <div className="pt-2 border-top mt-auto d-flex justify-content-between align-items-center">
                  <Link
                    to={`/c/${c.slug}`}
                    className="text-decoration-none fw-semibold text-primary d-flex align-items-center gap-1"
                  >
                    Browse {c.name} <FiArrowRight />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredCategories.length === 0 && (
        <div className="text-center py-5">
          <p className="text-secondary h5">No categories match “{filterQuery}”</p>
          <button
            type="button"
            className="btn btn-outline-dark btn-sm mt-2"
            onClick={() => setFilterQuery('')}
          >
            Clear Filter
          </button>
        </div>
      )}
    </div>
  );
}
