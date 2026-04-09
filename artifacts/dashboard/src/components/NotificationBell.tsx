import { useState, useEffect, useCallback, useRef, createContext, useContext, type ReactNode } from "react";
import { useLocation } from "wouter";
import { Bell, MessageSquare, ShoppingCart, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getToken } from "@/lib/auth";
import { toast } from "@/hooks/use-toast";

interface Notification {
  id: number;
  type: "new_message" | "new_order" | "new_appointment";
  title: string;
  body: string;
  route?: string;
  time: Date;
}

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  clearAll: () => void;
  markRead: () => void;
}

const NotificationContext = createContext<NotificationState>({
  notifications: [],
  unreadCount: 0,
  clearAll: () => {},
  markRead: () => {},
});

const TYPE_ICONS = {
  new_message: MessageSquare,
  new_order: ShoppingCart,
  new_appointment: Calendar,
};

const TYPE_COLORS = {
  new_message: "text-blue-500",
  new_order: "text-green-500",
  new_appointment: "text-purple-500",
};

function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `منذ ${mins} د`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `منذ ${hours} س`;
  return `منذ ${Math.floor(hours / 24)} ي`;
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const idCounter = useRef(0);
  const permissionAsked = useRef(false);

  useEffect(() => {
    if (!permissionAsked.current && typeof window.Notification !== "undefined" && window.Notification.permission === "default") {
      permissionAsked.current = true;
      window.Notification.requestPermission();
    }
  }, []);

  const handleEvent = useCallback((data: { type: string; title: string; body: string; route?: string }) => {
    const notif: Notification = {
      id: ++idCounter.current,
      type: data.type as Notification["type"],
      title: data.title,
      body: data.body,
      route: data.route,
      time: new Date(),
    };

    setNotifications(prev => [notif, ...prev].slice(0, 20));
    setUnreadCount(prev => prev + 1);

    toast({ title: notif.title, description: notif.body });

    if (typeof window.Notification !== "undefined" && window.Notification.permission === "granted") {
      try {
        new window.Notification(notif.title, { body: notif.body, icon: "/favicon.ico" });
      } catch {}
    }
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) return;

    const baseUrl = import.meta.env.VITE_API_URL || window.location.origin;
    const url = `${baseUrl}/api/notifications/stream?token=${encodeURIComponent(token)}`;

    let eventSource: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      eventSource = new EventSource(url);

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleEvent(data);
        } catch {}
      };

      eventSource.onerror = () => {
        eventSource?.close();
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connect, 5000);
      };
    }

    connect();

    return () => {
      eventSource?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [handleEvent]);

  const clearAll = useCallback(() => {
    setNotifications([]);
    setUnreadCount(0);
  }, []);

  const markRead = useCallback(() => {
    setUnreadCount(0);
  }, []);

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, clearAll, markRead }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function NotificationBell() {
  const { notifications, unreadCount, clearAll, markRead } = useContext(NotificationContext);
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleNotificationClick = (notif: Notification) => {
    if (notif.route) {
      navigate(notif.route);
    }
    setOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => { setOpen(!open); if (!open) markRead(); }}
        className="relative p-2 rounded-lg hover:bg-secondary transition-colors"
      >
        <Bell className="w-5 h-5 text-muted-foreground" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 md:right-0 md:left-auto top-full mt-2 w-80 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-muted/50">
            <h3 className="font-semibold text-sm">الإشعارات</h3>
            {notifications.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearAll} className="text-xs h-7 text-muted-foreground">
                مسح الكل
              </Button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                لا توجد إشعارات
              </div>
            ) : (
              notifications.map(notif => {
                const Icon = TYPE_ICONS[notif.type] || Bell;
                const color = TYPE_COLORS[notif.type] || "text-muted-foreground";
                return (
                  <button
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif)}
                    className="w-full flex items-start gap-3 px-4 py-3 hover:bg-muted/40 transition-colors text-right border-b border-border/30 last:border-0"
                  >
                    <div className={`mt-0.5 shrink-0 ${color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-tight">{notif.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{notif.body}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">{timeAgo(notif.time)}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
