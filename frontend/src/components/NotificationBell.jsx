import { useState, useRef, useEffect } from 'react';
import { Dropdown, Badge, Button } from 'react-bootstrap';
import { FaBell } from 'react-icons/fa';
import { useSocket } from '../context/SocketContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function NotificationBell() {
  const { user } = useAuth();
  const { notifications, unreadCount, markAllRead } = useSocket();

  if (!user) return null;

  return (
    <Dropdown align="end" className="d-inline-block me-2">
      <Dropdown.Toggle
        as="button"
        className="btn btn-link text-white text-decoration-none position-relative p-2"
        id="notification-dropdown"
        aria-label="Notifications"
      >
        <FaBell size={18} />
        {unreadCount > 0 && (
          <Badge
            pill
            bg="danger"
            className="position-absolute top-0 start-100 translate-middle"
            style={{ fontSize: '0.65rem' }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </Badge>
        )}
      </Dropdown.Toggle>

      <Dropdown.Menu className="shadow-lg p-0" style={{ width: '320px', maxHeight: '400px', overflowY: 'auto' }}>
        <div className="d-flex justify-content-between align-items-center p-3 border-bottom bg-light">
          <strong className="text-dark">Notifications</strong>
          {unreadCount > 0 && (
            <Button variant="link" size="sm" className="p-0 text-decoration-none text-primary" onClick={markAllRead}>
              Mark all read
            </Button>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="p-4 text-center text-muted small">No notifications yet</div>
        ) : (
          notifications.slice(0, 10).map((n, i) => (
            <div key={n._id || i} className="p-3 border-bottom small hover-bg-light">
              <div className="d-flex justify-content-between">
                <strong className="text-dark">{n.title}</strong>
                {n.createdAt && (
                  <span className="text-muted" style={{ fontSize: '0.7rem' }}>
                    {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
              <div className="text-secondary mt-1">{n.body || n.message}</div>
            </div>
          ))
        )}
      </Dropdown.Menu>
    </Dropdown>
  );
}
