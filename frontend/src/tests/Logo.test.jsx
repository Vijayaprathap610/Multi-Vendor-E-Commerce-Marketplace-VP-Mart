import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import Logo from '../components/Logo.jsx';

const Where = () => <p data-testid="where">{useLocation().pathname}</p>;

describe('<Logo />', () => {
  it('is an accessible link to the homepage', () => {
    render(
      <MemoryRouter>
        <Logo />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: 'VP Mart home' });
    expect(link).toHaveAttribute('href', '/');
  });

  it('navigates client-side to the homepage when clicked', async () => {
    render(
      <MemoryRouter initialEntries={['/somewhere']}>
        <Logo />
        <Routes>
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('where')).toHaveTextContent('/somewhere');
    await userEvent.click(screen.getByRole('link', { name: 'VP Mart home' }));
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/);
  });
});
