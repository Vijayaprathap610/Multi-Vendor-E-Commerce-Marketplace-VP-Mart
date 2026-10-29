import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import BannerSlider from '../components/BannerSlider.jsx';
import ImageUploader from '../components/ImageUploader.jsx';
import Pagination from '../components/Pagination.jsx';
import ProductCard from '../components/ProductCard.jsx';
import { useSeo } from '../hooks/useSeo.js';
import { catalogService } from '../services/catalogService.js';
import { uploadService } from '../services/vendorService.js';

vi.mock('../services/catalogService.js', () => ({
  catalogService: { bannerClick: vi.fn(), suggest: vi.fn() },
}));
vi.mock('../services/vendorService.js', () => ({ uploadService: { image: vi.fn() } }));

const product = (over = {}) => ({
  id: 'p1',
  slug: 'linen-shirt',
  title: 'Linen Shirt',
  pricePaise: 49900,
  mrpPaise: 79900,
  discountPercent: 37,
  inStock: true,
  ratingAvg: 4.2,
  ratingCount: 10,
  vendor: { id: 'v', name: 'Alpha Store' },
  image: null,
  ...over,
});
const inRouter = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('<ProductCard />', () => {
  it('shows price, discount, rating, seller and links to the product page', () => {
    inRouter(<ProductCard product={product()} />);
    expect(screen.getByText('₹499')).toBeInTheDocument();
    expect(screen.getByText('37% off')).toBeInTheDocument();
    expect(screen.getByText('Sold by Alpha Store')).toBeInTheDocument();
    expect(screen.getByLabelText(/Rated 4.2 out of 5 from 10 ratings/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Linen Shirt' })).toHaveAttribute(
      'href',
      '/product/p1/linen-shirt',
    );
  });
  it('marks unavailable, low-stock and prescription items', () => {
    const { rerender } = inRouter(<ProductCard product={product({ inStock: false })} />);
    expect(screen.getByText('Out of stock')).toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <ProductCard product={product({ stockLeft: 3 })} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Only 3 left')).toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <ProductCard product={product({ prescriptionRequired: true })} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Rx')).toBeInTheDocument();
  });
  it('shows no discount for full-price items, and a placeholder without an image', () => {
    inRouter(
      <ProductCard product={product({ mrpPaise: 49900, discountPercent: 0, ratingCount: 0 })} />,
    );
    expect(screen.queryByText(/% off/)).not.toBeInTheDocument();
    expect(screen.getByText('No ratings yet')).toBeInTheDocument();
    expect(screen.getByText('LS')).toBeInTheDocument();
  });
  it('lazy-loads real images with dimensions to prevent layout shift', () => {
    inRouter(
      <ProductCard product={product({ image: { url: '/a.webp', thumbUrl: '/a.thumb.webp' } })} />,
    );
    const img = document.querySelector('img');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('width');
    expect(img).toHaveAttribute('height');
  });
});

describe('<Pagination />', () => {
  it('renders nothing for a single page and navigates otherwise', async () => {
    const { container, rerender } = render(<Pagination page={1} pages={1} onChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
    const onChange = vi.fn();
    rerender(<Pagination page={2} pages={5} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText('Next page'));
    expect(onChange).toHaveBeenCalledWith(3);
    await userEvent.click(screen.getByLabelText('Page 5'));
    expect(onChange).toHaveBeenCalledWith(5);
    expect(screen.getByLabelText('Page 2')).toHaveAttribute('aria-current', 'page');
  });
  it('disables previous on the first page and next on the last', () => {
    const { rerender } = render(<Pagination page={1} pages={3} onChange={() => {}} />);
    expect(screen.getByLabelText('Previous page').closest('li')).toHaveClass('disabled');
    rerender(<Pagination page={3} pages={3} onChange={() => {}} />);
    expect(screen.getByLabelText('Next page').closest('li')).toHaveClass('disabled');
  });
});

describe('<BannerSlider />', () => {
  const banners = [
    {
      id: 'b1',
      title: 'Festive Sale',
      description: 'Up to 40% off',
      imageUrl: '/1.webp',
      ctaLabel: 'Shop',
      destination: '/c/fashion',
    },
    {
      id: 'b2',
      title: 'New Phones',
      imageUrl: '/2.webp',
      destination: 'https://example.com/phones',
    },
  ];
  beforeEach(() => {
    vi.clearAllMocks();
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} });
  });
  it('renders nothing without banners', () => {
    const { container } = inRouter(<BannerSlider banners={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
  it('links internal banners with the router and external ones safely, and records clicks', async () => {
    inRouter(<BannerSlider banners={banners} />);
    const internal = screen.getByRole('link', { name: /Promotion 1 of 2: Festive Sale/ });
    expect(internal).toHaveAttribute('href', '/c/fashion');
    const external = screen.getByRole('link', { name: /Promotion 2 of 2: New Phones/ });
    expect(external).toHaveAttribute('href', 'https://example.com/phones');
    expect(external).toHaveAttribute('rel', 'noopener noreferrer');
    expect(external).toHaveAttribute('target', '_blank');
    await userEvent.click(internal);
    expect(catalogService.bannerClick).toHaveBeenCalledWith('b1');
  });
  it('has next, previous and pause controls and shows the active slide', async () => {
    inRouter(<BannerSlider banners={banners} />);
    const track = document.querySelector('.vp-hero-track');
    expect(track.style.transform).toBe('translateX(-0%)');
    await userEvent.click(screen.getByLabelText('Next promotion'));
    expect(track.style.transform).toBe('translateX(-100%)');
    await userEvent.click(screen.getByLabelText('Next promotion'));
    expect(track.style.transform).toBe('translateX(-0%)');
    await userEvent.click(screen.getByLabelText('Previous promotion'));
    expect(track.style.transform).toBe('translateX(-100%)');
    await userEvent.click(screen.getByLabelText('Pause automatic rotation'));
    expect(screen.getByLabelText('Start automatic rotation')).toBeInTheDocument();
  });
  it('auto-advances, and never does when the user prefers reduced motion', () => {
    vi.useFakeTimers();
    try {
      inRouter(<BannerSlider banners={banners} interval={1000} />);
      const track = document.querySelector('.vp-hero-track');
      act(() => vi.advanceTimersByTime(1100));
      expect(track.style.transform).toBe('translateX(-100%)');
    } finally {
      vi.useRealTimers();
    }
    vi.useFakeTimers();
    try {
      window.matchMedia = vi
        .fn()
        .mockReturnValue({ matches: true, addEventListener() {}, removeEventListener() {} });
      document.body.innerHTML = '';
      inRouter(<BannerSlider banners={banners} interval={1000} />);
      const track = document.querySelector('.vp-hero-track');
      act(() => vi.advanceTimersByTime(5000));
      expect(track.style.transform).toBe('translateX(-0%)');
      expect(screen.getByLabelText('Start automatic rotation')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('<ImageUploader />', () => {
  beforeEach(() => vi.clearAllMocks());
  const file = (name, type, size = 100) => new File([new Uint8Array(size)], name, { type });
  const upload = (items = [], onChange = vi.fn(), props = {}) => {
    render(
      <ImageUploader purpose="listing" items={items} onChange={onChange} max={3} {...props} />,
    );
    return { onChange, input: document.querySelector('input[type=file]') };
  };
  it('uploads valid images and reports them to the form', async () => {
    uploadService.image.mockResolvedValue({ key: 'listing/u/1.webp', url: '/1', thumbUrl: '/1t' });
    const { onChange, input } = upload();
    await userEvent.upload(input, file('a.png', 'image/png'));
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith([
        { key: 'listing/u/1.webp', url: '/1', thumbUrl: '/1t', alt: '' },
      ]),
    );
    expect(uploadService.image).toHaveBeenCalledWith(expect.any(File), 'listing');
  });
  it('rejects wrong types and oversize files in the browser, without calling the server', async () => {
    const { input } = upload();
    await userEvent.upload(input, file('a.gif', 'image/gif'), { applyAccept: false });
    expect(await screen.findByRole('alert')).toHaveTextContent(/JPEG, PNG or WebP/);
    await userEvent.upload(input, file('big.png', 'image/png', 5 * 1024 * 1024 + 1));
    expect(await screen.findByRole('alert')).toHaveTextContent(/5 MB/);
    expect(uploadService.image).not.toHaveBeenCalled();
  });
  it('shows the server’s rejection message', async () => {
    uploadService.image.mockRejectedValue({
      response: { data: { error: { code: 'BAD_IMAGE', message: 'File is not a valid image' } } },
    });
    const { input } = upload();
    await userEvent.upload(input, file('fake.png', 'image/png'));
    expect(await screen.findByRole('alert')).toHaveTextContent('File is not a valid image');
  });
  it('lets users remove images and edit alt text', async () => {
    const items = [{ key: 'k1', url: '/1', thumbUrl: '/1t', alt: '' }];
    const { onChange } = upload(items, vi.fn(), { withAlt: true });
    await userEvent.type(screen.getByLabelText('Description for image 1'), 'F');
    expect(onChange).toHaveBeenLastCalledWith([{ ...items[0], alt: 'F' }]);
    await userEvent.click(screen.getByLabelText('Remove image 1'));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
  it('hides the picker once the maximum is reached', () => {
    upload([1, 2, 3].map((n) => ({ key: `k${n}`, url: '/x' })));
    expect(document.querySelector('input[type=file]')).toBeNull();
  });
});

describe('useSeo', () => {
  it('sets title, description, canonical, social tags and JSON-LD, and cleans up', () => {
    const { unmount } = renderHook(() =>
      useSeo({
        title: 'Linen Shirt',
        description: 'A shirt',
        path: '/product/1/linen',
        image: 'http://x/i.webp',
        jsonLd: { '@type': 'Product', name: 'Linen Shirt' },
      }),
    );
    expect(document.title).toBe('Linen Shirt | VP Mart');
    expect(document.querySelector('meta[name="description"]').content).toBe('A shirt');
    expect(document.querySelector('link[rel="canonical"]').href).toBe(
      `${window.location.origin}/product/1/linen`,
    );
    expect(document.querySelector('meta[property="og:image"]').content).toBe('http://x/i.webp');
    expect(JSON.parse(document.querySelector('script[data-vp-jsonld]').textContent).name).toBe(
      'Linen Shirt',
    );
    unmount();
    expect(document.querySelector('script[data-vp-jsonld]')).toBeNull();
  });
  it('marks private pages noindex', () => {
    renderHook(() => useSeo({ title: 'Cart', noindex: true }));
    expect(document.querySelector('meta[name="robots"]').content).toMatch(/noindex/);
  });
});
