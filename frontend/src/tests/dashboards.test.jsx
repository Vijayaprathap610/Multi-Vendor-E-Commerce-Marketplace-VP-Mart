import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AdminBanners from '../pages/admin/AdminBanners.jsx';
import AdminCategories from '../pages/admin/AdminCategories.jsx';
import AdminListings from '../pages/admin/AdminListings.jsx';
import AdminVendors from '../pages/admin/AdminVendors.jsx';
import AdminOverview from '../pages/admin/AdminOverview.jsx';
import Home from '../pages/Home.jsx';
import Contact from '../pages/static/Contact.jsx';
import StaticPage from '../pages/static/StaticPage.jsx';
import VendorProducts from '../pages/vendor/VendorProducts.jsx';
import { adminService } from '../services/adminService.js';
import { catalogService } from '../services/catalogService.js';
import { vendorService } from '../services/vendorService.js';

vi.mock('../services/adminService.js', () => ({
  adminService: new Proxy({}, { get: (t, k) => (t[k] ??= vi.fn()) }),
}));
vi.mock('../services/vendorService.js', () => ({
  vendorService: new Proxy({}, { get: (t, k) => (t[k] ??= vi.fn()) }),
  uploadService: { image: vi.fn() },
}));
vi.mock('../services/catalogService.js', () => ({
  catalogService: new Proxy({}, { get: (t, k) => (t[k] ??= vi.fn()) }),
}));
vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => ({ user: { name: 'Asha Rao', email: 'a@example.com', role: 'buyer' } }),
}));

const wrap = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);
beforeEach(() => vi.clearAllMocks());

const banner = (o = {}) => ({
  _id: 'b1',
  id: 'b1',
  title: 'Diwali Sale',
  description: '',
  imageKey: 'banner/a/1.webp',
  imageUrl: '/1.webp',
  destination: '/c/fashion',
  kind: 'festival',
  startAt: '2026-10-01T00:00:00Z',
  endAt: '2026-11-30T00:00:00Z',
  isActive: true,
  live: true,
  clicks: 12,
  sortOrder: 0,
  ...o,
});

describe('admin banners: deletion is real and honestly reported', () => {
  it('asks for confirmation, then deletes and confirms the image was removed', async () => {
    adminService.banners.mockResolvedValue([banner()]);
    adminService.deleteBanner.mockResolvedValue({ deleted: true, image: 'deleted' });
    wrap(<AdminBanners />);
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByText(/permanently/i).length).toBeGreaterThan(0);
    expect(within(dialog).getByText(/cannot be undone/i)).toBeInTheDocument();
    expect(adminService.deleteBanner).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete permanently' }));
    await waitFor(() => expect(adminService.deleteBanner).toHaveBeenCalledWith('b1'));
    expect(await screen.findByText(/permanently deleted along with its image/)).toBeInTheDocument();
    expect(adminService.banners).toHaveBeenCalledTimes(2);
  });
  it('does nothing when cancelled', async () => {
    adminService.banners.mockResolvedValue([banner()]);
    wrap(<AdminBanners />);
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }),
    );
    expect(adminService.deleteBanner).not.toHaveBeenCalled();
  });
  it('tells the truth when the image is kept because another resource uses it', async () => {
    adminService.banners.mockResolvedValue([banner()]);
    adminService.deleteBanner.mockResolvedValue({ deleted: true, image: 'still-referenced' });
    wrap(<AdminBanners />);
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete permanently' }),
    );
    expect(await screen.findByText(/still used elsewhere and was kept/)).toBeInTheDocument();
  });
  it('shows a failure instead of claiming success', async () => {
    adminService.banners.mockResolvedValue([banner()]);
    adminService.deleteBanner.mockRejectedValue({
      response: {
        data: { error: { code: 'DELETE_FAILED', message: 'The banner could not be deleted' } },
      },
    });
    wrap(<AdminBanners />);
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete permanently' }),
    );
    expect(await screen.findByText('The banner could not be deleted')).toBeInTheDocument();
    expect(screen.queryByText(/permanently deleted/)).not.toBeInTheDocument();
  });
  it('shows live/inactive state and an empty state', async () => {
    adminService.banners.mockResolvedValue([]);
    const { unmount } = wrap(<AdminBanners />);
    expect(await screen.findByText('No banners yet')).toBeInTheDocument();
    unmount();
    adminService.banners.mockResolvedValue([
      banner(),
      banner({ _id: 'b2', id: 'b2', title: 'Off', live: false, isActive: false }),
    ]);
    wrap(<AdminBanners />);
    expect(await screen.findByText('live')).toBeInTheDocument();
    expect(screen.getByText('inactive')).toBeInTheDocument();
  });
});

const cat = (o = {}) => ({
  id: 'c1',
  _id: 'c1',
  name: 'Fashion',
  slug: 'fashion',
  parent: null,
  isActive: true,
  listingCount: 4,
  regulation: 'none',
  deviceFields: false,
  gstPercent: 12,
  shipping: { maxZone: 'national', extraDays: 0 },
  ...o,
});
describe('admin categories', () => {
  it('warns that deactivation hides but never deletes, then deactivates', async () => {
    adminService.categories.mockResolvedValue([
      cat(),
      cat({ id: 'c2', name: 'Mens', parent: 'c1', slug: 'mens' }),
    ]);
    adminService.updateCategory.mockResolvedValue({});
    wrap(<AdminCategories />);
    await userEvent.click((await screen.findAllByRole('button', { name: 'Deactivate' }))[0]);
    const dlg = await screen.findByRole('dialog');
    expect(within(dlg).getByText(/Nothing is deleted/)).toBeInTheDocument();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Deactivate' }));
    await waitFor(() =>
      expect(adminService.updateCategory).toHaveBeenCalledWith('c1', { isActive: false }),
    );
  });
  it('reactivates immediately without a warning and shows sub-categories under their parent', async () => {
    adminService.categories.mockResolvedValue([
      cat({ isActive: false }),
      cat({ id: 'c2', name: 'Mens', parent: 'c1', slug: 'mens' }),
    ]);
    adminService.updateCategory.mockResolvedValue({});
    wrap(<AdminCategories />);
    const rows = await screen.findAllByRole('row');
    expect(within(rows[2]).getByText(/Mens/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Activate' }));
    await waitFor(() =>
      expect(adminService.updateCategory).toHaveBeenCalledWith('c1', { isActive: true }),
    );
  });
  it('validates and creates a category', async () => {
    adminService.categories.mockResolvedValue([cat()]);
    adminService.createCategory.mockResolvedValue({});
    wrap(<AdminCategories />);
    await userEvent.click(await screen.findByRole('button', { name: 'New category' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Save' }),
    );
    expect(await screen.findByText('Enter a name')).toBeInTheDocument();
    expect(adminService.createCategory).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText('Name'), 'Musical Instruments');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(adminService.createCategory).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Musical Instruments',
          gstPercent: 18,
          parent: null,
          shipping: { maxZone: 'national', extraDays: 0 },
        }),
      ),
    );
  });
});

const listing = (o = {}) => ({
  id: 'l1',
  title: 'Linen Shirt',
  sku: 'LS-1',
  vendorName: 'Alpha Store',
  category: 'Fashion',
  pricePaise: 50000,
  stock: 5,
  soldCount: 2,
  status: 'active',
  outOfStock: false,
  image: null,
  ...o,
});
describe('admin listings', () => {
  const data = (items) => ({
    items,
    total: items.length,
    page: 1,
    pages: 1,
    metrics: {
      listings: 3,
      uniqueProducts: 2,
      stockUnits: 12,
      unitsSold: 7,
      outOfStock: 1,
      hidden: 0,
    },
  });
  it('shows unique products, listings, stock and units sold as separate numbers', async () => {
    adminService.listings.mockResolvedValue(data([listing()]));
    wrap(<AdminListings />);
    const stat = (label) => screen.getByText(label).parentElement;
    await screen.findByText('Linen Shirt');
    expect(stat('Vendor listings')).toHaveTextContent('3');
    expect(stat('Unique products')).toHaveTextContent('2');
    expect(stat('Units in stock')).toHaveTextContent('12');
    expect(stat('Units sold')).toHaveTextContent('7');
  });
  it('requires a reason to hide a listing, then hides it', async () => {
    adminService.listings.mockResolvedValue(data([listing()]));
    adminService.moderate.mockResolvedValue({});
    wrap(<AdminListings />);
    await userEvent.click(await screen.findByRole('button', { name: 'Hide' }));
    const dlg = await screen.findByRole('dialog');
    const confirm = within(dlg).getByRole('button', { name: 'Hide listing' });
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dlg).getByLabelText(/Reason/), 'Prohibited item');
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    await waitFor(() =>
      expect(adminService.moderate).toHaveBeenCalledWith('l1', 'hide', 'Prohibited item'),
    );
  });
  it('restores hidden listings without asking for a reason', async () => {
    adminService.listings.mockResolvedValue(
      data([listing({ status: 'hidden', hiddenReason: 'Prohibited item' })]),
    );
    adminService.moderate.mockResolvedValue({});
    wrap(<AdminListings />);
    await userEvent.click(await screen.findByRole('button', { name: 'Restore' }));
    await waitFor(() =>
      expect(adminService.moderate).toHaveBeenCalledWith('l1', 'unhide', undefined),
    );
  });
});

describe('admin vendors', () => {
  const vendor = (o = {}) => ({
    id: 'v1',
    name: 'Ravi',
    email: 'r@x.com',
    status: 'pending_approval',
    profile: { shopName: 'Green Basket', submittedAt: '2026-10-20T00:00:00Z' },
    ...o,
  });
  const detail = (v, metrics = { listings: 0, uniqueProducts: 0, stockUnits: 0, hidden: 0 }) => ({
    vendor: {
      ...v,
      profile: {
        businessName: 'GB',
        pickupAddress: { city: 'Coimbatore' },
        payout: { accountHolder: 'Ravi', accountMasked: '••••1234', ifsc: 'HDFC0001234' },
        ...v.profile,
      },
    },
    metrics,
  });
  it('approves a vendor who submitted a profile, showing only masked bank details', async () => {
    adminService.vendors.mockResolvedValue({ items: [vendor()], total: 1, page: 1, pages: 1 });
    adminService.vendor.mockResolvedValue(detail(vendor()));
    adminService.setUserStatus.mockResolvedValue({});
    wrap(<AdminVendors />);
    await userEvent.click(await screen.findByRole('button', { name: 'Review' }));
    expect(await screen.findByText(/••••1234/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Reason/), 'Documents verified');
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() =>
      expect(adminService.setUserStatus).toHaveBeenCalledWith('v1', 'active', 'Documents verified'),
    );
    expect(await screen.findByText('Vendor is now active.')).toBeInTheDocument();
  });
  it('blocks approval until the profile has been submitted', async () => {
    const v = vendor({ profile: { shopName: 'Draft', submittedAt: undefined } });
    adminService.vendors.mockResolvedValue({ items: [v], total: 1, page: 1, pages: 1 });
    adminService.vendor.mockResolvedValue(detail(v));
    wrap(<AdminVendors />);
    await userEvent.click(await screen.findByRole('button', { name: 'Review' }));
    expect(await screen.findByRole('button', { name: 'Approve' })).toBeDisabled();
  });
  it('offers suspend for active vendors and reinstate for suspended ones; surfaces server errors', async () => {
    const v = vendor({ status: 'active' });
    adminService.vendors.mockResolvedValue({ items: [v], total: 1, page: 1, pages: 1 });
    adminService.vendor.mockResolvedValue(detail(v));
    adminService.setUserStatus.mockRejectedValue({
      response: { data: { error: { code: 'BAD_TRANSITION', message: 'Cannot change status' } } },
    });
    wrap(<AdminVendors />);
    await userEvent.click(await screen.findByRole('button', { name: 'Review' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Suspend' }));
    expect(await screen.findByText('Cannot change status')).toBeInTheDocument();
  });
  it('issues warnings only with enough text', async () => {
    const v = vendor({ status: 'active' });
    adminService.vendors.mockResolvedValue({ items: [v], total: 1, page: 1, pages: 1 });
    adminService.vendor.mockResolvedValue(detail(v));
    adminService.warnVendor.mockResolvedValue({});
    wrap(<AdminVendors />);
    await userEvent.click(await screen.findByRole('button', { name: 'Review' }));
    const warn = await screen.findByRole('button', { name: 'Warn' });
    expect(warn).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Warning message'), 'Update licence');
    await userEvent.click(warn);
    await waitFor(() =>
      expect(adminService.warnVendor).toHaveBeenCalledWith('v1', 'Update licence'),
    );
  });
});

describe('admin overview', () => {
  it('renders live figures from the API and does not invent order revenue', async () => {
    adminService.overview.mockResolvedValue({
      users: {
        vendor: { total: 5, active: 3, pending_approval: 2 },
        buyer: { total: 40 },
        delivery_agent: { total: 6, pending_approval: 1 },
      },
      catalog: {
        listings: 35,
        uniqueProducts: 30,
        stockUnits: 1747,
        unitsSold: 4760,
        categories: 18,
        outOfStock: 1,
        hidden: 0,
      },
      promotions: { liveBanners: 3 },
      support: { openMessages: 2 },
    });
    wrap(<AdminOverview />);
    expect(await screen.findByText('Vendor listings')).toBeInTheDocument();
    expect(screen.getByText('Vendor listings').parentElement).toHaveTextContent('35');
    expect(screen.getByText('Unique products').parentElement).toHaveTextContent('30');
    expect(screen.getByText('Pending approval').parentElement).toHaveTextContent('2');
    expect(screen.getByText('Live banners').parentElement).toHaveTextContent('3');
    expect(screen.queryByText(/Gross sales/i)).not.toBeInTheDocument();
  });
});

describe('vendor products', () => {
  const row = (o = {}) => ({
    id: 'l1',
    title: 'Linen Shirt',
    sku: 'LS-1',
    categoryName: 'Fashion',
    pricePaise: 50000,
    mrpPaise: 60000,
    stock: 5,
    soldCount: 0,
    status: 'active',
    outOfStock: false,
    images: [],
    ...o,
  });
  const page = (items) => ({ items, total: items.length, page: 1, pages: 1 });
  it('shows an empty state with a call to action', async () => {
    vendorService.listings.mockResolvedValue(page([]));
    wrap(<VendorProducts />);
    expect(await screen.findByText('No products found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add your first product' })).toHaveAttribute(
      'href',
      '/vendor/products/new',
    );
  });
  it('edits stock inline and only saves valid whole numbers', async () => {
    vendorService.listings.mockResolvedValue(page([row()]));
    vendorService.update.mockResolvedValue({});
    wrap(<VendorProducts />);
    const input = await screen.findByLabelText('Stock for Linen Shirt');
    await userEvent.clear(input);
    await userEvent.type(input, '2.5');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('whole number');
    expect(vendorService.update).not.toHaveBeenCalled();
    await userEvent.clear(input);
    await userEvent.type(input, '12');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(vendorService.update).toHaveBeenCalledWith('l1', { stock: 12 }));
  });
  it('explains that stopping sale keeps records, then stops it', async () => {
    vendorService.listings.mockResolvedValue(page([row()]));
    vendorService.stopSelling.mockResolvedValue({});
    wrap(<VendorProducts />);
    await userEvent.click(await screen.findByRole('button', { name: 'Stop selling' }));
    const dlg = await screen.findByRole('dialog');
    expect(within(dlg).getByText(/Past orders and payment records are kept/)).toBeInTheDocument();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Stop selling' }));
    await waitFor(() => expect(vendorService.stopSelling).toHaveBeenCalledWith('l1'));
  });
  it('shows the admin’s reason for hidden listings and no resume button', async () => {
    vendorService.listings.mockResolvedValue(
      page([row({ status: 'hidden', hiddenReason: 'Prohibited item' })]),
    );
    wrap(<VendorProducts />);
    expect(await screen.findByText('Prohibited item')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resume' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Stop selling' })).not.toBeInTheDocument();
  });
});

describe('home page', () => {
  const sec = (n) =>
    Array.from({ length: n }, (_, i) => ({
      id: `p${i}`,
      slug: `s${i}`,
      title: `Prod ${i}`,
      pricePaise: 100,
      mrpPaise: 100,
      inStock: true,
      ratingAvg: 0,
      ratingCount: 0,
      vendor: { id: 'v', name: 'S' },
      image: null,
    }));
  it('shows an honest empty state when no products exist', async () => {
    catalogService.banners.mockResolvedValue([]);
    catalogService.home.mockResolvedValue({
      featuredCategories: [],
      popularBrands: [],
      trending: [],
      bestSellers: [],
      newArrivals: [],
      todaysDeals: [],
      popularPicks: [],
    });
    wrap(<Home />);
    expect(await screen.findByText('The marketplace is just getting started')).toBeInTheDocument();
  });
  it('renders only the sections that have data', async () => {
    catalogService.banners.mockResolvedValue([]);
    catalogService.home.mockResolvedValue({
      featuredCategories: [{ id: 'c', name: 'Fashion', slug: 'fashion', listingCount: 6 }],
      popularBrands: [{ id: 'b', name: 'Acme', slug: 'acme' }],
      trending: [],
      bestSellers: [],
      newArrivals: sec(2),
      todaysDeals: sec(1),
      popularPicks: [],
    });
    wrap(<Home />);
    expect(await screen.findByRole('heading', { name: 'New arrivals' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Today’s deals' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Trending now' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Best sellers' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Fashion/ })).toHaveAttribute('href', '/c/fashion');
    expect(screen.getByRole('link', { name: 'Acme' })).toHaveAttribute(
      'href',
      '/search?brand=acme',
    );
    expect(screen.getByRole('link', { name: 'View offers' })).toHaveAttribute('href', '/offers');
  });
  it('shows an error with retry when the catalogue cannot be loaded', async () => {
    catalogService.banners.mockResolvedValue([]);
    catalogService.home.mockRejectedValueOnce(new Error('Network Error')).mockResolvedValue({
      featuredCategories: [],
      popularBrands: [],
      trending: [],
      bestSellers: [],
      newArrivals: sec(1),
      todaysDeals: [],
      popularPicks: [],
    });
    wrap(<Home />);
    expect(await screen.findByText(/Cannot reach the server/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'New arrivals' })).toBeInTheDocument();
  });
});

describe('static pages and contact', () => {
  it('shows a legal-review notice on policy pages only', () => {
    const { unmount } = wrap(<StaticPage page="privacy" />);
    expect(screen.getByRole('heading', { name: 'Privacy policy' })).toBeInTheDocument();
    expect(screen.getByText(/reviewed by a legal professional/)).toBeInTheDocument();
    unmount();
    wrap(<StaticPage page="about" />);
    expect(screen.queryByText(/reviewed by a legal professional/)).not.toBeInTheDocument();
  });
  it('renders FAQs as an accordion and keeps copy free of invented contact details', async () => {
    wrap(<StaticPage page="faq" />);
    await userEvent.click(screen.getByRole('button', { name: /Do I need an account to browse/ }));
    expect(screen.getByText(/You can browse and search without signing in/)).toBeVisible();
    const text = document.body.textContent;
    expect(text).not.toMatch(/@[a-z0-9-]+\.(com|in)|\+91|\d{10}|Pvt\.? Ltd/i);
  });
  it('validates and sends the contact form', async () => {
    catalogService.contact.mockResolvedValue({ ok: true });
    wrap(<Contact />);
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(await screen.findByText('Please write at least 10 characters')).toBeInTheDocument();
    expect(catalogService.contact).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText('Message'), 'Where is my parcel please?');
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() =>
      expect(catalogService.contact).toHaveBeenCalledWith({
        name: 'Asha Rao',
        email: 'a@example.com',
        message: 'Where is my parcel please?',
      }),
    );
    expect(await screen.findByText(/your message has been sent/)).toBeInTheDocument();
  });
  it('shows a server failure without pretending the message was sent', async () => {
    catalogService.contact.mockRejectedValue({
      response: {
        data: {
          error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please try again later.' },
        },
      },
    });
    wrap(<Contact />);
    await userEvent.type(screen.getByLabelText('Message'), 'A long enough message here');
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts');
    expect(screen.queryByText(/has been sent/)).not.toBeInTheDocument();
  });
});
