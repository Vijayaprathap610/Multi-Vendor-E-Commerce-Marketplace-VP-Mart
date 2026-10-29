import { Fragment } from 'react';
import { Pagination as BsPagination } from 'react-bootstrap';

export default function Pagination({ page, pages, onChange }) {
  if (pages <= 1) return null;
  const set = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  const nums = [...set].sort((a, b) => a - b);
  return (
    <nav aria-label="Pagination" className="d-flex justify-content-center mt-4">
      <BsPagination className="mb-0">
        <BsPagination.Prev
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          aria-label="Previous page"
        />
        {nums.map((n, i) => (
          <Fragment key={n}>
            {i > 0 && n - nums[i - 1] > 1 && <BsPagination.Ellipsis disabled />}
            <BsPagination.Item
              active={n === page}
              onClick={() => onChange(n)}
              aria-label={`Page ${n}`}
              aria-current={n === page ? 'page' : undefined}
            >
              {n}
            </BsPagination.Item>
          </Fragment>
        ))}
        <BsPagination.Next
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
          aria-label="Next page"
        />
      </BsPagination>
    </nav>
  );
}
