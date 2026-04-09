import { motion } from "framer-motion";
import { MessageSquare, ShoppingCart, Calendar, MessageCircle, DollarSign, TrendingUp, Package, SmilePlus, Bot, BarChart2, ShieldAlert, UserCheck } from "lucide-react";
import { useGetStats } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { Loader2 } from "lucide-react";

const SENTIMENT_COLORS = { positive: "#22c55e", neutral: "#94a3b8", negative: "#ef4444" };
const SENTIMENT_LABELS: Record<string, string> = { positive: "إيجابي", neutral: "محايد", negative: "سلبي" };

export default function Dashboard() {
  const { data: stats, isLoading } = useGetStats();

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const trust = stats?.trust ?? {};

  const statCards = [
    { label: "محادثات اليوم", labelEn: "Today's Chats", value: stats?.sessions?.today ?? 0, icon: MessageSquare, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "محادثات الأسبوع", labelEn: "This Week", value: stats?.sessions?.week ?? 0, icon: MessageSquare, color: "text-indigo-600", bg: "bg-indigo-50" },
    { label: "محادثات الشهر", labelEn: "This Month", value: stats?.sessions?.month ?? 0, icon: MessageSquare, color: "text-violet-600", bg: "bg-violet-50" },
    { label: "الطلبات", labelEn: "Orders", value: `${stats?.orders?.total ?? 0}`, highlight: stats?.orders?.pending ? `${stats.orders.pending} معلق` : undefined, icon: ShoppingCart, color: "text-orange-600", bg: "bg-orange-50" },
    { label: "المواعيد", labelEn: "Appointments", value: `${stats?.appointments?.total ?? 0}`, highlight: stats?.appointments?.pending ? `${stats.appointments.pending} معلق` : undefined, icon: Calendar, color: "text-green-600", bg: "bg-green-50" },
    { label: "تعليقات اليوم", labelEn: "Comments Today", value: stats?.comments?.today ?? 0, icon: MessageCircle, color: "text-pink-600", bg: "bg-pink-50" },
    { label: "إيرادات اليوم", labelEn: "Today's Revenue", value: `${(stats?.revenue?.today ?? 0).toLocaleString()} ${stats?.revenue?.currency ?? "DZD"}`, icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50" },
  ];

  const trustCards = [
    {
      label: "طلبات البوت اليوم",
      labelEn: "Bot Orders Today",
      value: trust.botOrders ?? 0,
      icon: Bot,
      color: "text-blue-600",
      bg: "bg-blue-50",
      desc: "طلبات أنشأها البوت",
    },
    {
      label: "معدل التحويل",
      labelEn: "Conversion Rate",
      value: `${trust.conversionRate ?? 0}%`,
      icon: BarChart2,
      color: "text-green-600",
      bg: "bg-green-50",
      desc: "طلبات / محادثات اليوم",
    },
    {
      label: "أخطاء مُمنعة",
      labelEn: "Errors Prevented",
      value: trust.errorsPrevented ?? 0,
      icon: ShieldAlert,
      color: "text-amber-600",
      bg: "bg-amber-50",
      desc: "تصعيد بسبب خطر مبيعات",
    },
    {
      label: "تدخلات بشرية",
      labelEn: "Human Interventions",
      value: trust.humanInterventions ?? 0,
      icon: UserCheck,
      color: "text-violet-600",
      bg: "bg-violet-50",
      desc: "محادثات تحولت لبشري",
    },
  ];

  const rawSentiment = [
    { name: SENTIMENT_LABELS.positive, value: stats?.sentiment?.positive ?? 0, color: SENTIMENT_COLORS.positive },
    { name: SENTIMENT_LABELS.neutral, value: stats?.sentiment?.neutral ?? 0, color: SENTIMENT_COLORS.neutral },
    { name: SENTIMENT_LABELS.negative, value: stats?.sentiment?.negative ?? 0, color: SENTIMENT_COLORS.negative },
  ];
  const sentimentTotal = rawSentiment.reduce((sum, d) => sum + d.value, 0);
  const sentimentData = rawSentiment
    .filter(d => d.value > 0)
    .map(d => ({ ...d, pct: sentimentTotal > 0 ? Math.round((d.value / sentimentTotal) * 100) : 0 }));

  const hasSentiment = sentimentData.some(d => d.value > 0);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">لوحة التحكم</h1>
        <p className="text-muted-foreground mt-1">نظرة عامة على نشاط صفحتك</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, i) => (
          <Card key={i} className="border-none shadow-md shadow-black/10 hover:shadow-lg transition-shadow">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground font-medium">{card.label}</p>
                  <p className="text-2xl font-bold mt-1">{card.value}</p>
                  {card.highlight && (
                    <span className="text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full mt-1 inline-block font-medium">
                      {card.highlight}
                    </span>
                  )}
                </div>
                <div className={`w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center`}>
                  <card.icon className={`w-5 h-5 ${card.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── PHASE 5: Trust Layer Section ── */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-amber-600" />
          نظام الثقة / Trust Layer
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {trustCards.map((card, i) => (
            <Card key={i} className="border-none shadow-md shadow-black/10 hover:shadow-lg transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground font-medium">{card.label}</p>
                    <p className="text-2xl font-bold mt-1">{card.value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{card.desc}</p>
                  </div>
                  <div className={`w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center`}>
                    <card.icon className={`w-5 h-5 ${card.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-none shadow-md shadow-black/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              ساعات الذروة / Peak Hours
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats?.peakHours ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="hour" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
                    labelFormatter={(val) => `الساعة ${val}:00`}
                    formatter={(val: number) => [`${val} رسالة`, "الرسائل"]}
                  />
                  <Bar dataKey="count" fill="hsl(221 83% 53%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-none shadow-md shadow-black/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <SmilePlus className="w-5 h-5 text-primary" />
                المشاعر / Sentiment
              </CardTitle>
            </CardHeader>
            <CardContent>
              {hasSentiment ? (
                <div className="h-[160px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={sentimentData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={70}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {sentimentData.map((entry, index) => (
                          <Cell key={index} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ borderRadius: "10px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
                        formatter={(val: number, name: string) => {
                          const pct = sentimentTotal > 0 ? Math.round((val / sentimentTotal) * 100) : 0;
                          return [`${pct}% (${val})`, name];
                        }}
                      />
                      <Legend
                        iconType="circle"
                        iconSize={8}
                        formatter={(value) => {
                          const item = sentimentData.find(d => d.name === value);
                          return <span className="text-xs">{value} {item ? `${item.pct}%` : ""}</span>;
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[160px] flex flex-col items-center justify-center text-muted-foreground/70">
                  <SmilePlus className="w-10 h-10 mb-2 text-muted-foreground/30" />
                  <p className="text-sm">لا توجد بيانات بعد</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-none shadow-md shadow-black/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Package className="w-5 h-5 text-primary" />
                الأكثر طلباً / Top Products
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(stats?.topProducts ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">لا توجد طلبات بعد</p>
              ) : (
                <div className="space-y-2">
                  {(stats?.topProducts ?? []).map((p, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded-xl bg-muted/30 border border-border/50">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                          {i + 1}
                        </span>
                        <span className="text-sm font-medium truncate max-w-[120px]">{p.productName}</span>
                      </div>
                      <span className="text-sm font-bold text-primary">{p.orderCount} طلب</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}
