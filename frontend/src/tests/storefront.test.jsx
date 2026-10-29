import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import Footer from '../components/Footer.jsx';
import Header, { SECONDARY_NAV } from '../components/Header.jsx';
import LocationModal from '../components/LocationModal.jsx';
import Browse from '../pages/Browse.jsx';
import Cart from '../pages/Cart.jsx';
import Product from '../pages/Product.jsx';
import { catalogService } from '../services/catalogService.js';

const auth = { user: null, logout: vi.fn() };
const cart = {
  cart: null,
  count: 0,
  add: vi.fn(),
  setQuantity: vi.fn(),
  remove: vi.fn(),
  loading: false,
};
const loc = {
  pincode: '',
  setPincode: vi.fn(),
  open: false,
  openPicker: vi.fn(),
  closePicker: vi.fn(),
};
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => auth }));
vi.mock('../context/CartContext.jsx', () => ({ useCart: () => cart }));
vi.mock('../context/LocationContext.jsx', async (orig) => ({
  ...(await orig()),
  useLocationPin: () => loc,
}));
vi.mock('../services/catalogService.js', () => ({
  catalogService: {
    suggest: vi.fn(),
    config: vi.fn(),
    search: vi.fn(),
    category: vi.fn(),
    shop: vi.fn(),
    listing: vi.fn(),
    reviews: vi.fn(),
    related: vi.fn(),
    categories: vi.fn(),
  },
}));
const TREE = [
  {
    id: 'c1',
    name: 'Electronics',
    slug: 'electronics',
    children: [{ id: 's1', name: 'Mobiles', slug: 'mobiles' }],
  },
  { id: 'c2', name: 'Fashion', slug: 'fashion', children: [] },
  { id: 'c3', name: 'Groceries', slug: 'groceries', children: [] },
];
vi.mock('../hooks/useCategories.js', () => ({ useCategories: () => TREE }));

const Where = () => {
  const l = useLocation();
  return <p data-testid="where">{l.pathname + l.search}</p>;
};
const at = (ui, route = '/') =>
  render(
    <MemoryRouter initialEntries={[route]}>
      {ui}
      <Where />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(auth, { user: null });
  Object.assign(cart, { cart: null, count: 0 });
  Object.assign(loc, { pincode: '', open: false });
  catalogService.suggest.mockResolvedValue({ products: [], brands: [], categories: [] });
  catalogService.config.mockResolvedValue({ social: {}, paymentMethods: [] });
});

describe('header and navigation', () => {
  it('shows every required main-navbar element for a visitor', () => {
    at(<Header />);
    expect(screen.getByRole('link', { name: 'VP Mart home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('button', { name: /select pin code/i })).toBeInTheDocument();
    expect(screen.getAllByRole('search')[0]).toBeInTheDocument();
    expect(screen.getByText('IN · ₹ INR')).toBeInTheDocument();
    expect(screen.getByText('Hello, sign in')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /returns/i })).toHaveAttribute('href', '/orders');
    expect(screen.getByRole('link', { name: /cart 0 items/i })).toHaveAttribute('href', '/cart');
  });

  it('has every secondary navigation item with a working destination', () => {
    at(<Header />);
    const nav = screen.getByRole('navigation', { name: 'Shop by' });
    const expected = [
      'All Categories',
      'Trending',
      'Best Sellers',
      'Today’s Deals',
      'Coupons & Offers',
      'Electronics',
      'Mobiles',
      'Fashion',
      'Groceries',
      'Home & Kitchen',
      'Kids & Toys',
      'New Arrivals',
    ];
    for (const label of expected) expect(within(nav).getByText(label)).toBeInTheDocument();
    const hrefs = Object.fromEntries(
      SECONDARY_NAV.map((n) => [
        n.label,
        within(nav).getByRole('link', { name: n.label }).getAttribute('href'),
      ]),
    );
    expect(hrefs).toMatchObject({
      Trending: '/trending',
      'Best Sellers': '/best-sellers',
      'Today’s Deals': '/deals',
      'Coupons & Offers': '/offers',
      Electronics: '/c/electronics',
      Mobiles: '/c/mobiles',
      Fashion: '/c/fashion',
      Groceries: '/c/groceries',
      'Home & Kitchen': '/c/home-kitchen',
      'New Arrivals': '/new-arrivals',
    });
    expect(hrefs['Kids & Toys']).toBe('/search?category=kids-baby,toys-games');
  });

  it('opens All Categories with sub-categories, and closes on Escape', async () => {
    at(<Header />);
    const btn = screen.getByRole('button', { name: /all categories/i });
    await userEvent.click(btn);
    const panel = screen.getByRole('region', { name: 'All categories' });
    expect(within(panel).getByRole('link', { name: 'Mobiles' })).toHaveAttribute(
      'href',
      '/c/mobiles',
    );
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('region', { name: 'All categories' })).not.toBeInTheDocument();
  });

  it('adapts the account menu to the signed-in role', async () => {
    Object.assign(auth, { user: { name: 'Meena Rao', role: 'vendor' } });
    at(<Header />);
    expect(screen.getByText('Hello, Meena')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /returns/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /hello, meena/i }));
    expect(screen.getByRole('link', { name: 'Vendor dashboard' })).toHaveAttribute(
      'href',
      '/vendor',
    );
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('shows the cart count and the chosen delivery PIN', () => {
    Object.assign(cart, { count: 3 });
    Object.assign(loc, { pincode: '600001' });
    at(<Header />);
    expect(screen.getByRole('link', { name: /cart 3 items/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /deliver to 600001/i })).toBeInTheDocument();
  });

  it('searching navigates to the results page with the query and category', async () => {
    at(<Header />);
    const box = screen.getAllByRole('search')[0];
    await userEvent.selectOptions(within(box).getByLabelText('Search category'), 'fashion');
    await userEvent.type(within(box).getByLabelText('Search VP Mart'), 'linen shirt{Enter}');
    expect(screen.getByTestId('where')).toHaveTextContent('/search?q=linen+shirt&category=fashion');
  });

  it('suggests products, brands and categories and navigates with the keyboard', async () => {
    catalogService.suggest.mockResolvedValue({
      products: ['Linen Shirt'],
      brands: [{ name: 'Acme', slug: 'acme' }],
      categories: [{ name: 'Fashion', slug: 'fashion' }],
    });
    at(<Header />);
    const input = screen.getAllByLabelText('Search VP Mart')[0];
    await userEvent.type(input, 'lin');
    const list = await screen.findByRole('listbox', { name: 'Suggestions' });
    expect(within(list).getAllByRole('option')).toHaveLength(3);
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(screen.getByTestId('where')).toHaveTextContent('/search?brand=acme');
  });

  it('validates the PIN code before saving it', async () => {
    Object.assign(loc, { open: true });
    at(<LocationModal />);
    await userEvent.type(screen.getByLabelText('PIN code'), '0123');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Enter a valid 6-digit PIN code')).toBeInTheDocument();
    expect(loc.setPincode).not.toHaveBeenCalled();
    await userEvent.clear(screen.getByLabelText('PIN code'));
    await userEvent.type(screen.getByLabelText('PIN code'), '600001');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(loc.setPincode).toHaveBeenCalledWith('600001');
  });
});

describe('footer', () => {
  it('has every required section and link, with the current year', async () => {
    at(<Footer />);
    for (const h of [
      'About VP Mart',
      'Customer Service',
      'Shopping Categories',
      'Policies',
      'Account',
    ])
      expect(screen.getByRole('heading', { name: h })).toBeInTheDocument();
    const link = (name) => screen.getByRole('link', { name });
    expect(link('About Us')).toHaveAttribute('href', '/about');
    expect(link('Contact Us')).toHaveAttribute('href', '/contact');
    for (const [n, h] of [
      ['Help Center', '/help'],
      ['FAQs', '/faq'],
      ['Shipping and Delivery', '/shipping-delivery'],
      ['Returns and Refunds', '/returns-refunds'],
      ['Order Tracking', '/track-order'],
      ['Privacy Policy', '/privacy'],
      ['Terms and Conditions', '/terms'],
      ['Shipping Policy', '/shipping-policy'],
      ['Cancellation and Refund Policy', '/cancellation-refund-policy'],
      ['Cookie Policy', '/cookies'],
      ['Contact Support', '/contact'],
    ])
      expect(link(n)).toHaveAttribute('href', h);
    expect(screen.getByRole('link', { name: 'Fashion' })).toHaveAttribute('href', '/c/fashion');
    expect(link('My Account')).toHaveAttribute('href', '/login');
    expect(
      screen.getByText(new RegExp(`© ${new Date().getFullYear()} VP Mart`)),
    ).toBeInTheDocument();
  });
  it('shows social links and payment options only when they are configured', async () => {
    const { unmount } = at(<Footer />);
    await waitFor(() => expect(catalogService.config).toHaveBeenCalled());
    expect(screen.queryByLabelText('Social media')).not.toBeInTheDocument();
    expect(screen.queryByText(/Payment options/)).not.toBeInTheDocument();
    unmount();
    catalogService.config.mockResolvedValue({
      social: { instagram: 'https://instagram.com/vpmart' },
      paymentMethods: ['online', 'cod'],
    });
    at(<Footer />);
    expect(await screen.findByRole('link', { name: 'Instagram' })).toHaveAttribute(
      'href',
      'https://instagram.com/vpmart',
    );
    expect(screen.getByText(/Online payment · Cash on Delivery/)).toBeInTheDocument();
  });
});

const item = (n) => ({
  id: `p${n}`,
  slug: `item-${n}`,
  title: `Item ${n}`,
  pricePaise: 10000 * n,
  mrpPaise: 10000 * n,
  discountPercent: 0,
  inStock: true,
  ratingAvg: 0,
  ratingCount: 0,
  vendor: { id: 'v', name: 'Shop' },
  image: null,
});
const results = (over = {}) => ({
  items: [item(1), item(2)],
  total: 2,
  page: 1,
  limit: 24,
  pages: 1,
  facets: {
    brands: [{ id: 'b1', slug: 'acme', name: 'Acme', count: 2 }],
    price: { minPaise: 10000, maxPaise: 20000 },
  },
  source: 'mongodb',
  ...over,
});

describe('browse page', () => {
  const lastQuery = () => catalogService.search.mock.calls.at(-1)[0];
  it('queries the backend from URL params and shows results with a count', async () => {
    catalogService.search.mockResolvedValue(results());
    at(
      <Routes>
        <Route path="/search" element={<Browse />} />
      </Routes>,
      '/search?q=shirt&sort=price_asc&minPrice=100&inStock=true&brand=acme&page=1',
    );
    expect(await screen.findByText('Item 1')).toBeInTheDocument();
    expect(lastQuery()).toMatchObject({
      q: 'shirt',
      sort: 'price_asc',
      minPrice: '100',
      inStock: 'true',
      brand: ['acme'],
      page: 1,
      limit: 24,
    });
    expect(screen.getByText(/1–2 of 2 results/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove filter Acme' })).toBeInTheDocument();
  });

  it('changing sort and brand updates the URL and re-queries', async () => {
    catalogService.search.mockResolvedValue(results());
    at(
      <Routes>
        <Route path="/search" element={<Browse />} />
      </Routes>,
      '/search?q=shirt',
    );
    await screen.findByText('Item 1');
    await userEvent.selectOptions(screen.getByLabelText('Sort by'), 'price_desc');
    await waitFor(() => expect(lastQuery().sort).toBe('price_desc'));
    expect(screen.getByTestId('where')).toHaveTextContent('sort=price_desc');
    const brand = screen.getAllByLabelText(/Acme/)[0];
    await userEvent.click(brand);
    await waitFor(() => expect(lastQuery().brand).toEqual(['acme']));
    await userEvent.click(await screen.findByRole('button', { name: 'Remove filter Acme' }));
    await waitFor(() => expect(lastQuery().brand).toEqual([]));
  });

  it('validates the price range before applying it', async () => {
    catalogService.search.mockResolvedValue(results());
    at(
      <Routes>
        <Route path="/search" element={<Browse />} />
      </Routes>,
      '/search',
    );
    await screen.findByText('Item 1');
    const [min, max] = screen.getAllByLabelText(/(Minimum|Maximum) price/);
    await userEvent.type(min, '900');
    await userEvent.type(max, '100');
    await userEvent.click(screen.getAllByRole('button', { name: 'Apply' })[0]);
    expect(await screen.findByText('Minimum cannot exceed maximum')).toBeInTheDocument();
    await userEvent.clear(min);
    await userEvent.type(min, '50.5');
    await userEvent.click(screen.getAllByRole('button', { name: 'Apply' })[0]);
    await waitFor(() => expect(lastQuery()).toMatchObject({ minPrice: '50.5', maxPrice: '100' }));
  });

  it('shows loading skeletons, an empty state, and an error with retry', async () => {
    let resolve;
    catalogService.search.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    at(
      <Routes>
        <Route path="/search" element={<Browse />} />
      </Routes>,
      '/search?q=zzz',
    );
    expect(screen.getByRole('status', { name: 'Loading products' })).toBeInTheDocument();
    resolve(results({ items: [], total: 0, pages: 0 }));
    expect(await screen.findByText('Nothing matches yet')).toBeInTheDocument();
    expect(screen.getByText(/^No results/)).toBeInTheDocument();
  });

  it('retries after a failure', async () => {
    catalogService.search
      .mockRejectedValueOnce({
        response: { data: { error: { code: 'X', message: 'Server exploded' } } },
      })
      .mockResolvedValue(results());
    at(
      <Routes>
        <Route path="/search" element={<Browse />} />
      </Routes>,
      '/search',
    );
    expect(await screen.findByText('Server exploded')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Item 1')).toBeInTheDocument();
  });

  it('category pages use the slug, show sub-categories and a breadcrumb, and 404 cleanly', async () => {
    catalogService.search.mockResolvedValue(results());
    catalogService.category.mockResolvedValue({
      category: {
        id: 'c1',
        name: 'Electronics',
        slug: 'electronics',
        description: 'Gadgets',
        parent: null,
      },
      parent: null,
      children: [{ id: 's1', name: 'Mobiles', slug: 'mobiles' }],
    });
    const { unmount } = at(
      <Routes>
        <Route path="/c/:slug" element={<Browse />} />
      </Routes>,
      '/c/electronics',
    );
    expect(await screen.findByRole('heading', { name: 'Electronics' })).toBeInTheDocument();
    expect(lastQuery().category).toEqual(['electronics']);
    expect(
      within(screen.getByRole('list', { name: 'Sub-categories' })).getByRole('link', {
        name: 'Mobiles',
      }),
    ).toHaveAttribute('href', '/c/mobiles');
    unmount();
    catalogService.category.mockRejectedValue({
      response: {
        status: 404,
        data: { error: { code: 'NOT_FOUND', message: 'Category not found' } },
      },
    });
    at(
      <Routes>
        <Route path="/c/:slug" element={<Browse />} />
      </Routes>,
      '/c/nope',
    );
    expect(await screen.findByText('Category not found')).toBeInTheDocument();
  });

  it('collection pages request their collection', async () => {
    catalogService.search.mockResolvedValue(results());
    at(<Browse collection="deals" />, '/deals');
    await screen.findByText('Item 1');
    expect(lastQuery().collection).toBe('deals');
    expect(screen.getByRole('heading', { name: 'Today’s deals' })).toBeInTheDocument();
  });
});

const line = (over = {}) => ({
  listingId: 'l1',
  title: 'Linen Shirt',
  slug: 'linen-shirt',
  image: null,
  vendor: { id: 'v1', name: 'Alpha Store' },
  unitPaise: 50000,
  quantity: 2,
  linePaise: 100000,
  available: true,
  maxQuantity: 5,
  issues: [],
  ...over,
});
const cartData = (over = {}) => ({
  lines: [line()],
  shipments: [{ vendorId: 'v1', vendorName: 'Alpha Store', shippingPaise: 4900 }],
  totals: {
    subtotalPaise: 100000,
    discountPaise: 0,
    shippingPaise: 4900,
    taxPaise: 10714,
    taxMode: 'inclusive',
    totalPaise: 104900,
  },
  hasIssues: false,
  ...over,
});

describe('cart page', () => {
  it('shows an empty state', () => {
    Object.assign(cart, { cart: { lines: [], shipments: [], totals: {} } });
    at(<Cart />);
    expect(screen.getByText('Your cart is empty')).toBeInTheDocument();
  });
  it('shows lines and server-calculated totals, with GST labelled as included', () => {
    Object.assign(cart, { cart: cartData() });
    at(<Cart />);
    expect(screen.getByText('Linen Shirt')).toHaveAttribute('href', '/product/l1/linen-shirt');
    expect(screen.getByText('₹1,000.00', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText('₹500 each')).toBeInTheDocument();
    expect(screen.getByText('Shipping · Alpha Store').nextSibling).toHaveTextContent('₹49.00');
    expect(screen.getByText('Total').nextSibling).toHaveTextContent('₹1,049.00');
    expect(screen.getByText('Includes ₹107.14 of GST.')).toBeInTheDocument();
  });
  it('lists GST as its own line in exclusive mode', () => {
    Object.assign(cart, {
      cart: cartData({
        totals: { ...cartData().totals, taxMode: 'exclusive', totalPaise: 115614 },
      }),
    });
    at(<Cart />);
    expect(screen.getByText('GST').nextSibling).toHaveTextContent('₹107.14');
    expect(screen.queryByText(/^Includes/)).not.toBeInTheDocument();
  });
  it('changes quantity and removes items through the server', async () => {
    cart.setQuantity.mockResolvedValue({});
    cart.remove.mockResolvedValue({});
    Object.assign(cart, { cart: cartData() });
    at(<Cart />);
    await userEvent.selectOptions(screen.getByLabelText('Quantity for Linen Shirt'), '4');
    expect(cart.setQuantity).toHaveBeenCalledWith('l1', 4);
    await userEvent.click(screen.getByRole('button', { name: /remove linen shirt/i }));
    expect(cart.remove).toHaveBeenCalledWith('l1');
  });
  it('flags unavailable lines, warns about checkout, and keeps checkout disabled with an explanation', () => {
    Object.assign(cart, {
      cart: cartData({
        hasIssues: true,
        lines: [line({ available: false, issues: ['OUT_OF_STOCK'], maxQuantity: 0 })],
      }),
    });
    at(<Cart />);
    expect(screen.getByText('This item is out of stock')).toBeInTheDocument();
    expect(screen.getByText('Resolve the highlighted items before checkout.')).toBeInTheDocument();
    const checkout = screen.getByRole('button', { name: 'Proceed to checkout' });
    expect(checkout).toBeDisabled();
    expect(checkout).toHaveAccessibleDescription(/not available yet/i);
  });
  it('shows server errors when a quantity change is rejected', async () => {
    cart.setQuantity.mockRejectedValue({
      response: { data: { error: { code: 'INSUFFICIENT_STOCK', message: 'Only 3 available' } } },
    });
    Object.assign(cart, { cart: cartData() });
    at(<Cart />);
    await userEvent.selectOptions(screen.getByLabelText('Quantity for Linen Shirt'), '5');
    expect(await screen.findByRole('alert')).toHaveTextContent('Only 3 available');
  });
});

const detail = (over = {}) => ({
  listing: {
    id: 'l1',
    slug: 'linen-shirt',
    title: 'Linen Shirt',
    brand: { id: 'b', name: 'Acme', slug: 'acme' },
    category: { id: 'c', name: 'Fashion', slug: 'fashion' },
    pricePaise: 49900,
    mrpPaise: 79900,
    discountPercent: 37,
    inStock: true,
    ratingAvg: 4.2,
    ratingCount: 10,
    vendor: { id: 'v', name: 'Alpha Store', slug: 'alpha' },
    images: [],
    attributes: { Material: 'Linen' },
    description: 'A shirt',
    gstPercent: 12,
    taxMode: 'inclusive',
  },
  vendor: { name: 'Alpha Store', slug: 'alpha' },
  delivery: null,
  ...over,
});
const renderProduct = () =>
  at(
    <Routes>
      <Route path="/product/:id/:slug?" element={<Product />} />
      <Route path="/login" element={<h1>Login page</h1>} />
    </Routes>,
    '/product/l1/linen-shirt',
  );

describe('product page purchase flows', () => {
  beforeEach(() => {
    catalogService.listing.mockResolvedValue(detail());
    catalogService.reviews.mockResolvedValue({
      items: [],
      total: 0,
      pages: 0,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    });
    catalogService.related.mockResolvedValue([]);
  });
  it('shows price, discount, tax note, stock, specs and seller', async () => {
    renderProduct();
    expect(await screen.findByRole('heading', { name: 'Linen Shirt' })).toBeInTheDocument();
    expect(screen.getByText('₹499')).toBeInTheDocument();
    expect(screen.getByText('37% off')).toBeInTheDocument();
    expect(screen.getByText('Inclusive of 12% GST.')).toBeInTheDocument();
    expect(screen.getByText('In stock')).toBeInTheDocument();
    expect(screen.getByText('Material')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Alpha Store' })).toHaveAttribute(
      'href',
      '/shop/alpha',
    );
    expect(screen.getByRole('link', { name: 'Acme' })).toHaveAttribute(
      'href',
      '/search?brand=acme',
    );
  });
  it('sends visitors to sign in instead of adding to the cart', async () => {
    renderProduct();
    await userEvent.click(await screen.findByRole('button', { name: 'Add to cart' }));
    expect(await screen.findByRole('heading', { name: 'Login page' })).toBeInTheDocument();
    expect(cart.add).not.toHaveBeenCalled();
  });
  it('tells non-buyers that only buyers can purchase', async () => {
    Object.assign(auth, { user: { role: 'vendor' } });
    renderProduct();
    await userEvent.click(await screen.findByRole('button', { name: 'Add to cart' }));
    expect(await screen.findByText(/Only buyer accounts can purchase/)).toBeInTheDocument();
    expect(cart.add).not.toHaveBeenCalled();
  });
  it('adds the chosen quantity for buyers and offers the cart', async () => {
    Object.assign(auth, { user: { role: 'buyer' } });
    cart.add.mockResolvedValue({});
    renderProduct();
    await userEvent.selectOptions(await screen.findByLabelText('Quantity'), '3');
    await userEvent.click(screen.getByRole('button', { name: 'Add to cart' }));
    expect(cart.add).toHaveBeenCalledWith('l1', 3);
    expect(await screen.findByText(/Added 3 to your cart/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View cart' })).toHaveAttribute('href', '/cart');
  });
  it('shows the server’s reason when stock is insufficient', async () => {
    Object.assign(auth, { user: { role: 'buyer' } });
    cart.add.mockRejectedValue({
      response: { data: { error: { code: 'INSUFFICIENT_STOCK', message: 'Only 2 available' } } },
    });
    renderProduct();
    await userEvent.click(await screen.findByRole('button', { name: 'Add to cart' }));
    expect(await screen.findByText('Only 2 available')).toBeInTheDocument();
  });
  it('disables purchase for out-of-stock products', async () => {
    catalogService.listing.mockResolvedValue(
      detail({ listing: { ...detail().listing, inStock: false } }),
    );
    renderProduct();
    expect(await screen.findByRole('button', { name: 'Out of stock' })).toBeDisabled();
    expect(screen.getByText('Currently unavailable')).toBeInTheDocument();
  });
  it('prompts for a PIN code, then shows the estimated delivery window and shipping', async () => {
    const { unmount } = renderProduct();
    expect(await screen.findByRole('button', { name: /enter your pin code/i })).toBeInTheDocument();
    unmount();
    Object.assign(loc, { pincode: '600001' });
    catalogService.listing.mockResolvedValue(
      detail({
        delivery: {
          serviceable: true,
          earliest: '2026-10-30',
          latest: '2026-11-02',
          shippingChargePaise: 4900,
          freeShippingAbovePaise: 99900,
        },
      }),
    );
    renderProduct();
    const msg = await screen.findByText(/Delivery to/);
    expect(msg.parentElement).toHaveTextContent(/600001 by .*30 Oct.*2 Nov/);
    expect(msg.parentElement).toHaveTextContent('Shipping ₹49, free above ₹999.');
    expect(catalogService.listing).toHaveBeenLastCalledWith('l1', '600001');
  });
  it('explains when the seller cannot deliver to the PIN code', async () => {
    Object.assign(loc, { pincode: '110001' });
    catalogService.listing.mockResolvedValue(
      detail({
        delivery: { serviceable: false, message: 'This seller does not deliver to your PIN code' },
      }),
    );
    renderProduct();
    expect(await screen.findByText(/does not deliver to your PIN code/)).toBeInTheDocument();
  });
  it('shows a friendly message for unavailable products', async () => {
    catalogService.listing.mockRejectedValue({
      response: {
        status: 404,
        data: { error: { code: 'NOT_FOUND', message: 'Product not found' } },
      },
    });
    renderProduct();
    expect(await screen.findByText('This product isn’t available')).toBeInTheDocument();
  });
});
