import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getToken } from "@/lib/auth";

type EventType =
  | "low_confidence"
  | "rescue_triggered"
  | "handoff"
  | "provider_failure"
  | "blocked_keyword"
  | "kill_switch_blocked"
  | "off_topic_escalation"
  | "safe_mode_blocked";

interface ReliabilityData {
  counts: Record<EventType, number>;
  recent: Array<{
    id: number;
    eventType: string;
    fbUserId: string | null;
    detail: string | null;
    createdAt: string;
  }>;
}

const EVENT_LABELS: Record<string, { label: string; color: string }> = {
  low_confidence: { label: "ثقة منخفضة", color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  rescue_triggered: { label: "إنقاذ محادثة", color: "bg-orange-100 text-orange-800 border-orange-200" },
  handoff: { label: "تحويل بشري", color: "bg-blue-100 text-blue-800 border-blue-200" },
  provider_failure: { label: "فشل المزود", color: "bg-red-100 text-red-800 border-red-200" },
  blocked_keyword: { label: "كلمة محظورة", color: "bg-purple-100 text-purple-800 border-purple-200" },
  kill_switch_blocked: { label: "مفتاح إيقاف", color: "bg-slate-100 text-slate-800 border-slate-200" },
  off_topic_escalation: { label: "تصعيد خارج الموضوع", color: "bg-pink-100 text-pink-800 border-pink-200" },
  safe_mode_blocked: { label: "⛔ وضع آمن — محظور", color: "bg-red-50 text-red-700 border-red-300" },
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("ar-DZ", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export default function Reliability() {
  const [data, setData] = useState<ReliabilityData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    const token = getToken();
    fetch(`${base}/api/platform-reliability`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const counts = data?.counts ?? {};
  const recent = data?.recent ?? [];

  const totalEvents = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">موثوقية المنصة / Platform Reliability</h1>
        <p className="text-muted-foreground text-sm mt-1">
          سجل أحداث البوت الآلية: انخفاض الثقة، إنقاذ المحادثات، التحويل البشري، وغيرها.
        </p>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-center py-12">جارٍ التحميل…</p>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {(Object.keys(EVENT_LABELS) as EventType[]).map((key) => {
              const meta = EVENT_LABELS[key]!;
              const count = counts[key] ?? 0;
              return (
                <Card key={key} className="border shadow-sm">
                  <CardContent className="pt-4 pb-4">
                    <p className="text-2xl font-bold text-slate-800">{count}</p>
                    <p className="text-xs text-muted-foreground mt-1">{meta.label}</p>
                  </CardContent>
                </Card>
              );
            })}
            <Card className="border shadow-sm border-primary/20 bg-primary/5">
              <CardContent className="pt-4 pb-4">
                <p className="text-2xl font-bold text-primary">{totalEvents}</p>
                <p className="text-xs text-muted-foreground mt-1">إجمالي الأحداث</p>
              </CardContent>
            </Card>
          </div>

          {/* Recent Events Table */}
          <Card className="border shadow-md shadow-slate-200/50">
            <CardHeader className="bg-slate-50/50 rounded-t-xl border-b pb-4">
              <CardTitle className="text-base">آخر 25 حدث / Last 25 Events</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {recent.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">لا توجد أحداث مسجّلة بعد.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-slate-50/30">
                        <th className="px-4 py-2 text-right font-medium text-muted-foreground">الوقت</th>
                        <th className="px-4 py-2 text-right font-medium text-muted-foreground">نوع الحدث</th>
                        <th className="px-4 py-2 text-right font-medium text-muted-foreground">المستخدم</th>
                        <th className="px-4 py-2 text-right font-medium text-muted-foreground">التفاصيل</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recent.map((ev) => {
                        const meta = EVENT_LABELS[ev.eventType];
                        return (
                          <tr key={ev.id} className="border-b last:border-0 hover:bg-slate-50/40 transition-colors">
                            <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                              {formatDate(ev.createdAt)}
                            </td>
                            <td className="px-4 py-2.5">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${meta?.color ?? "bg-slate-100 text-slate-800"}`}>
                                {meta?.label ?? ev.eventType}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 font-mono text-xs text-slate-600">
                              {ev.fbUserId ? ev.fbUserId.substring(0, 12) + "…" : "—"}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-slate-600 max-w-xs truncate">
                              {ev.detail ?? "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
