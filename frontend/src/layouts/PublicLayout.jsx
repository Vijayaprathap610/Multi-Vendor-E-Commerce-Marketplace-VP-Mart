import { Outlet } from 'react-router-dom';
import Footer from '../components/Footer.jsx';
import Header from '../components/Header.jsx';
import LocationModal from '../components/LocationModal.jsx';

export default function PublicLayout() {
  return (
    <div className="vp-shell">
      <a href="#main" className="vp-skip">
        Skip to main content
      </a>
      <Header />
      <main id="main" className="vp-content" tabIndex={-1}>
        <Outlet />
      </main>
      <Footer />
      <LocationModal />
    </div>
  );
}
