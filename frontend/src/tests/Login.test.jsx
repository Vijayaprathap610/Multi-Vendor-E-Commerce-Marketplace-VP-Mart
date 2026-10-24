import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Login from '../pages/Login.jsx';
import { AuthProvider } from '../context/AuthContext.jsx';
import { authService } from '../services/authService.js';

vi.mock('../services/authService.js', () => ({
  authService: { me: vi.fn(), login: vi.fn(), logout: vi.fn() },
}));

const renderLogin = () =>
  render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/account" element={<h1>Account page</h1>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  authService.me.mockRejectedValue({
    response: { status: 401, data: { error: { code: 'UNAUTHENTICATED' } } },
  });
});

describe('<Login />', () => {
  it('shows validation errors and does not call the API for empty input', async () => {
    renderLogin();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(authService.login).not.toHaveBeenCalled();
  });

  it('toggles password visibility with an accessible button', async () => {
    renderLogin();
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
    await userEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(input).toHaveAttribute('type', 'password');
  });

  it('signs in with trimmed email and navigates to the account page', async () => {
    authService.login.mockResolvedValue({
      user: { id: '1', name: 'Asha Rao', role: 'buyer', status: 'active' },
    });
    renderLogin();
    await userEvent.type(screen.getByLabelText('Email'), '  asha@example.com ');
    await userEvent.type(screen.getByLabelText('Password'), 'Sup3rSecret99');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Account page' })).toBeInTheDocument(),
    );
    expect(authService.login).toHaveBeenCalledWith({
      email: 'asha@example.com',
      password: 'Sup3rSecret99',
    });
  });

  it('shows the server error and stays on the page when credentials are wrong', async () => {
    authService.login.mockRejectedValue({
      response: {
        status: 401,
        data: { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } },
      },
    });
    renderLogin();
    await userEvent.type(screen.getByLabelText('Email'), 'asha@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrongpass');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(screen.queryByText('Account page')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  it('reports an unreachable server honestly', async () => {
    authService.login.mockRejectedValue(new Error('Network Error'));
    renderLogin();
    await userEvent.type(screen.getByLabelText('Email'), 'asha@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'whatever123');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/cannot reach the server/i);
  });
});
