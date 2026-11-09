import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute.jsx';
const DashboardLayout = lazy(() => import('./layouts/DashboardLayout.jsx'));
import PublicLayout from './layouts/PublicLayout.jsx';
const Account = lazy(() => import('./pages/Account.jsx'));
const Browse = lazy(() => import('./pages/Browse.jsx'));
const Categories = lazy(() => import('./pages/Categories.jsx'));
const Cart = lazy(() => import('./pages/Cart.jsx'));
const Checkout = lazy(() => import('./pages/Checkout.jsx'));
const OrderDetail = lazy(() => import('./pages/OrderDetail.jsx'));
import ForgotPassword from './pages/ForgotPassword.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import NotFound from './pages/NotFound.jsx';
const Offers = lazy(() => import('./pages/Offers.jsx'));
const Orders = lazy(() => import('./pages/Orders.jsx'));
const Product = lazy(() => import('./pages/Product.jsx'));
import Register from './pages/Register.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
// Admin pages
const AdminBanners = lazy(() => import('./pages/admin/AdminBanners.jsx'));
const AdminBrands = lazy(() => import('./pages/admin/AdminBrands.jsx'));
const AdminCategories = lazy(() => import('./pages/admin/AdminCategories.jsx'));
const AdminCoupons = lazy(() => import('./pages/admin/AdminCoupons.jsx'));
const AdminListings = lazy(() => import('./pages/admin/AdminListings.jsx'));
const AdminMessages = lazy(() => import('./pages/admin/AdminMessages.jsx'));
const AdminOrders = lazy(() => import('./pages/admin/AdminOrders.jsx'));
const AdminOverview = lazy(() => import('./pages/admin/AdminOverview.jsx'));
const AdminReports = lazy(() => import('./pages/admin/AdminReports.jsx'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings.jsx'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers.jsx'));
const AdminVendors = lazy(() => import('./pages/admin/AdminVendors.jsx'));
const AdminDeliveryAgents = lazy(() => import('./pages/admin/AdminDeliveryAgents.jsx'));
// Static pages
const Contact = lazy(() => import('./pages/static/Contact.jsx'));
const StaticPage = lazy(() => import('./pages/static/StaticPage.jsx'));
// Vendor pages
const ProductForm = lazy(() => import('./pages/vendor/ProductForm.jsx'));
const VendorOrders = lazy(() => import('./pages/vendor/VendorOrders.jsx'));
const VendorOverview = lazy(() => import('./pages/vendor/VendorOverview.jsx'));
const VendorProducts = lazy(() => import('./pages/vendor/VendorProducts.jsx'));
const VendorProfile = lazy(() => import('./pages/vendor/VendorProfile.jsx'));
const VendorSettlements = lazy(() => import('./pages/vendor/VendorSettlements.jsx'));
// Delivery agent pages
const AgentDashboard = lazy(() => import('./pages/agent/AgentDashboard.jsx'));
const AgentAvailable = lazy(() => import('./pages/agent/AgentAvailable.jsx'));
const AgentDeliveries = lazy(() => import('./pages/agent/AgentDeliveries.jsx'));
const AgentEarnings = lazy(() => import('./pages/agent/AgentEarnings.jsx'));

const VENDOR_NAV = [
  ['/vendor', 'Overview', true],
  ['/vendor/profile', 'Shop profile'],
  ['/vendor/products', 'Products'],
  ['/vendor/orders', 'Orders'],
  ['/vendor/settlements', 'Settlements'],
];
const ADMIN_NAV = [
  ['/admin', 'Overview', true],
  ['/admin/vendors', 'Vendors'],
  ['/admin/users', 'Users'],
  ['/admin/listings', 'Listings'],
  ['/admin/categories', 'Categories'],
  ['/admin/brands', 'Brands'],
  ['/admin/banners', 'Banners & ads'],
  ['/admin/coupons', 'Coupons'],
  ['/admin/orders', 'Orders & payments'],
  ['/admin/reports', 'Reports'],
  ['/admin/settings', 'Settings'],
  ['/admin/messages', 'Messages'],
  ['/admin/delivery-agents', 'Delivery agents'],
];
const AGENT_NAV = [
  ['/agent', 'Dashboard', true],
  ['/agent/available', 'Available pickups'],
  ['/agent/deliveries', 'My deliveries'],
  ['/agent/earnings', 'Earnings'],
];
const STATIC = [
  'about',
  'help',
  'faq',
  'shipping-delivery',
  'returns-refunds',
  'cancellation-refund-policy',
  'shipping-policy',
  'privacy',
  'terms',
  'cookies',
];

export default function App() {
  return (
    <Suspense
      fallback={
        <div className="py-5 text-center" role="status">
          <span className="visually-hidden">Loading…</span>
        </div>
      }
    >
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Vendor dashboard */}
        <Route element={<ProtectedRoute roles={['vendor']} />}>
          <Route
            path="/vendor"
            element={<DashboardLayout title="Vendor dashboard" nav={VENDOR_NAV} />}
          >
            <Route index element={<VendorOverview />} />
            <Route path="profile" element={<VendorProfile />} />
            <Route path="products" element={<VendorProducts />} />
            <Route path="products/new" element={<ProductForm />} />
            <Route path="products/:id" element={<ProductForm />} />
            <Route path="orders" element={<VendorOrders />} />
            <Route path="settlements" element={<VendorSettlements />} />
          </Route>
        </Route>

        {/* Admin dashboard */}
        <Route element={<ProtectedRoute roles={['admin']} />}>
          <Route
            path="/admin"
            element={<DashboardLayout title="Admin dashboard" nav={ADMIN_NAV} />}
          >
            <Route index element={<AdminOverview />} />
            <Route path="vendors" element={<AdminVendors />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="listings" element={<AdminListings />} />
            <Route path="categories" element={<AdminCategories />} />
            <Route path="brands" element={<AdminBrands />} />
            <Route path="banners" element={<AdminBanners />} />
            <Route path="coupons" element={<AdminCoupons />} />
            <Route path="orders" element={<AdminOrders />} />
            <Route path="reports" element={<AdminReports />} />
            <Route path="settings" element={<AdminSettings />} />
            <Route path="messages" element={<AdminMessages />} />
            <Route path="delivery-agents" element={<AdminDeliveryAgents />} />
          </Route>
        </Route>

        {/* Delivery agent dashboard */}
        <Route element={<ProtectedRoute roles={['delivery_agent']} />}>
          <Route
            path="/agent"
            element={<DashboardLayout title="Delivery agent" nav={AGENT_NAV} />}
          >
            <Route index element={<AgentDashboard />} />
            <Route path="available" element={<AgentAvailable />} />
            <Route path="deliveries" element={<AgentDeliveries />} />
            <Route path="earnings" element={<AgentEarnings />} />
          </Route>
        </Route>

        {/* Public + buyer routes */}
        <Route element={<PublicLayout />}>
          <Route index element={<Home />} />
          <Route path="/search" element={<Browse />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/c/:slug" element={<Browse />} />
          <Route path="/shop/:slug" element={<Browse shop />} />
          <Route path="/trending" element={<Browse collection="trending" />} />
          <Route path="/best-sellers" element={<Browse collection="best-sellers" />} />
          <Route path="/deals" element={<Browse collection="deals" />} />
          <Route path="/new-arrivals" element={<Browse collection="new-arrivals" />} />
          <Route path="/offers" element={<Offers />} />
          <Route path="/product/:id/:slug?" element={<Product />} />
          <Route path="/contact" element={<Contact />} />
          {STATIC.map((p) => (
            <Route key={p} path={`/${p}`} element={<StaticPage page={p} />} />
          ))}
          <Route element={<ProtectedRoute roles={['buyer', 'admin']} />}>
            <Route path="/cart" element={<Cart />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/orders/:id" element={<OrderDetail />} />
            <Route path="/track-order" element={<Orders tracking />} />
          </Route>
          <Route element={<ProtectedRoute />}>
            <Route path="/account" element={<Account />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
