import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { motion } from "framer-motion";
import { Plug, Plus, Edit, Trash2, CheckCircle2, Play, Loader2, Link as LinkIcon, Cpu, AlertTriangle, Clock, BarChart3, ToggleLeft, ToggleRight, RotateCcw, Terminal } from "lucide-react";
import { 
  useListProviders, 
  useCreateProvider, 
  useUpdateProvider, 
  useDeleteProvider, 
  useActivateProvider, 
  useTestProvider,
  useGetProviderStats,
  Provider,
  ProviderStat
} from "@workspace/api-client-react";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const PROVIDER_TYPES = ["Anthropic", "OpenAI", "Google Gemini", "Vertex AI", "DeepSeek", "Groq", "OpenRouter", "Orbit", "AgentRouter", "Custom", "raw_single", "raw_messages"];

const PROVIDER_DEFAULTS: Record<string, { url: string; model: string; keyUrl?: string; description?: string; suggestedModels?: string[] }> = {
  Anthropic: { url: "https://api.anthropic.com", model: "claude-haiku-4-5" },
  OpenAI: { url: "https://api.openai.com", model: "gpt-4o-mini" },
  "Google Gemini": {
    url: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-2.0-flash",
    keyUrl: "https://aistudio.google.com/apikey",
    description: "Google AI Studio — مجاني بسخاء (1500 طلب/يوم مجاناً)",
    suggestedModels: ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash"],
  },
  "Vertex AI": {
    url: "my-gcp-project|us-central1",
    model: "gemini-2.5-flash",
    keyUrl: "https://console.cloud.google.com/iam-admin/serviceaccounts",
    description: "Vertex AI — 1000+ طلب/دقيقة، مناسب للضغط العالي. ضع محتوى ملف JSON في حقل المفتاح.",
    suggestedModels: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"],
  },
  DeepSeek: { url: "https://api.deepseek.com", model: "deepseek-chat" },
  Groq: { url: "https://api.groq.com/openai", model: "llama-3.3-70b-versatile" },
  OpenRouter: { url: "https://openrouter.ai/api", model: "openai/gpt-4o-mini" },
  Orbit: { url: "https://api.orbit-provider.com/api/provider/agy", model: "claude-sonnet-4-6" },
  AgentRouter: { url: "https://agentrouter.org", model: "claude-sonnet-4-5-20250514" },
  Custom: { url: "", model: "" },
  raw_single: {
    url: "",
    model: "",
    description: 'مخصص — رسالة واحدة: يرسل {"model":"...","message":"..."} للرابط الكامل. ضع الرابط الكامل (مع المسار) في Base URL.',
  },
  raw_messages: {
    url: "",
    model: "",
    description: 'مخصص — مصفوفة: يرسل {"model":"...","messages":[...]} للرابط الكامل. ضع الرابط الكامل (مع المسار) في Base URL.',
  },
};

interface ParsedCurl {
  baseUrl: string;
  apiKey: string;
  modelName: string;
  providerType: string;
  name: string;
}

function parseCurlCommand(raw: string): ParsedCurl | null {
  const text = raw.replace(/\\\n/g, " ").replace(/\n/g, " ");

  // Extract URL
  const urlMatch = text.match(/curl\s+(?:-s\s+)?(?:-X\s+\w+\s+)?['"]?(https?:\/\/[^\s'"]+)['"]?/i)
    || text.match(/['"]?(https?:\/\/[^\s'"]+)['"]?/);
  if (!urlMatch) return null;
  const fullUrl = urlMatch[1].replace(/['"]/g, "");

  // Extract API key — Authorization: Bearer or x-api-key
  let apiKey = "";
  const bearerMatch = text.match(/Authorization:\s*Bearer\s+([^\s'"\\]+)/i);
  const xApiMatch = text.match(/x-api-key:\s*([^\s'"\\]+)/i);
  if (bearerMatch) apiKey = bearerMatch[1].replace(/['"]/g, "").trim();
  else if (xApiMatch) apiKey = xApiMatch[1].replace(/['"]/g, "").trim();

  // Extract model from JSON body -d or --data-raw
  let modelName = "";
  const dataMatch = text.match(/(?:-d|--data(?:-raw)?)\s+['"]([^'"]+)['"]/i)
    || text.match(/(?:-d|--data(?:-raw)?)\s+(\{.+?\})/i);
  if (dataMatch) {
    try {
      const body = JSON.parse(dataMatch[1].replace(/'/g, '"'));
      if (body.model) modelName = body.model;
    } catch {
      const mMatch = dataMatch[1].match(/"model"\s*:\s*"([^"]+)"/);
      if (mMatch) modelName = mMatch[1];
    }
  }

  // Detect body format: "message" (singular string) → raw_single; "messages" (array) → standard
  let bodyUsesMessageSingular = false;
  if (dataMatch) {
    try {
      const body = JSON.parse(dataMatch[1].replace(/'/g, '"'));
      if (typeof body.message === "string" && !body.messages) bodyUsesMessageSingular = true;
    } catch {
      if (/"message"\s*:\s*"/.test(dataMatch[1]) && !/"messages"\s*:/.test(dataMatch[1])) {
        bodyUsesMessageSingular = true;
      }
    }
  }

  // Parse base URL: for standard APIs strip known path suffixes; for raw keep full URL
  let baseUrl = fullUrl;
  let pathWasStripped = false;
  if (!bodyUsesMessageSingular) {
    try {
      const u = new URL(fullUrl);
      const stripped = u.pathname
        .replace(/\/(chat\/completions|messages|completions|generate|v1beta\/openai\/.*|v1\/.*|openai\/.*)$/, "")
        .replace(/\/$/, "");
      if (stripped !== u.pathname) {
        baseUrl = `${u.protocol}//${u.host}${stripped}`;
        pathWasStripped = true;
      } else {
        baseUrl = `${u.protocol}//${u.host}${stripped}`;
      }
    } catch { /* keep fullUrl */ }
  }
  void pathWasStripped;

  // Auto-detect provider type from URL/key/body
  let providerType = bodyUsesMessageSingular ? "raw_single" : "Custom";
  let name = bodyUsesMessageSingular ? "مزود مخصص (رسالة واحدة)" : "مزود مخصص";
  const host = (bodyUsesMessageSingular ? fullUrl : baseUrl).toLowerCase();
  if (!bodyUsesMessageSingular) {
    if (host.includes("openai.com")) { providerType = "OpenAI"; name = "OpenAI"; }
    else if (host.includes("anthropic.com")) { providerType = "Anthropic"; name = "Anthropic"; }
    else if (host.includes("generativelanguage.googleapis.com")) { providerType = "Google Gemini"; name = "Google Gemini"; }
    else if (host.includes("deepseek.com")) { providerType = "DeepSeek"; name = "DeepSeek"; }
    else if (host.includes("groq.com")) { providerType = "Groq"; name = "Groq"; }
    else if (host.includes("openrouter.ai")) { providerType = "OpenRouter"; name = "OpenRouter"; }
    else if (host.includes("orbit-provider.com")) { providerType = "Orbit"; name = "Orbit"; }
    else if (host.includes("agentrouter.org")) { providerType = "AgentRouter"; name = "AgentRouter"; }
    else if (apiKey.startsWith("sk-ant-")) { providerType = "Anthropic"; name = "Anthropic"; }
    else if (apiKey.startsWith("sk-")) { providerType = "OpenAI"; name = "OpenAI"; }
  }

  return { baseUrl, apiKey, modelName, providerType, name };
}

const formSchema = z.object({
  name: z.string().min(2, "الاسم مطلوب"),
  providerType: z.string().optional().default(""),
  apiKey: z.string().min(1, "مفتاح API مطلوب"),
  baseUrl: z.string().optional(),
  modelName: z.string().min(1, "اسم الموديل مطلوب"),
});

function formatTimeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  return `منذ ${Math.floor(hours / 24)} يوم`;
}

export default function Providers() {
  const queryClient = useQueryClient();
  const { data: providers = [], isLoading } = useListProviders();
  const { data: stats = [] } = useGetProviderStats();
  const createMut = useCreateProvider();
  const updateMut = useUpdateProvider();
  const deleteMut = useDeleteProvider();
  const activateMut = useActivateProvider();
  const testMut = useTestProvider();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [curlDialogOpen, setCurlDialogOpen] = useState(false);
  const [curlText, setCurlText] = useState("");
  const [curlError, setCurlError] = useState("");

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      providerType: "",
      apiKey: "",
      baseUrl: "",
      modelName: "",
    }
  });

  const openDialog = (provider?: Provider) => {
    if (provider) {
      setEditingProvider(provider);
      form.reset({
        name: provider.name,
        providerType: provider.providerType,
        apiKey: "",
        baseUrl: provider.baseUrl || "",
        modelName: provider.modelName,
      });
      form.clearErrors("apiKey");
    } else {
      setEditingProvider(null);
      form.reset({ name: "", providerType: "", apiKey: "", baseUrl: "", modelName: "" });
    }
    setDialogOpen(true);
  };

  const handleProviderTypeChange = (val: string) => {
    form.setValue("providerType", val);
    const def = PROVIDER_DEFAULTS[val];
    if (def) {
      form.setValue("baseUrl", def.url);
      form.setValue("modelName", def.model);
      if (!form.getValues("name")) form.setValue("name", val);
    }
  };

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    const submitValues = { ...values, providerType: values.providerType || "custom" };
    if (editingProvider) {
      const { apiKey, ...rest } = submitValues;
      const payload = apiKey && apiKey.trim() !== "" ? { ...rest, apiKey } : rest;
      updateMut.mutate({ id: editingProvider.id, data: payload }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/providers"] });
          setDialogOpen(false);
          toast({ title: "تم التحديث", description: "تم تحديث المزود بنجاح" });
        }
      });
    } else {
      createMut.mutate({ data: submitValues }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/providers"] });
          setDialogOpen(false);
          toast({ title: "تمت الإضافة", description: "تمت إضافة المزود بنجاح" });
        }
      });
    }
  };

  const toggleEnabled = (provider: Provider) => {
    const newVal = provider.isEnabled === 1 ? 0 : 1;
    updateMut.mutate({ id: provider.id, data: { isEnabled: newVal } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/providers"] });
        toast({ title: newVal ? "تم التفعيل" : "تم التعطيل", description: `${provider.name} ${newVal ? "مفعّل" : "معطّل"} في التوزيع` });
      }
    });
  };

  const updatePriority = (provider: Provider, newPriority: number) => {
    updateMut.mutate({ id: provider.id, data: { priority: newPriority } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/providers"] });
      }
    });
  };

  const resetStats = async (providerId: number) => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    await fetch(`${base}/api/providers/${providerId}/reset-stats`, { method: "DELETE" });
    queryClient.invalidateQueries({ queryKey: ["/api/providers"] });
    queryClient.invalidateQueries({ queryKey: ["/api/providers/stats"] });
    toast({ title: "تم المسح", description: "تم إعادة تعيين إحصائيات الأخطاء" });
  };

  const handleCurlImport = () => {
    setCurlError("");
    if (!curlText.trim()) { setCurlError("الرجاء لصق أمر curl أولاً"); return; }
    const parsed = parseCurlCommand(curlText);
    if (!parsed) { setCurlError("لم يتم التعرف على صيغة curl. تأكد أن الأمر يحتوي على رابط URL صحيح."); return; }
    setCurlDialogOpen(false);
    setEditingProvider(null);
    form.reset({
      name: parsed.name,
      providerType: parsed.providerType,
      apiKey: parsed.apiKey,
      baseUrl: parsed.baseUrl,
      modelName: parsed.modelName,
    });
    setCurlText("");
    setDialogOpen(true);
    toast({ title: "تم الاستيراد", description: `تم استخراج الإعدادات من curl — تحقق من البيانات قبل الحفظ` });
  };

  const activeProvider = providers.find(p => p.isActive === 1);
  type ExtStat = ProviderStat & { lastError?: string | null };
  const statsMap = new Map((stats as ExtStat[]).map(s => [s.providerId, s]));

  // Providers that are enabled but have 0% success rate with >0 calls — need attention
  const failingProviders = providers.filter(p => {
    if (p.isEnabled !== 1) return false;
    const s = statsMap.get(p.id);
    return s && s.totalCalls > 0 && s.successRate === 0;
  });

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">مزودو الذكاء الاصطناعي</h1>
          <p className="text-muted-foreground mt-1">إدارة نماذج الذكاء الاصطناعي ومفاتيح الـ API الخاصة بك</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => { setCurlError(""); setCurlText(""); setCurlDialogOpen(true); }} className="gap-2 h-11 px-4 rounded-xl border-dashed hover:-translate-y-0.5 transition-transform">
            <Terminal className="w-4 h-4" /> استيراد من cURL
          </Button>
          <Button onClick={() => openDialog()} className="gap-2 h-11 px-6 rounded-xl shadow-lg shadow-primary/20 hover:-translate-y-0.5 transition-transform">
            <Plus className="w-4 h-4" /> إضافة مزود جديد
          </Button>
        </div>
      </div>

      {failingProviders.length > 0 && (
        <div className="bg-red-50 border border-red-300 rounded-xl p-4 flex gap-3 items-start">
          <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1 space-y-1">
            <p className="font-bold text-red-800 text-sm">تحذير: مزود AI يعمل بأخطاء</p>
            <p className="text-xs text-red-700">
              المزود{failingProviders.length > 1 ? "ون" : ""} التالي{failingProviders.length > 1 ? "ون" : ""}
              {" "}<strong>{failingProviders.map(p => p.name).join("، ")}</strong>{" "}
              {failingProviders.length > 1 ? "يُرجعون" : "يُرجع"} 0% نجاح — تحقق من مفتاح API.
              إذا كان الخطأ "suspended" يجب الحصول على مفتاح جديد من موقع المزود.
            </p>
          </div>
        </div>
      )}

      {activeProvider && (
        <Card className="bg-primary/5 border-primary/20 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
              </div>
              <div>
                <p className="text-sm font-medium text-primary">المزود النشط حالياً</p>
                <p className="font-bold text-lg">{activeProvider.name} <span className="text-muted-foreground text-sm font-normal">({activeProvider.modelName})</span></p>
              </div>
            </div>
            <Cpu className="w-8 h-8 text-primary/20" />
          </CardContent>
        </Card>
      )}

      {(stats as ProviderStat[]).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart3 className="w-5 h-5 text-primary" />
              أداء المزودين (آخر 24 ساعة)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">المزود</TableHead>
                  <TableHead className="text-right">إجمالي الطلبات</TableHead>
                  <TableHead className="text-right">نسبة النجاح</TableHead>
                  <TableHead className="text-right">متوسط الاستجابة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(stats as ProviderStat[]).map(s => (
                  <TableRow key={s.providerId}>
                    <TableCell className="font-medium">{s.providerName}</TableCell>
                    <TableCell>{s.totalCalls}</TableCell>
                    <TableCell>
                      <Badge variant={s.successRate >= 90 ? "default" : s.successRate >= 50 ? "secondary" : "destructive"}>
                        {s.successRate}%
                      </Badge>
                    </TableCell>
                    <TableCell>{s.avgLatencyMs}ms</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1,2].map(i => <div key={i} className="h-48 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {providers.map(provider => {
            const providerStats = statsMap.get(provider.id);
            return (
            <Card key={provider.id} className={`border border-border/50 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden ${provider.isActive ? 'ring-2 ring-primary border-transparent' : ''} ${provider.isEnabled === 0 ? 'opacity-60' : ''}`}>
              {provider.isActive === 1 && (
                <div className="absolute top-0 right-0 w-16 h-16 overflow-hidden">
                  <div className="absolute transform rotate-45 bg-primary text-primary-foreground text-[10px] font-bold py-1 right-[-35px] top-[32px] w-[170px] text-center">
                    نشط / Active
                  </div>
                </div>
              )}
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Plug className="w-5 h-5 text-muted-foreground" />
                    {provider.name}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {(provider.failCount ?? 0) > 0 && (
                      <Badge variant="destructive" className="gap-1 text-xs">
                        <AlertTriangle className="w-3 h-3" />
                        {provider.failCount}
                      </Badge>
                    )}
                    <button onClick={() => toggleEnabled(provider)} title={provider.isEnabled === 1 ? "مفعّل في التوزيع" : "معطّل من التوزيع"}>
                      {provider.isEnabled === 1 ? (
                        <ToggleRight className="w-6 h-6 text-green-500" />
                      ) : (
                        <ToggleLeft className="w-6 h-6 text-muted-foreground" />
                      )}
                    </button>
                  </div>
                </div>
                <CardDescription className="text-xs">{provider.providerType}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pb-4">
                <div className="bg-muted/40 rounded-lg p-3 space-y-2 text-sm border border-border/50">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Model</span>
                    <span className="font-mono bg-card px-2 py-0.5 rounded shadow-sm border border-border/50 text-xs">{provider.modelName}</span>
                  </div>
                  {provider.baseUrl && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Base URL</span>
                      <span className="text-xs truncate max-w-[150px] direction-ltr">{provider.baseUrl}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">الأولوية</span>
                    <Input
                      type="number"
                      min={0}
                      max={99}
                      defaultValue={provider.priority ?? 0}
                      onBlur={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        if (val !== (provider.priority ?? 0)) updatePriority(provider, val);
                      }}
                      className="w-16 h-7 text-center text-xs direction-ltr"
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" /> آخر استخدام
                    </span>
                    <span className="text-xs">{formatTimeAgo(provider.lastUsedAt)}</span>
                  </div>
                  {providerStats && (
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">24h</span>
                        <span className={`text-xs font-medium ${providerStats.successRate === 0 && providerStats.totalCalls > 0 ? "text-red-600" : "text-green-600"}`}>
                          {providerStats.totalCalls} طلب • {providerStats.successRate}% نجاح
                        </span>
                      </div>
                      {(providerStats as ExtStat).lastError && (
                        <div className="bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700 break-words leading-relaxed">
                          <span className="font-semibold">سبب الخطأ:</span> {(providerStats as ExtStat).lastError!.substring(0, 200)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
              <CardFooter className="flex flex-wrap gap-2 border-t border-border/50 bg-muted/30 pt-4">
                <Button variant="outline" size="sm" className="flex-1 min-w-[80px]" onClick={() => openDialog(provider)}>
                  <Edit className="w-4 h-4 me-1" /> تعديل
                </Button>
                {(provider.failCount ?? 0) > 0 && (
                  <Button variant="outline" size="sm" className="text-orange-600 hover:bg-orange-50 hover:text-orange-700 border-orange-200" onClick={() => resetStats(provider.id)}>
                    <RotateCcw className="w-3.5 h-3.5 me-1" /> مسح الأخطاء
                  </Button>
                )}
                {provider.isActive === 0 && (
                  <Button variant="outline" size="sm" className="flex-1 min-w-[80px] bg-card hover:text-primary hover:bg-primary/5" onClick={() => {
                    activateMut.mutate({ id: provider.id }, {
                      onSuccess: () => {
                        queryClient.invalidateQueries({ queryKey: ["/api/providers"] });
                        toast({ title: "تم التنشيط", description: `تم تفعيل ${provider.name}` });
                      }
                    });
                  }}>
                    <CheckCircle2 className="w-4 h-4 me-1 text-primary" /> تنشيط
                  </Button>
                )}
                <Button variant="outline" size="sm" className="flex-1 min-w-[80px] bg-card hover:text-amber-600 hover:bg-amber-50" onClick={() => {
                  toast({ title: "جاري الاختبار...", description: "يرجى الانتظار" });
                  testMut.mutate({ id: provider.id }, {
                    onSuccess: (res) => {
                      if(res.success) toast({ title: "نجاح الاختبار ✅", description: `${res.response} (${res.latencyMs}ms)` });
                      else toast({ title: "فشل الاختبار ❌", description: res.response || "خطأ غير معروف", variant: "destructive" });
                    },
                    onError: (err: any) => {
                      toast({ title: "فشل الاختبار ❌", description: err.message || "خطأ في الاتصال", variant: "destructive" });
                    }
                  });
                }}>
                  <Play className="w-4 h-4 me-1" /> اختبار
                </Button>
                {provider.isActive === 0 && (
                  <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => {
                    if(confirm("هل أنت متأكد من الحذف؟")) {
                      deleteMut.mutate({ id: provider.id }, {
                        onSuccess: () => {
                          queryClient.invalidateQueries({ queryKey: ["/api/providers"] });
                          toast({ title: "تم الحذف" });
                        }
                      });
                    }
                  }}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </CardFooter>
            </Card>
          );})}
        </div>
      )}

      {/* cURL Import Dialog */}
      <Dialog open={curlDialogOpen} onOpenChange={setCurlDialogOpen}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Terminal className="w-5 h-5 text-primary" /> استيراد من أمر cURL
            </DialogTitle>
            <DialogDescription>
              الصق أمر curl الخاص بمزود الذكاء الاصطناعي وسيتم استخراج الإعدادات تلقائياً
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="bg-muted/40 rounded-lg p-3 border text-xs font-mono text-muted-foreground leading-relaxed">
              <p className="text-muted-foreground text-xs mb-1.5 font-sans">مثال:</p>
              <span className="text-blue-600">curl</span> https://api.openai.com/v1/chat/completions \<br />
              &nbsp;&nbsp;<span className="text-purple-600">-H</span> <span className="text-green-700">"Authorization: Bearer sk-..."</span> \<br />
              &nbsp;&nbsp;<span className="text-purple-600">-d</span> <span className="text-green-700">'{`{"model":"gpt-4o-mini"}`}'</span>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">أمر cURL</label>
              <Textarea
                dir="ltr"
                value={curlText}
                onChange={(e) => { setCurlText(e.target.value); setCurlError(""); }}
                placeholder="curl https://..."
                className="font-mono text-xs min-h-[130px] resize-y"
              />
              {curlError && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> {curlError}
                </p>
              )}
            </div>
          </div>
          <DialogFooter className="pt-2 flex gap-2 sm:justify-start">
            <Button type="button" variant="outline" onClick={() => setCurlDialogOpen(false)}>إلغاء</Button>
            <Button type="button" onClick={handleCurlImport} className="gap-2 px-6">
              <Terminal className="w-4 h-4" /> استخراج وضبط الإعدادات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingProvider ? "تعديل مزود" : "إضافة مزود جديد"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
              <FormField control={form.control} name="providerType" render={({ field }) => (
                <FormItem>
                  <FormLabel>نوع المزود / Provider Type (اختياري)</FormLabel>
                  <Select onValueChange={handleProviderTypeChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger className="h-11"><SelectValue placeholder="اختر النوع أو اتركه فارغاً" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {PROVIDER_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>الاسم / Name</FormLabel>
                  <FormControl><Input placeholder="الاسم التعريفي" {...field} className="h-11" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              
              <FormField control={form.control} name="apiKey" render={({ field }) => {
                const selectedType = form.watch("providerType");
                const isVertexAi   = selectedType === "Vertex AI";
                const defaults     = selectedType ? PROVIDER_DEFAULTS[selectedType] : undefined;
                const keyUrl       = defaults?.keyUrl ?? (defaults?.url || undefined);
                return (
                <FormItem>
                  <FormLabel className="flex justify-between items-center">
                    <span>{isVertexAi ? "Service Account JSON" : "مفتاح API / API Key"}</span>
                    {!editingProvider && keyUrl && (
                       <a href={keyUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                         {isVertexAi ? "إنشاء Service Account" : "الحصول على مفتاح"} <LinkIcon className="w-3 h-3" />
                       </a>
                    )}
                  </FormLabel>
                  <FormControl>
                    {isVertexAi ? (
                      <Textarea
                        dir="ltr"
                        placeholder={editingProvider ? 'اتركه فارغاً للحفاظ على القديم' : '{ "type": "service_account", "project_id": "...", ... }'}
                        {...field}
                        className="min-h-[120px] direction-ltr font-mono text-xs resize-y"
                      />
                    ) : (
                      <Input type="password" placeholder={editingProvider ? "اتركه فارغاً للحفاظ على القديم" : "sk-..."} {...field} className="h-11 direction-ltr font-mono text-sm" />
                    )}
                  </FormControl>
                  {defaults?.description && (
                    <FormDescription>{defaults.description}</FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              ); }} />

              <FormField control={form.control} name="modelName" render={({ field }) => {
                const selectedType = form.watch("providerType");
                const defaults = selectedType ? PROVIDER_DEFAULTS[selectedType] : undefined;
                return (
                <FormItem>
                  <FormLabel>اسم الموديل / Model Name</FormLabel>
                  <FormControl><Input placeholder="مثال: gpt-4o-mini" {...field} className="h-11 direction-ltr font-mono text-sm" /></FormControl>
                  <FormDescription>يجب أن يتطابق بدقة مع الموديلات المدعومة من المزود.</FormDescription>
                  {defaults?.suggestedModels && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {defaults.suggestedModels.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => form.setValue("modelName", m)}
                          className={`text-xs px-2 py-1 rounded-md border transition-colors ${field.value === m ? "bg-primary text-primary-foreground border-primary" : "bg-muted/40 hover:bg-muted border-border/60 text-foreground/80"}`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  )}
                  <FormMessage />
                </FormItem>
              ); }} />

              <FormField control={form.control} name="baseUrl" render={({ field }) => {
                const selectedType = form.watch("providerType");
                const isVertexAi   = selectedType === "Vertex AI";
                return (
                <FormItem>
                  <FormLabel>{isVertexAi ? "Project ID | Location" : "الرابط الأساسي / Base URL (اختياري)"}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={isVertexAi ? "my-gcp-project|us-central1" : "https://api..."}
                      {...field}
                      className="h-11 direction-ltr font-mono text-sm"
                    />
                  </FormControl>
                  {isVertexAi && (
                    <FormDescription>
                      صيغة: <span className="font-mono">projectId|location</span> — مثال: <span className="font-mono">my-project-123|us-central1</span>
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              ); }} />

              <DialogFooter className="pt-4 flex gap-2 sm:justify-start">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
                <Button type="submit" disabled={createMut.isPending || updateMut.isPending} className="px-6">
                  {(createMut.isPending || updateMut.isPending) && <Loader2 className="w-4 h-4 animate-spin me-2" />}
                  حفظ
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
