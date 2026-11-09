import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext.jsx';
import { notificationService } from '../services/orderService.js';
import { getAccessToken } from '../services/api.js';

export const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [latestEvent, setLatestEvent] = useState(null);

  // Load initial notifications when logged in
  useEffect(() => {
    if (user) {
      notificationService
        .list()
        .then((data) => {
          setNotifications(data.items || []);
          setUnreadCount(data.unreadCount || 0);
        })
        .catch(() => {});
    } else {
      setNotifications([]);
      setUnreadCount(0);
    }
  }, [user]);

  // Connect socket
  useEffect(() => {
    if (!user) {
      setSocket(null);
      return;
    }

    let socketUrl = import.meta.env.VITE_SOCKET_URL?.trim();
    if (!socketUrl) {
      const apiUrl = import.meta.env.VITE_API_URL?.trim();
      if (apiUrl) {
        socketUrl = apiUrl.replace(/\/+api\/?$/, '');
      } else {
        socketUrl = import.meta.env.DEV ? 'http://localhost:5000' : window.location.origin;
      }
    }

    const token = getAccessToken();
    const s = io(socketUrl, {
      path: '/socket.io',
      withCredentials: true,
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnectionAttempts: 5,
      auth: token ? { token } : undefined,
    });

    s.on('connect', () => {
      // connected
    });

    s.on('connect_error', () => {
      // quiet retry
    });

    s.on('notification:new', (notif) => {
      setNotifications((prev) => [notif, ...prev]);
      setUnreadCount((prev) => prev + 1);
      setLatestEvent({ type: 'notification', data: notif });
    });

    s.on('pickup:requested', (data) => {
      setLatestEvent({ type: 'pickup:requested', data });
    });

    s.on('order:status_changed', (data) => {
      setLatestEvent({ type: 'order:status_changed', data });
    });

    setSocket(s);

    return () => {
      s.removeAllListeners();
      s.disconnect();
    };
  }, [user]);

  const markAllRead = async () => {
    try {
      await notificationService.markAllRead();
      setUnreadCount(0);
    } catch {
      // ignore
    }
  };

  return (
    <SocketContext.Provider
      value={{
        socket,
        notifications,
        unreadCount,
        latestEvent,
        markAllRead,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext) || { notifications: [], unreadCount: 0 };
}
