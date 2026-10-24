import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProtectedRoute from '../components/ProtectedRoute.jsx';
import { AuthProvider } from '../context/AuthContext.jsx';
import { authService } from '../services/authService.js';

vi.mock('../services/authService.js', () => ({ authService: { me: vi.fn() } }));

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<h1>Login page</h1>} />
          <Route element={<ProtectedRoute />}>
            <Route path="/account" element={<h1>Account page</h1>} />
          </Route>
          <Route element={<ProtectedRoute roles={['admin']} />}>
            <Route path="/admin" element={<h1>Admin page</h1>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );

const signedInAs = (role) =>
  authService.me.mockResolvedValue({ user: { id: '1', name: 'T U', role, status: 'active' } });

beforeEach(() => vi.clearAllMocks());

describe('<ProtectedRoute />', () => {
  it('redirects visitors without a session to the login page', async () => {
    authService.me.mockRejectedValue({ response: { status: 401 } });
    renderAt('/account');
    expect(await screen.findByRole('heading', { name: 'Login page' })).toBeInTheDocument();
  });

  it('lets a signed-in user through', async () => {
    signedInAs('buyer');
    renderAt('/account');
    expect(await screen.findByRole('heading', { name: 'Account page' })).toBeInTheDocument();
  });

  it('shows an access-denied page when the role does not match', async () => {
    signedInAs('buyer');
    renderAt('/admin');
    expect(await screen.findByRole('alert')).toHaveTextContent(/don’t have access/i);
    expect(screen.queryByText('Admin page')).not.toBeInTheDocument();
  });

  it('allows the matching role', async () => {
    signedInAs('admin');
    renderAt('/admin');
    expect(await screen.findByRole('heading', { name: 'Admin page' })).toBeInTheDocument();
  });

  it('shows a loading state while the session is being checked', () => {
    authService.me.mockReturnValue(new Promise(() => {}));
    renderAt('/account');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
