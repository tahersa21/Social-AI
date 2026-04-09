import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

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
  kill_switch_blocked: { label: "مفتاح إيقاف", color: "bg-muted text-foreground border-border" },
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

async function fetchReliability(): Promise<ReliabilityData> {
  const res = await fetch(`${BASE}/api/platform-reliability`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<ReliabilityData>;
}

export default function Reliability() {
  const { data, isLoading, isError } = useQuery<ReliabilityData>({
    queryKey: ["/api/platform-reliability"],
    queryFn: fetchReliability,
    refetchInterval: 60_000,
  });

  const counts: Record<string, number> = data?.counts ?? {};
  const recent = data?.recent ?? [];
  const totalEvents = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">موثوقية المنظومة / Platform Reliability</h1>
        <p className="text-muted-foreground text-sm mt-1">
          سجل أحداث البوت الآلية: انخفاض الثقة، إنقاذ المحادثات، التحويل البشري، وغيرها.
        </p>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-center py-12">جارٍ التحميل…</p>
      ) : isError ? (
        <p className="text-destructive text-center py-12">
          تعذّر تحميل بيانات الموثوقية. تحقق من الاتصال بالخادم.
        </p>
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
                    <p className="text-2xl font-bold text-foreground">{count}</p>
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
          <Card className="border shadow-md shadow-black/10">
            <CardHeader className="bg-muted/30 rounded-t-xl border-b pb-4">
              <CardTitle className="text-base">آخر 25 حدث / Last 25 Events</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {recent.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">لا توجد أحداث مسجّلة بعد.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/20">
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
                          <tr key={ev.id} className="border-b last:border-0 hover:bg-muted/40/40 transition-colors">
                            <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                              {formatDate(ev.createdAt)}
                            </td>
                            <td className="px-4 py-2.5">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${meta?.color ?? "bg-muted text-foreground"}`}>
                                {meta?.label ?? ev.eventType}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                              {ev.fbUserId ? ev.fbUserId.substring(0, 12) + "…" : "—"}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-xs truncate">
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
