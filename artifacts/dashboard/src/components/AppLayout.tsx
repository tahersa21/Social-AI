import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { useGetOrderCount, useGetAppointmentCount, useGetMe, useGetPausedConversationCount } from "@workspace/api-client-react";
import {
  Bot, Plug, Package, ShoppingCart, MessageSquare, MessageCircle,
  Facebook, Menu, Home, Calendar, HelpCircle, LogOut, Settings,
  Megaphone, Users, ShieldCheck, ClipboardList, Truck
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { removeToken } from "@/lib/auth";
import { NotificationBell, NotificationProvider } from "./NotificationBell";

const NAV_ITEMS = [
  { href: "/", label: "الرئيسية / Dashboard", icon: Home },
  { href: "/settings", label: "إعدادات الذكاء / AI Settings", icon: Settings },
  { href: "/providers", label: "مزودو AI / AI Providers", icon: Plug },
  { href: "/products", label: "المنتجات / Products", icon: Package },
  { href: "/appointments", label: "المواعيد / Appointments", icon: Calendar, appointmentBadge: true },
  { href: "/orders", label: "الطلبات / Orders", icon: ShoppingCart, orderBadge: true },
  { href: "/pre-orders", label: "الطلبات المسبقة / Pre-Orders", icon: ClipboardList },
  { href: "/conversations", label: "المحادثات / Conversations", icon: MessageSquare, pausedBadge: true },
  { href: "/comments", label: "التعليقات / Comments", icon: MessageCircle },
  { href: "/leads", label: "العملاء المحتملون / Leads", icon: Users },
  { href: "/broadcast", label: "البث الجماعي / Broadcasts", icon: Megaphone },
  { href: "/faq", label: "الأسئلة الشائعة / FAQ", icon: HelpCircle },
  { href: "/delivery-prices", label: "أسعار التوصيل / Delivery", icon: Truck },
  { href: "/fb-connect", label: "ربط فيسبوك / FB Connect", icon: Facebook },
  { href: "/reliability", label: "موثوقية المنصة / Reliability", icon: ShieldCheck },
];

function NavLinks({ closeSheet }: { closeSheet?: () => void }) {
  const [location] = useLocation();
  const { data: orderCount } = useGetOrderCount();
  const { data: appointmentCount } = useGetAppointmentCount();
  const { data: pausedCount } = useGetPausedConversationCount();

  return (
    <nav className="space-y-0.5 p-3">
      {NAV_ITEMS.map((item) => {
        const isActive = location === item.href;
        return (
          <Link key={item.href} href={item.href}>
            <div
              onClick={closeSheet}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 cursor-pointer group ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground hover-elevate"
              }`}
            >
              <item.icon className={`w-5 h-5 shrink-0 ${isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-primary transition-colors"}`} />
              <span className="font-medium text-sm flex-1 truncate">{item.label}</span>
              {item.orderBadge && orderCount?.pending ? (
                <Badge variant={isActive ? "secondary" : "destructive"} className="px-1.5 min-w-5 h-5 flex items-center justify-center text-[10px]">
                  {orderCount.pending}
                </Badge>
              ) : null}
              {item.pausedBadge && pausedCount?.count ? (
                <Badge variant="destructive" className="px-1.5 min-w-5 h-5 flex items-center justify-center text-[10px]">
                  {pausedCount.count}
                </Badge>
              ) : null}
              {item.appointmentBadge && appointmentCount?.pending ? (
                <Badge variant={isActive ? "secondary" : "destructive"} className="px-1.5 min-w-5 h-5 flex items-center justify-center text-[10px]">
                  {appointmentCount.pending}
                </Badge>
              ) : null}
            </div>
          </Link>
        );
      })}
    </nav>
  );
}

function LogoutSection() {
  const [, navigate] = useLocation();
  const { data: me } = useGetMe();

  const handleLogout = () => {
    removeToken();
    navigate("/login", { replace: true });
  };

  return (
    <div className="p-3 border-t border-border/50">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-sm text-muted-foreground font-medium truncate">{me?.username ?? "admin"}</span>
        <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-1.5 text-muted-foreground hover:text-destructive">
          <LogOut className="w-4 h-4" />
          خروج
        </Button>
      </div>
    </div>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <NotificationProvider>
      <div className="flex h-screen w-full bg-slate-50/50 text-foreground overflow-hidden" dir="rtl">

        {/* Sidebar — always visible */}
        <aside
          style={{ display: "flex", flexDirection: "column", width: "280px", minWidth: "280px", borderLeft: "1px solid hsl(214 32% 91%)", backgroundColor: "hsl(0 0% 100%)", boxShadow: "0 1px 3px 0 rgba(0,0,0,0.05)", zIndex: 10 }}
        >
          <div className="p-4 border-b border-border/50 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-inner shrink-0">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="font-bold text-base leading-tight truncate">مساعد الصفحة</h1>
                <p className="text-xs text-muted-foreground font-medium">Smart AI Agent</p>
              </div>
            </div>
            <NotificationBell />
          </div>
          <div className="flex-1 overflow-y-auto">
            <NavLinks />
          </div>
          <LogoutSection />
        </aside>

        {/* Main content area */}
        <main className="flex-1 flex flex-col min-h-0 overflow-hidden min-w-0">

          {/* Mobile top header (only shown on very small screens) */}
          <header className="md:hidden flex items-center justify-between p-4 border-b border-border/50 bg-card shadow-sm z-10" style={{ display: "none" }}>
            <div className="flex items-center gap-2">
              <Bot className="w-6 h-6 text-primary" />
              <h1 className="font-bold">مساعد الصفحة</h1>
            </div>
            <div className="flex items-center gap-2">
              <NotificationBell />
              <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <Menu className="w-5 h-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="p-0 w-64" dir="rtl">
                  <div className="p-4 border-b border-border/50">
                    <h2 className="font-bold">القائمة</h2>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    <NavLinks closeSheet={() => setSheetOpen(false)} />
                  </div>
                  <LogoutSection />
                </SheetContent>
              </Sheet>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            <div className="max-w-7xl mx-auto space-y-6">
              {children}
            </div>
          </div>
        </main>
      </div>
    </NotificationProvider>
  );
}
