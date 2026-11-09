import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NotificationBell from '../components/NotificationBell.jsx';
import { SocketContext } from '../context/SocketContext.jsx';

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => ({ user: { name: 'Asha Rao', email: 'a@example.com' } }),
}));

describe('NotificationBell component', () => {
  it('renders bell icon with badge when there are unread notifications', async () => {
    const mockContext = {
      notifications: [
        { id: '1', title: 'Order Confirmed', body: 'Your order was placed', read: false, createdAt: new Date().toISOString() },
        { id: '2', title: 'Pickup Assigned', body: 'Agent assigned', read: true, createdAt: new Date().toISOString() },
      ],
      unreadCount: 1,
      markAllRead: vi.fn(),
    };

    render(
      <SocketContext.Provider value={mockContext}>
        <NotificationBell />
      </SocketContext.Provider>
    );

    // Unread count badge
    expect(screen.getByText('1')).toBeInTheDocument();

    // Clicking bell opens dropdown
    const btn = screen.getByRole('button', { name: /notifications/i });
    await userEvent.click(btn);

    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('Order Confirmed')).toBeInTheDocument();
    expect(screen.getByText('Your order was placed')).toBeInTheDocument();
  });

  it('allows clicking mark all read', async () => {
    const markAll = vi.fn();
    const mockContext = {
      notifications: [
        { id: '1', title: 'OTP Delivery', body: 'OTP is 123456', read: false, createdAt: new Date().toISOString() },
      ],
      unreadCount: 1,
      markAllRead: markAll,
    };

    render(
      <SocketContext.Provider value={mockContext}>
        <NotificationBell />
      </SocketContext.Provider>
    );

    const btn = screen.getByRole('button', { name: /notifications/i });
    await userEvent.click(btn);

    const markBtn = screen.getByRole('button', { name: /mark all read/i });
    await userEvent.click(markBtn);

    expect(markAll).toHaveBeenCalled();
  });
});
