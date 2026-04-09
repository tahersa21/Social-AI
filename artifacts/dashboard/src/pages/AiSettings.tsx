import { useEffect, useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { motion } from "framer-motion";
import { Save, Loader2, Bot, Building2, Clock, MessageCircle, Globe, Image, Shield, UserX, X, UserCheck, MousePointerClick, ShoppingCart, PowerOff, Lock, ShieldCheck, Zap, Plus, Trash2 } from "lucide-react";
import { useGetAiConfig } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { getToken } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const TARGET_AUDIENCES = [
  "شباب/Youth", "بالغون/Adults", "نساء/Women", "رجال/Men",
  "عائلات/Families", "أطفال/Children", "طلاب/Students",
  "مهنيون/Professionals", "أصحاب عمل/Business Owners",
  "مسنون/Seniors", "الجميع/All",
];
const COUNTRIES = ["الجزائر/Algeria", "المغرب/Morocco", "مصر/Egypt", "تونس/Tunisia", "السعودية/Saudi Arabia", "الإمارات/UAE", "الأردن/Jordan", "أخرى/Other"];
const DOMAINS = [
  { value: "tech", label: "💻 تقنية / Tech" },
  { value: "medical", label: "🏥 طبي / Medical" },
  { value: "fashion", label: "👗 أزياء / Fashion" },
  { value: "food", label: "🍕 طعام / Food" },
  { value: "real_estate", label: "🏠 عقارات / Real Estate" },
  { value: "education", label: "📚 تعليم / Education" },
  { value: "beauty", label: "💄 تجميل / Beauty" },
  { value: "phones", label: "📱 هواتف / Phones" },
  { value: "cars", label: "🚗 سيارات / Cars" },
  { value: "restaurant", label: "🍽️ مطعم / Restaurant" },
  { value: "salon", label: "💇 صالون / Salon" },
  { value: "services", label: "🔧 خدمات / Services" },
  { value: "shipping", label: "🚚 شحن / Shipping" },
  { value: "training", label: "🎓 تدريب / Training" },
  { value: "auto_parts", label: "⚙️ قطع غيار / Auto Parts" },
  { value: "general", label: "🛒 عام / General" },
  { value: "other", label: "✏️ أخرى / Other" },
];

const formSchema = z.object({
  botName: z.string().min(2, "الاسم مطلوب"),
  personality: z.string().optional(),
  greetingMessage: z.string().optional(),
  businessCountry: z.string().optional(),
  businessCity: z.string().optional(),
  businessDomain: z.string().optional(),
  businessDomainCustom: z.string().optional(),
  targetAudience: z.string().optional(),
  businessHoursStart: z.string().optional(),
  businessHoursEnd: z.string().optional(),
  timezone: z.string().default("Africa/Algiers"),
  outsideHoursMessage: z.string().optional(),
  workingHoursEnabled: z.boolean().default(true),
  currency: z.string().default("DZD"),
  respondToOrders: z.boolean().default(true),
  replyToComments: z.boolean().default(true),
  sendDmOnComment: z.boolean().default(true),
  language: z.string().default("auto"),
  pageName: z.string().optional(),
  pageDescription: z.string().optional(),
  pageFacebookUrl: z.string().optional(),
  strictTopicMode: z.boolean().default(false),
  offTopicResponse: z.string().optional(),
  blockedKeywords: z.string().optional(),
  maxOffTopicMessages: z.number().default(3),
  handoffKeyword: z.string().optional(),
  handoffMessage: z.string().optional(),
  leadCaptureEnabled: z.boolean().default(false),
  leadCaptureFields: z.string().default("phone"),
  leadCaptureMessage: z.string().optional(),
  useQuickReplies: z.boolean().default(true),
  abandonedCartEnabled: z.boolean().default(true),
  abandonedCartDelayHours: z.number().min(1).max(24).default(1),
  abandonedCartMessage: z.string().optional(),
  botEnabled: z.boolean().default(true),
  botDisabledMessage: z.string().optional(),
  confidenceThreshold: z.number().min(0).max(1).default(0.5),
  confidenceBelowAction: z.string().default("none"),
  safeModeEnabled: z.boolean().default(false),
  safeModeLevel: z.string().default("standard"),
  customerMemoryEnabled: z.boolean().default(false),
  salesBoostEnabled: z.boolean().default(false),
  salesBoostLevel: z.string().default("medium"),
  priceLockEnabled: z.boolean().default(false),
  humanGuaranteeEnabled: z.boolean().default(false),
  smartEscalationEnabled: z.boolean().default(false),
});

type FormValues = z.infer<typeof formSchema>;

export default function AiSettings() {
  const queryClient = useQueryClient();
  const { data: config, isLoading } = useGetAiConfig();
  const [isPending, setIsPending] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [keywordInput, setKeywordInput] = useState("");
  const [cartStats, setCartStats] = useState<{ totalInquiries: number; remindersSent: number; conversions: number; conversionRate: number } | null>(null);

  const DEFAULT_QR_BUTTONS = [
    { title: "📦 استفسار منتجات", payload: "PRODUCTS" },
    { title: "📅 حجز موعد", payload: "APPOINTMENT" },
    { title: "🚚 خدمة التوصيل", payload: "DELIVERY" },
  ];
  const [qrButtons, setQrButtons] = useState<{ title: string; payload: string }[]>(DEFAULT_QR_BUTTONS);
  const [newQrTitle, setNewQrTitle] = useState("");
  const [newQrPayload, setNewQrPayload] = useState("PRODUCTS");

  useEffect(() => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    const token = getToken();
    fetch(`${base}/api/ai-config/abandoned-cart-stats`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setCartStats(d); })
      .catch(() => {});
  }, []);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      botName: "", personality: "", greetingMessage: "",
      businessCountry: "", businessCity: "", businessDomain: "",
      businessDomainCustom: "", targetAudience: "",
      businessHoursStart: "09:00", businessHoursEnd: "22:00",
      timezone: "Africa/Algiers",
      outsideHoursMessage: "", currency: "DZD",
      respondToOrders: true, replyToComments: true, sendDmOnComment: true, language: "auto", workingHoursEnabled: true,
      pageName: "", pageDescription: "", pageFacebookUrl: "",
      strictTopicMode: false, offTopicResponse: "", blockedKeywords: "",
      maxOffTopicMessages: 3, handoffKeyword: "", handoffMessage: "",
      leadCaptureEnabled: false, leadCaptureFields: "phone", leadCaptureMessage: "", useQuickReplies: true,
      abandonedCartEnabled: true, abandonedCartDelayHours: 1, abandonedCartMessage: "",
      botEnabled: true, botDisabledMessage: "",
      confidenceThreshold: 0.5, confidenceBelowAction: "none",
      safeModeEnabled: false, safeModeLevel: "standard", customerMemoryEnabled: false,
      salesBoostEnabled: false, salesBoostLevel: "medium",
      priceLockEnabled: false, humanGuaranteeEnabled: false, smartEscalationEnabled: false,
    }
  });

  useEffect(() => {
    if (config) {
      form.reset({
        botName: config.botName, personality: config.personality || "",
        greetingMessage: config.greetingMessage || "",
        businessCountry: config.businessCountry || "",
        businessCity: config.businessCity || "",
        businessDomain: config.businessDomain || "",
        businessDomainCustom: config.businessDomainCustom || "",
        targetAudience: config.targetAudience || "",
        businessHoursStart: config.businessHoursStart || "09:00",
        businessHoursEnd: config.businessHoursEnd || "22:00",
        timezone: config.timezone || "Africa/Algiers",
        outsideHoursMessage: config.outsideHoursMessage || "",
        currency: config.currency || "DZD",
        respondToOrders: config.respondToOrders === 1,
        replyToComments: config.replyToComments === 1,
        sendDmOnComment: config.sendDmOnComment === 1,
        language: config.language || "auto",
        pageName: config.pageName || "",
        pageDescription: config.pageDescription || "",
        pageFacebookUrl: config.pageFacebookUrl || "",
        strictTopicMode: config.strictTopicMode === 1,
        offTopicResponse: config.offTopicResponse || "",
        blockedKeywords: config.blockedKeywords || "",
        maxOffTopicMessages: config.maxOffTopicMessages ?? 3,
        handoffKeyword: config.handoffKeyword || "",
        handoffMessage: config.handoffMessage || "",
        leadCaptureEnabled: config.leadCaptureEnabled === 1,
        leadCaptureFields: config.leadCaptureFields || "phone",
        leadCaptureMessage: config.leadCaptureMessage || "",
        useQuickReplies: config.useQuickReplies !== 0,
        workingHoursEnabled: config.workingHoursEnabled !== 0,
        abandonedCartEnabled: config.abandonedCartEnabled !== 0,
        abandonedCartDelayHours: config.abandonedCartDelayHours ?? 1,
        abandonedCartMessage: config.abandonedCartMessage || "",
        botEnabled: config.botEnabled !== 0,
        botDisabledMessage: config.botDisabledMessage || "",
        confidenceThreshold: parseFloat(config.confidenceThreshold ?? "0.5"),
        confidenceBelowAction: config.confidenceBelowAction ?? "none",
        safeModeEnabled: config.safeModeEnabled === 1,
        safeModeLevel: config.safeModeLevel ?? "standard",
        customerMemoryEnabled: config.customerMemoryEnabled === 1,
        salesBoostEnabled: config.salesBoostEnabled === 1,
        salesBoostLevel: config.salesBoostLevel ?? "medium",
        priceLockEnabled: config.priceLockEnabled === 1,
        humanGuaranteeEnabled: config.humanGuaranteeEnabled === 1,
        smartEscalationEnabled: config.smartEscalationEnabled === 1,
      });
      if (config.pageLogoUrl) setLogoPreview(config.pageLogoUrl);
      if (config.quickReplyButtons) {
        try {
          const parsed = JSON.parse(config.quickReplyButtons);
          if (Array.isArray(parsed) && parsed.length > 0) setQrButtons(parsed);
        } catch {}
      }
    }
  }, [config, form]);

  const onSubmit = useCallback(async (values: FormValues) => {
    setIsPending(true);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const formData = new FormData();
      Object.entries(values).forEach(([key, val]) => {
        if (key === "respondToOrders") formData.append(key, val ? "1" : "0");
        else if (key === "replyToComments") formData.append(key, val ? "1" : "0");
        else if (key === "sendDmOnComment") formData.append(key, val ? "1" : "0");
        else if (key === "strictTopicMode") formData.append(key, val ? "1" : "0");
        else if (key === "leadCaptureEnabled") formData.append(key, val ? "1" : "0");
        else if (key === "useQuickReplies") formData.append(key, val ? "1" : "0");
        else if (key === "workingHoursEnabled") formData.append(key, val ? "1" : "0");
        else if (key === "abandonedCartEnabled") formData.append(key, val ? "1" : "0");
        else if (key === "abandonedCartDelayHours") formData.append(key, String(Math.round(Number(val))));
        else if (key === "botEnabled") formData.append(key, val ? "1" : "0");
        else if (key === "safeModeEnabled") formData.append(key, val ? "1" : "0");
        else if (key === "customerMemoryEnabled") formData.append(key, val ? "1" : "0");
        else if (key === "salesBoostEnabled") formData.append(key, val ? "1" : "0");
        else if (key === "priceLockEnabled") formData.append(key, val ? "1" : "0");
        else if (key === "humanGuaranteeEnabled") formData.append(key, val ? "1" : "0");
        else if (key === "smartEscalationEnabled") formData.append(key, val ? "1" : "0");
        else if (val !== undefined && val !== null) formData.append(key, String(val));
      });
      formData.append("quickReplyButtons", JSON.stringify(qrButtons));
      if (logoFile) formData.append("pageLogo", logoFile);

      const token = getToken();
      const res = await fetch(`${base}/api/ai-config`, {
        method: "PUT",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!res.ok) throw new Error("Failed to save");
      queryClient.invalidateQueries({ queryKey: ["/api/ai-config"] });
      toast({ title: "تم الحفظ بنجاح", description: "تم تحديث إعدادات الذكاء الاصطناعي" });
    } catch (err) {
      toast({ title: "خطأ", description: err instanceof Error ? err.message : "حدث خطأ غير متوقع", variant: "destructive" });
    } finally {
      setIsPending(false);
    }
  }, [logoFile, queryClient, qrButtons]);

  const currentDomain = form.watch("businessDomain");
  const selectedAudiences = form.watch("targetAudience")?.split(",").filter(Boolean) || [];
  const blockedKeywordsArr = (form.watch("blockedKeywords") || "").split(",").filter(Boolean);

  const toggleAudience = (aud: string) => {
    const newAudiences = selectedAudiences.includes(aud)
      ? selectedAudiences.filter(a => a !== aud)
      : [...selectedAudiences, aud];
    form.setValue("targetAudience", newAudiences.join(","), { shouldDirty: true });
  };

  const addKeyword = () => {
    if (!keywordInput.trim()) return;
    const updated = [...blockedKeywordsArr, keywordInput.trim()].join(",");
    form.setValue("blockedKeywords", updated, { shouldDirty: true });
    setKeywordInput("");
  };

  const removeKeyword = (kw: string) => {
    const updated = blockedKeywordsArr.filter(k => k !== kw).join(",");
    form.setValue("blockedKeywords", updated, { shouldDirty: true });
  };

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-4xl mx-auto">
      <div style={{ position: "sticky", top: 0, zIndex: 50, background: "var(--background)", paddingTop: "8px", paddingBottom: "8px", marginBottom: "0", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }} className="flex items-center justify-between rounded-xl px-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">إعدادات الذكاء الاصطناعي</h1>
          <p className="text-muted-foreground text-sm">تخصيص هوية المساعد الذكي وقواعد عمله الأساسية</p>
        </div>
        <Button onClick={form.handleSubmit(onSubmit)} disabled={isPending} className="gap-2 px-6 h-11 rounded-xl shadow-lg shadow-primary/20 hover:shadow-xl hover:-translate-y-0.5 transition-all">
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          حفظ التغييرات
        </Button>
      </div>

      <Form {...form}>
        <form className="space-y-6">

          {/* ── Kill Switch Card ── */}
          <Card className={`border-2 shadow-md ${form.watch("botEnabled") ? "border-green-200 shadow-green-100/50" : "border-red-200 shadow-red-100/50"}`}>
            <CardHeader className={`rounded-t-xl pb-4 ${form.watch("botEnabled") ? "bg-green-50/60 border-b border-green-100" : "bg-red-50/60 border-b border-red-100"}`}>
              <CardTitle className="text-lg flex items-center gap-2">
                <PowerOff className={`w-5 h-5 ${form.watch("botEnabled") ? "text-green-600" : "text-red-500"}`} />
                مفتاح إيقاف البوت / Bot Kill Switch
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <FormField control={form.control} name="botEnabled" render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
                  <div>
                    <FormLabel className="text-base font-semibold">تفعيل البوت / Bot Active</FormLabel>
                    <FormDescription>
                      {field.value
                        ? "البوت يعمل ويرد على جميع الرسائل الواردة"
                        : "⛔ البوت متوقف — سيتلقى المستخدمون رسالة التوقف ولن يُعالَج أي طلب بالذكاء الاصطناعي"}
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )} />
              {!form.watch("botEnabled") && (
                <FormField control={form.control} name="botDisabledMessage" render={({ field }) => (
                  <FormItem>
                    <FormLabel>رسالة التوقف / Disabled Message</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="عذراً، المساعد الذكي غير متاح حالياً. يرجى التواصل معنا لاحقاً."
                        {...field}
                        className="bg-muted/30"
                      />
                    </FormControl>
                    <FormDescription>هذه الرسالة تُرسَل تلقائياً لكل من يكتب للصفحة عندما يكون البوت متوقفاً.</FormDescription>
                  </FormItem>
                )} />
              )}
            </CardContent>
          </Card>

          {/* ── Confidence Score Card ── */}
          <Card className="border-none shadow-md shadow-black/10">
            <CardHeader className="bg-muted/30 rounded-t-xl border-b border-border/50 pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <svg className="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
                درجة الثقة / Confidence Score
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                يطلب البوت من الذكاء الاصطناعي تقييم مدى ثقته بكل إجابة. يمكنك تحديد حد أدنى وإجراء تلقائي عند الإجابات غير المؤكدة.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField control={form.control} name="confidenceThreshold" render={({ field }) => (
                  <FormItem>
                    <FormLabel>الحد الأدنى للثقة / Confidence Threshold</FormLabel>
                    <FormControl>
                      <Input
                        type="number" min="0" max="1" step="0.05"
                        value={field.value}
                        onChange={(e) => field.onChange(parseFloat(e.target.value))}
                        className="h-11 bg-muted/30"
                      />
                    </FormControl>
                    <FormDescription>من 0.0 (لا يقين) إلى 1.0 (يقين تام). الافتراضي 0.5</FormDescription>
                  </FormItem>
                )} />
                <FormField control={form.control} name="confidenceBelowAction" render={({ field }) => (
                  <FormItem>
                    <FormLabel>الإجراء عند الثقة المنخفضة / Action Below Threshold</FormLabel>
                    <FormControl>
                      <select {...field} className="h-11 w-full rounded-md border border-input bg-muted/30 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                        <option value="none">لا شيء / None</option>
                        <option value="note">إضافة تنبيه / Add Warning Note</option>
                        <option value="handoff">تحويل بشري / Human Handoff</option>
                      </select>
                    </FormControl>
                    <FormDescription>ماذا يحدث إذا كانت ثقة البوت أقل من الحد المحدد</FormDescription>
                  </FormItem>
                )} />
              </div>
            </CardContent>
          </Card>

          {/* ── PHASE 3: Safe Mode Card ── */}
          <Card className="border-none shadow-md shadow-black/10">
            <CardHeader className="bg-muted/30 rounded-t-xl border-b border-border/50 pb-4">
              <CardTitle className="text-lg flex items-center gap-2"><Shield className="w-5 h-5 text-primary" /> الوضع الآمن / Safe Mode</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                يكتشف البوت محاولات التلاعب بالنظام (Jailbreak) ويمنع ردود غير آمنة. الوضع الصارم يفحص الرد النهائي أيضاً.
              </p>
              <FormField control={form.control} name="safeModeEnabled" render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-xl border p-4 bg-muted/20">
                  <div>
                    <FormLabel className="text-sm font-semibold">تفعيل الوضع الآمن / Enable Safe Mode</FormLabel>
                    <FormDescription>يحمي البوت من محاولات التلاعب والأسئلة خارج النطاق المقصود</FormDescription>
                  </div>
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="safeModeLevel" render={({ field }) => (
                <FormItem>
                  <FormLabel>مستوى الحماية / Protection Level</FormLabel>
                  <FormControl>
                    <select {...field} className="h-11 w-full rounded-md border border-input bg-muted/30 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                      <option value="standard">قياسي / Standard — فحص رسالة المستخدم فقط</option>
                      <option value="strict">صارم / Strict — فحص رسالة المستخدم والرد النهائي</option>
                    </select>
                  </FormControl>
                  <FormDescription>الوضع الصارم يستبدل الردود المشبوهة بمحتوى آمن</FormDescription>
                </FormItem>
              )} />
            </CardContent>
          </Card>

          {/* ── PHASE 3: Customer Memory Card ── */}
          <Card className="border-none shadow-md shadow-black/10">
            <CardHeader className="bg-muted/30 rounded-t-xl border-b border-border/50 pb-4">
              <CardTitle className="text-lg flex items-center gap-2"><UserCheck className="w-5 h-5 text-primary" /> ذاكرة العميل / Customer Memory</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                يزود البوت بمعلومات العميل من قاعدة البيانات (الطلبات السابقة، بيانات الاتصال، الاستفسارات) عند بناء رسالة النظام.
              </p>
              <FormField control={form.control} name="customerMemoryEnabled" render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-xl border p-4 bg-muted/20">
                  <div>
                    <FormLabel className="text-sm font-semibold">تفعيل ذاكرة العميل / Enable Customer Memory</FormLabel>
                    <FormDescription>يتيح للبوت تخصيص الردود بناءً على تاريخ العميل السابق</FormDescription>
                  </div>
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                </FormItem>
              )} />
            </CardContent>
          </Card>

          {/* ── PHASE 4 TASK 1: Sales Boost Card ── */}
          <Card className="border-none shadow-md shadow-black/10">
            <CardHeader className="bg-muted/30 rounded-t-xl border-b border-border/50 pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-primary" /> تعزيز المبيعات / Sales Boost
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                يضيف سلوكاً موجهاً نحو البيع في ردود البوت — اقتراح المنتجات، إبراز المميزات، وأسئلة الإغلاق (تحب نكمل الطلب؟).
              </p>
              <FormField control={form.control} name="salesBoostEnabled" render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-xl border p-4 bg-muted/20">
                  <div>
                    <FormLabel className="text-sm font-semibold">تفعيل تعزيز المبيعات / Enable Sales Boost</FormLabel>
                    <FormDescription>يجعل البوت أكثر توجيهاً نحو إتمام المبيعات وتحويل المحادثات إلى طلبات</FormDescription>
                  </div>
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="salesBoostLevel" render={({ field }) => (
                <FormItem>
                  <FormLabel>مستوى الضغط البيعي / Boost Level</FormLabel>
                  <FormControl>
                    <select {...field} className="h-11 w-full rounded-md border border-input bg-muted/30 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                      <option value="low">منخفض / Low — اقتراح خفيف بدون ضغط</option>
                      <option value="medium">متوسط / Medium — مقترحات + أسئلة إغلاق ناعمة</option>
                      <option value="aggressive">قوي / Aggressive — إلحاح دائم + جمل إغلاق مباشرة</option>
                    </select>
                  </FormControl>
                  <FormDescription>مستوى "قوي" يضيف عبارات إلحاح ويطلب التأكيد في كل رد</FormDescription>
                </FormItem>
              )} />
            </CardContent>
          </Card>

          {/* ── PHASE 5: Price Lock Card ── */}
          <Card className="border-none shadow-md shadow-black/10">
            <CardHeader className="bg-muted/30 rounded-t-xl border-b border-border/50 pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Lock className="w-5 h-5 text-amber-600" /> قفل السعر / Price Lock
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                عند تفعيله، يعترض البوت أي سؤال عن السعر ويجيب مباشرة من قاعدة البيانات بدلاً من توليد AI حر — يمنع أي خطأ في السعر.
              </p>
              <FormField control={form.control} name="priceLockEnabled" render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-xl border p-4 bg-amber-50/30 border-amber-200">
                  <div>
                    <FormLabel className="text-sm font-semibold">تفعيل قفل السعر / Enable Price Lock</FormLabel>
                    <FormDescription>يضمن أن كل سعر يُذكر في المحادثة مأخوذ من قاعدة المنتجات مباشرة</FormDescription>
                  </div>
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                </FormItem>
              )} />
            </CardContent>
          </Card>

          {/* ── PHASE 5: Smart Escalation Card ── */}
          <Card className="border-none shadow-md shadow-black/10">
            <CardHeader className="bg-muted/30 rounded-t-xl border-b border-border/50 pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Zap className="w-5 h-5 text-orange-600" /> التصعيد الذكي / Smart Escalation
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                عند اكتشاف تردد المستخدم (hesitation)، يُحوَّل فوراً إلى مشرف بشري بدلاً من المخاطرة بخسارته — يمنع ضياع العملاء المترددين.
              </p>
              <FormField control={form.control} name="smartEscalationEnabled" render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-xl border p-4 bg-orange-50/30 border-orange-200">
                  <div>
                    <FormLabel className="text-sm font-semibold">تفعيل التصعيد الذكي / Enable Smart Escalation</FormLabel>
                    <FormDescription>يُحوَّل العميل المتردد تلقائياً لموظف بشري للحد من الخسارة</FormDescription>
                  </div>
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                </FormItem>
              )} />
            </CardContent>
          </Card>

          {/* ── PHASE 5: Human Guarantee Mode Card ── */}
          <Card className="border-none shadow-md shadow-black/10">
            <CardHeader className="bg-muted/30 rounded-t-xl border-b border-border/50 pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-green-600" /> ضمان الإنسانية / Human Guarantee
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                يُضيف في نهاية كل رد من البوت تذكيراً للعميل بأنه يستطيع طلب التحدث مع شخص حقيقي — يزيد الثقة ويقلل القلق.
              </p>
              <FormField control={form.control} name="humanGuaranteeEnabled" render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-xl border p-4 bg-green-50/30 border-green-200">
                  <div>
                    <FormLabel className="text-sm font-semibold">تفعيل ضمان الإنسانية / Enable Human Guarantee</FormLabel>
                    <FormDescription>يُلحق بكل رد: "💬 إذا أردت التحدث مع شخص حقيقي، اكتب: بشري"</FormDescription>
                  </div>
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <Card className="border-none shadow-md shadow-black/10">
            <CardHeader className="bg-muted/30 rounded-t-xl border-b border-border/50 pb-4">
              <CardTitle className="text-lg flex items-center gap-2"><Image className="w-5 h-5 text-primary" /> ملف الصفحة / Page Profile</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField control={form.control} name="pageName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>اسم الصفحة / Page Name</FormLabel>
                    <FormControl><Input placeholder="مثال: متجر الأناقة" {...field} className="h-11 bg-muted/30" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="pageFacebookUrl" render={({ field }) => (
                  <FormItem>
                    <FormLabel>رابط الصفحة / Facebook URL</FormLabel>
                    <FormControl><Input placeholder="https://facebook.com/yourpage" {...field} className="h-11 bg-muted/30" /></FormControl>
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="pageDescription" render={({ field }) => (
                <FormItem>
                  <FormLabel>وصف الصفحة / Page Description</FormLabel>
                  <FormControl><Textarea placeholder="وصف مختصر عن نشاط صفحتك..." {...field} className="bg-muted/30" /></FormControl>
                </FormItem>
              )} />
              <div className="space-y-2">
                <label className="text-sm font-medium">شعار الصفحة / Page Logo</label>
                <div className="flex items-center gap-4">
                  {logoPreview && (
                    <img src={logoPreview} alt="Logo" className="w-16 h-16 rounded-xl object-cover border border-border" />
                  )}
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setLogoFile(file);
                        setLogoPreview(URL.createObjectURL(file));
                      }
                    }}
                    className="h-11 bg-muted/30"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-md shadow-black/10">
            <CardHeader className="bg-muted/30 rounded-t-xl border-b border-border/50 pb-4">
              <CardTitle className="text-lg flex items-center gap-2"><Bot className="w-5 h-5 text-primary" /> هوية البوت / Bot Identity</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <FormField control={form.control} name="botName" render={({ field }) => (
                <FormItem>
                  <FormLabel>اسم البوت / Bot Name</FormLabel>
                  <FormControl><Input placeholder="مثال: المساعد الذكي" {...field} className="h-11 bg-muted/30" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="personality" render={({ field }) => (
                <FormItem>
                  <FormLabel>شخصية البوت / Personality</FormLabel>
                  <FormControl><Textarea placeholder="صف كيف تريد أن يتحدث البوت..." {...field} className="min-h-[100px] bg-muted/30" /></FormControl>
                  <FormDescription>تعليمات تضاف إلى System Prompt.</FormDescription>
                </FormItem>
              )} />
              <FormField control={form.control} name="greetingMessage" render={({ field }) => (
                <FormItem>
                  <FormLabel>رسالة الترحيب / Greeting Message</FormLabel>
                  <FormControl><Textarea placeholder="مرحباً! كيف يمكنني مساعدتك اليوم؟" {...field} className="bg-muted/30" /></FormControl>
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <Card className="border-none shadow-md shadow-black/10">
            <CardHeader className="bg-muted/30 rounded-t-xl border-b border-border/50 pb-4">
              <CardTitle className="text-lg flex items-center gap-2"><Building2 className="w-5 h-5 text-primary" /> ملف النشاط / Business Profile</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField control={form.control} name="businessCountry" render={({ field }) => (
                <FormItem>
                  <FormLabel>البلد / Country</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger className="h-11 bg-muted/30"><SelectValue placeholder="اختر البلد" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {COUNTRIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
              <FormField control={form.control} name="businessCity" render={({ field }) => (
                <FormItem>
                  <FormLabel>المدينة / City</FormLabel>
                  <FormControl><Input placeholder="مثال: الجزائر العاصمة" {...field} className="h-11 bg-muted/30" /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="businessDomain" render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>مجال العمل / Business Domain</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger className="h-11 bg-muted/30"><SelectValue placeholder="اختر المجال" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {DOMAINS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
              {currentDomain === "other" && (
                <FormField control={form.control} name="businessDomainCustom" render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>المجال المخصص / Custom Domain</FormLabel>
                    <FormControl><Input placeholder="اكتب مجالك..." {...field} className="h-11 bg-muted/30" /></FormControl>
                  </FormItem>
                )} />
              )}
              <div className="md:col-span-2 space-y-3">
                <p className="text-sm font-medium leading-none">الجمهور المستهدف / Target Audience</p>
                <div className="flex flex-wrap gap-2">
                  {TARGET_AUDIENCES.map(aud => {
                    const isSelected = selectedAudiences.includes(aud);
                    return (
                      <Badge
                        key={aud}
                        variant={isSelected ? "default" : "outline"}
                        className={`cursor-pointer px-4 py-1.5 text-sm transition-all hover-elevate ${isSelected ? 'shadow-md shadow-primary/20' : 'bg-muted/40'}`}
                        onClick={() => toggleAudience(aud)}
                      >
                        {aud}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-md shadow-black/10">
            <CardHeader className="bg-muted/30 rounded-t-xl border-b border-border/50 pb-4">
              <CardTitle className="text-lg flex items-center gap-2"><Shield className="w-5 h-5 text-primary" /> حماية الموضوع / Topic Guardrails</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <FormField control={form.control} name="strictTopicMode" render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-xl border border-border/50 bg-muted/30 p-4 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">الوضع الصارم / Strict Mode</FormLabel>
                    <FormDescription>البوت يرد فقط على الأسئلة المتعلقة بمجال عملك.</FormDescription>
                  </div>
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="offTopicResponse" render={({ field }) => (
                <FormItem>
                  <FormLabel>رد الموضوع الخارجي / Off-topic Response</FormLabel>
                  <FormControl><Textarea placeholder="عذراً، لا أستطيع المساعدة في هذا الموضوع..." {...field} className="bg-muted/30" /></FormControl>
                </FormItem>
              )} />
              <div className="space-y-3">
                <label className="text-sm font-medium">الكلمات المحظورة / Blocked Keywords</label>
                <div className="flex gap-2">
                  <Input value={keywordInput} onChange={(e) => setKeywordInput(e.target.value)} placeholder="أضف كلمة..." className="h-10 bg-muted/30"
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addKeyword(); } }}
                  />
                  <Button type="button" variant="outline" onClick={addKeyword} className="h-10">إضافة</Button>
                </div>
                {blockedKeywordsArr.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {blockedKeywordsArr.map((kw, i) => (
                      <Badge key={i} variant="secondary" className="gap-1 px-3 py-1">
                        {kw}
                        <button type="button" onClick={() => removeKeyword(kw)}><X className="w-3 h-3" /></button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <FormField control={form.control} name="maxOffTopicMessages" render={({ field }) => (
                <FormItem>
                  <FormLabel>الحد الأقصى للرسائل الخارجية / Max Off-topic Messages</FormLabel>
                  <FormControl><Input type="number" value={field.value} onChange={(e) => field.onChange(parseInt(e.target.value) || 3)} className="h-11 bg-muted/30 max-w-xs" min={1} /></FormControl>
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <Card className="border-none shadow-md shadow-black/10">
            <CardHeader className="bg-muted/30 rounded-t-xl border-b border-border/50 pb-4">
              <CardTitle className="text-lg flex items-center gap-2"><UserX className="w-5 h-5 text-primary" /> التحويل للبشري / Human Handoff</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <FormField control={form.control} name="handoffKeyword" render={({ field }) => (
                <FormItem>
                  <FormLabel>كلمة التحويل / Handoff Keyword</FormLabel>
                  <FormControl><Input placeholder="مثال: بشري" {...field} className="h-11 bg-muted/30 max-w-xs" /></FormControl>
                  <FormDescription>عندما يكتب العميل هذه الكلمة، يتم إيقاف البوت وتحويله للدعم البشري.</FormDescription>
                </FormItem>
              )} />
              <FormField control={form.control} name="handoffMessage" render={({ field }) => (
                <FormItem>
                  <FormLabel>رسالة التحويل / Handoff Message</FormLabel>
                  <FormControl><Textarea placeholder="تم تحويلك إلى فريق الدعم..." {...field} className="bg-muted/30" /></FormControl>
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <Card className="border-none shadow-md shadow-black/10">
            <CardHeader className="bg-muted/30 rounded-t-xl border-b border-border/50 pb-4">
              <CardTitle className="text-lg flex items-center gap-2"><Clock className="w-5 h-5 text-primary" /> ساعات العمل / Working Hours</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <FormField control={form.control} name="workingHoursEnabled" render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-xl border border-border/50 bg-muted/30 p-4 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">تفعيل ساعات العمل / Enable Working Hours</FormLabel>
                    <FormDescription>عند الإيقاف، يرد البوت على مدار الساعة 24/7 بغض النظر عن الوقت.</FormDescription>
                  </div>
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                </FormItem>
              )} />
              <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 transition-opacity ${!form.watch("workingHoursEnabled") ? "opacity-40 pointer-events-none" : ""}`}>
                <FormField control={form.control} name="businessHoursStart" render={({ field }) => (
                  <FormItem>
                    <FormLabel>من / Start</FormLabel>
                    <FormControl><Input type="time" {...field} className="h-11 bg-muted/30" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="businessHoursEnd" render={({ field }) => (
                  <FormItem>
                    <FormLabel>إلى / End</FormLabel>
                    <FormControl><Input type="time" {...field} className="h-11 bg-muted/30" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="timezone" render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>المنطقة الزمنية / Timezone</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger className="h-11 bg-muted/30"><SelectValue placeholder="اختر المنطقة الزمنية" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="Africa/Algiers">🇩🇿 الجزائر — Africa/Algiers (UTC+1)</SelectItem>
                        <SelectItem value="Africa/Tunis">🇹🇳 تونس — Africa/Tunis (UTC+1)</SelectItem>
                        <SelectItem value="Africa/Casablanca">🇲🇦 المغرب — Africa/Casablanca (UTC+1)</SelectItem>
                        <SelectItem value="Africa/Tripoli">🇱🇾 ليبيا — Africa/Tripoli (UTC+2)</SelectItem>
                        <SelectItem value="Africa/Cairo">🇪🇬 مصر — Africa/Cairo (UTC+2/3)</SelectItem>
                        <SelectItem value="Asia/Riyadh">🇸🇦 السعودية — Asia/Riyadh (UTC+3)</SelectItem>
                        <SelectItem value="Asia/Kuwait">🇰🇼 الكويت — Asia/Kuwait (UTC+3)</SelectItem>
                        <SelectItem value="Asia/Baghdad">🇮🇶 العراق — Asia/Baghdad (UTC+3)</SelectItem>
                        <SelectItem value="Asia/Dubai">🇦🇪 الإمارات — Asia/Dubai (UTC+4)</SelectItem>
                        <SelectItem value="Europe/Paris">🇫🇷 فرنسا — Europe/Paris (UTC+1/2)</SelectItem>
                        <SelectItem value="UTC">🌍 UTC (UTC+0)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>تأكد من اختيار المنطقة الزمنية الصحيحة لضبط ساعات العمل بدقة.</FormDescription>
                  </FormItem>
                )} />
                <FormField control={form.control} name="outsideHoursMessage" render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>رسالة خارج أوقات العمل / Outside Hours Message</FormLabel>
                    <FormControl><Textarea placeholder="عذراً، نحن خارج أوقات العمل حالياً..." {...field} className="bg-muted/30" /></FormControl>
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="currency" render={({ field }) => (
                <FormItem>
                  <FormLabel>العملة / Currency</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger className="h-11 bg-muted/30 max-w-xs"><SelectValue placeholder="اختر العملة" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {["DZD", "MAD", "EGP", "SAR", "AED", "USD", "EUR"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <Card className="border-none shadow-md shadow-black/10">
            <CardHeader className="bg-muted/30 rounded-t-xl border-b border-border/50 pb-4">
              <CardTitle className="text-lg flex items-center gap-2"><MessageCircle className="w-5 h-5 text-primary" /> التعليقات واللغة / Comments & Language</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <FormField control={form.control} name="respondToOrders" render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-xl border border-border/50 bg-muted/30 p-4 shadow-sm">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">الرد على الطلبات</FormLabel>
                      <FormDescription>يقوم البوت بمعالجة طلبات الشراء والرد عليها.</FormDescription>
                    </div>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="replyToComments" render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-xl border border-border/50 bg-muted/30 p-4 shadow-sm">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">الرد على التعليقات</FormLabel>
                      <FormDescription>يقوم البوت بالرد الآلي على تعليقات المنشورات.</FormDescription>
                    </div>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="sendDmOnComment" render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-xl border border-border/50 bg-muted/30 p-4 shadow-sm">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">إرسال رسالة خاصة</FormLabel>
                      <FormDescription>يرسل رسالة DM لصاحب التعليق.</FormDescription>
                    </div>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={!form.watch("replyToComments")} /></FormControl>
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="language" render={({ field }) => (
                <FormItem className="space-y-3 pt-4 border-t border-border/50">
                  <FormLabel className="text-base flex items-center gap-2"><Globe className="w-4 h-4 text-primary" /> لغة الردود / Language</FormLabel>
                  <FormControl>
                    <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex flex-wrap gap-6">
                      <FormItem className="flex items-center space-x-2 space-x-reverse">
                        <FormControl><RadioGroupItem value="auto" /></FormControl>
                        <FormLabel className="font-normal cursor-pointer">تلقائي (حسب لغة العميل)</FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-2 space-x-reverse">
                        <FormControl><RadioGroupItem value="arabic" /></FormControl>
                        <FormLabel className="font-normal cursor-pointer">عربي فقط</FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-2 space-x-reverse">
                        <FormControl><RadioGroupItem value="french" /></FormControl>
                        <FormLabel className="font-normal cursor-pointer">فرنسي فقط</FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-2 space-x-reverse">
                        <FormControl><RadioGroupItem value="english" /></FormControl>
                        <FormLabel className="font-normal cursor-pointer">إنجليزي فقط</FormLabel>
                      </FormItem>
                    </RadioGroup>
                  </FormControl>
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <Card className="border-none shadow-md shadow-black/10">
            <CardHeader className="bg-muted/30 rounded-t-xl border-b border-border/50 pb-4">
              <CardTitle className="text-lg flex items-center gap-2"><UserCheck className="w-5 h-5 text-primary" /> جمع البيانات / Lead Capture</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <FormField control={form.control} name="leadCaptureEnabled" render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-xl border border-border/50 bg-muted/30 p-4 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">تفعيل جمع البيانات / Enable Lead Capture</FormLabel>
                    <FormDescription>البوت يطلب بيانات التواصل ويحفظها في قائمة العملاء.</FormDescription>
                  </div>
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                </FormItem>
              )} />
              {form.watch("leadCaptureEnabled") && (
                <>
                  <FormField control={form.control} name="leadCaptureFields" render={({ field }) => {
                    const selectedFields = (field.value || "").split(",").filter(Boolean);
                    const toggleField = (f: string) => {
                      const next = selectedFields.includes(f)
                        ? selectedFields.filter(x => x !== f)
                        : [...selectedFields, f];
                      field.onChange(next.join(",") || "phone");
                    };
                    return (
                      <FormItem>
                        <FormLabel>البيانات المطلوبة / Fields to Capture</FormLabel>
                        <div className="flex flex-wrap gap-3 mt-2">
                          {[
                            { value: "phone", icon: "📱", label: "هاتف / Phone" },
                            { value: "email", icon: "📧", label: "بريد / Email" },
                            { value: "name", icon: "👤", label: "الاسم / Name" },
                          ].map(opt => {
                            const checked = selectedFields.includes(opt.value);
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => toggleField(opt.value)}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                                  checked
                                    ? "bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20"
                                    : "bg-muted/40 border-border hover:border-primary/40"
                                }`}
                              >
                                <span>{opt.icon}</span>
                                <span>{opt.label}</span>
                              </button>
                            );
                          })}
                        </div>
                        <FormDescription className="mt-2">اختر البيانات التي يطلبها البوت من العميل.</FormDescription>
                      </FormItem>
                    );
                  }} />
                  <FormField control={form.control} name="leadCaptureMessage" render={({ field }) => (
                    <FormItem>
                      <FormLabel>رسالة جمع البيانات / Lead Capture Message</FormLabel>
                      <FormControl><Textarea placeholder="لمتابعتك والرد على استفسارك، هل يمكنك مشاركة رقم هاتفك؟" {...field} className="bg-muted/30" /></FormControl>
                      <FormDescription>الرسالة التي يرسلها البوت لطلب بيانات العميل.</FormDescription>
                    </FormItem>
                  )} />
                </>
              )}
              <FormField control={form.control} name="useQuickReplies" render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-xl border border-border/50 bg-muted/30 p-4 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base flex items-center gap-2">
                      <MousePointerClick className="w-4 h-4 text-primary" />
                      أزرار الرد السريع / Quick Reply Buttons
                    </FormLabel>
                    <FormDescription>عرض أزرار اقتراح في أول رسالة (منتجات، مواعيد، أسعار...).</FormDescription>
                  </div>
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                </FormItem>
              )} />

              {form.watch("useQuickReplies") && (
                <div className="rounded-xl border border-border/50 bg-muted/30 p-4 space-y-4">
                  <div className="flex items-center gap-2">
                    <MousePointerClick className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold text-foreground">تخصيص الأزرار / Customize Buttons</span>
                    <span className="text-xs text-muted-foreground mr-auto">{qrButtons.length} / 13 زر</span>
                  </div>

                  {/* Existing buttons list */}
                  <div className="space-y-2">
                    {qrButtons.map((btn, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-card rounded-lg border border-border/50 p-2.5 shadow-sm">
                        <div className="flex-1 grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={btn.title}
                            maxLength={20}
                            onChange={(e) => {
                              const updated = [...qrButtons];
                              updated[idx] = { ...updated[idx]!, title: e.target.value };
                              setQrButtons(updated);
                            }}
                            placeholder="نص الزر (20 حرفاً)"
                            className="text-sm border border-border/50 rounded-lg px-3 py-1.5 bg-muted/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
                          />
                          <select
                            value={btn.payload}
                            onChange={(e) => {
                              const updated = [...qrButtons];
                              updated[idx] = { ...updated[idx]!, payload: e.target.value };
                              setQrButtons(updated);
                            }}
                            className="text-sm border border-border/50 rounded-lg px-3 py-1.5 bg-muted/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
                          >
                            <option value="PRODUCTS">📦 استفسار منتجات</option>
                            <option value="BROWSE_CATALOG">🛍️ تصفح الكتالوج</option>
                            <option value="APPOINTMENT">📅 حجز موعد</option>
                            <option value="DELIVERY">🚚 خدمة التوصيل</option>
                            <option value="FAQ">❓ أسئلة شائعة</option>
                            <option value="CONTACT">📞 تواصل معنا</option>
                          </select>
                        </div>
                        <button
                          type="button"
                          onClick={() => setQrButtons(qrButtons.filter((_, i) => i !== idx))}
                          className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Add new button */}
                  {qrButtons.length < 13 && (
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        value={newQrTitle}
                        maxLength={20}
                        onChange={(e) => setNewQrTitle(e.target.value)}
                        placeholder="نص الزر الجديد..."
                        className="flex-1 text-sm border border-border/50 rounded-lg px-3 py-2 bg-card focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                      <select
                        value={newQrPayload}
                        onChange={(e) => setNewQrPayload(e.target.value)}
                        className="text-sm border border-border/50 rounded-lg px-3 py-2 bg-card focus:outline-none focus:ring-2 focus:ring-primary/20"
                      >
                        <option value="PRODUCTS">📦 منتجات</option>
                        <option value="BROWSE_CATALOG">🛍️ كتالوج</option>
                        <option value="APPOINTMENT">📅 مواعيد</option>
                        <option value="DELIVERY">🚚 توصيل</option>
                        <option value="FAQ">❓ أسئلة شائعة</option>
                        <option value="CONTACT">📞 تواصل</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          if (!newQrTitle.trim()) return;
                          setQrButtons([...qrButtons, { title: newQrTitle.trim(), payload: newQrPayload }]);
                          setNewQrTitle("");
                        }}
                        className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        إضافة
                      </button>
                    </div>
                  )}

                  {/* Reset to defaults */}
                  <button
                    type="button"
                    onClick={() => setQrButtons(DEFAULT_QR_BUTTONS)}
                    className="text-xs text-muted-foreground hover:text-primary transition-colors underline-offset-2 hover:underline"
                  >
                    إعادة تعيين إلى الافتراضي
                  </button>

                  <p className="text-xs text-muted-foreground">
                    ملاحظة: تُرسَل الأزرار مع أول رسالة من عميل جديد. الحد الأقصى 13 زر، وعنوان الزر 20 حرفاً.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-none shadow-md shadow-black/10">
            <CardHeader className="bg-muted/30 rounded-t-xl border-b border-border/50 pb-4">
              <CardTitle className="text-lg flex items-center gap-2"><ShoppingCart className="w-5 h-5 text-primary" /> استرداد السلة المتروكة / Abandoned Cart</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <FormField control={form.control} name="abandonedCartEnabled" render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-xl border border-border/50 bg-muted/30 p-4 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">تفعيل التذكير التلقائي / Enable Auto Reminder</FormLabel>
                    <FormDescription>إرسال رسالة تذكير للعملاء الذين سألوا عن منتج ولم يطلبوا.</FormDescription>
                  </div>
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                </FormItem>
              )} />
              {form.watch("abandonedCartEnabled") && (
                <>
                  <FormField control={form.control} name="abandonedCartDelayHours" render={({ field }) => (
                    <FormItem>
                      <FormLabel>مدة الانتظار (بالساعات) / Delay Hours</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={24}
                          step={1}
                          value={field.value}
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 1)}
                          className="h-11 bg-muted/30 max-w-xs"
                        />
                      </FormControl>
                      <FormDescription>الفترة بعد الاستفسار قبل إرسال التذكير (1 - 24 ساعة).</FormDescription>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="abandonedCartMessage" render={({ field }) => (
                    <FormItem>
                      <FormLabel>رسالة التذكير / Reminder Message</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="مرحباً! 👋 لاحظنا اهتمامك بـ {product_name}&#10;هل تريد إتمام طلبك؟"
                          {...field}
                          className="bg-muted/30 min-h-[100px]"
                        />
                      </FormControl>
                      <FormDescription>
                        المتغيرات المتاحة: <code className="bg-muted px-1 rounded">{"{product_name}"}</code> اسم المنتج، <code className="bg-muted px-1 rounded">{"{page_name}"}</code> اسم الصفحة
                      </FormDescription>
                    </FormItem>
                  )} />
                </>
              )}
              {cartStats && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-border/50">
                  <div className="p-4 rounded-xl bg-muted/30 border border-border/50 text-center">
                    <p className="text-sm text-muted-foreground">تذكيرات مُرسلة / Reminders Sent</p>
                    <p className="text-2xl font-bold mt-1">{cartStats.remindersSent}</p>
                  </div>
                  <div className="p-4 rounded-xl bg-muted/30 border border-border/50 text-center">
                    <p className="text-sm text-muted-foreground">تحويلات / Conversions</p>
                    <p className="text-2xl font-bold mt-1">{cartStats.conversions}</p>
                  </div>
                  <div className="p-4 rounded-xl bg-muted/30 border border-border/50 text-center">
                    <p className="text-sm text-muted-foreground">معدل التحويل / Rate</p>
                    <p className="text-2xl font-bold mt-1">{cartStats.conversionRate}%</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

        </form>
      </Form>
    </motion.div>
  );
}
