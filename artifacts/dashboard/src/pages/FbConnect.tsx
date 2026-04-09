import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { motion } from "framer-motion";
import { Facebook, Save, Loader2, TestTube2, CheckCircle2, XCircle, Copy, Check, Shield, Link, Hash, KeyRound, Webhook, AlertTriangle, LockKeyhole, ExternalLink, Clock, ListChecks, RefreshCw } from "lucide-react";
import { useGetFbSettings, useSaveFbSettings, useTestFbConnection, useSubscribeFeedEvents } from "@workspace/api-client-react";
import { toast } from "@/hooks/use-toast";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const formSchema = z.object({
  pageAccessToken: z.string().min(10, "Page Access Token مطلوب"),
  verifyToken: z.string().min(4, "Verify Token مطلوب"),
  pageId: z.string().min(4, "Page ID مطلوب"),
  appSecret: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={handleCopy}>
      {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
    </Button>
  );
}

export default function FbConnect() {
  const { data: settings, isLoading } = useGetFbSettings();
  const saveMut = useSaveFbSettings();
  const testMut = useTestFbConnection();
  const subscribeMut = useSubscribeFeedEvents();

  const webhookUrl = `${window.location.origin}/api/webhook`;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      pageAccessToken: "",
      verifyToken: "",
      pageId: "",
      appSecret: "",
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        pageAccessToken: "",
        verifyToken: settings.verifyToken || "",
        pageId: settings.pageId || "",
        appSecret: "",
      });
    }
  }, [settings, form]);

  const onSubmit = (values: FormValues) => {
    const payload: any = {
      pageAccessToken: values.pageAccessToken,
      verifyToken: values.verifyToken,
      pageId: values.pageId,
    };
    if (values.appSecret) payload.appSecret = values.appSecret;

    saveMut.mutate(
      { data: payload },
      {
        onSuccess: () => {
          toast({ title: "تم الحفظ", description: "تم حفظ إعدادات فيسبوك بنجاح" });
          form.setValue("pageAccessToken", "");
          form.setValue("appSecret", "");
        },
        onError: (err: any) => {
          toast({ title: "خطأ", description: err.message, variant: "destructive" });
        },
      }
    );
  };

  const handleTest = () => {
    testMut.refetch();
  };

  const handleSubscribe = () => {
    subscribeMut.mutate(undefined, {
      onSuccess: (data) => {
        if (data.success) {
          toast({ title: "✅ تم التفعيل", description: "تم الاشتراك في أحداث التعليقات بنجاح" });
        } else {
          toast({ title: "فشل التفعيل", description: data.error ?? "خطأ غير معروف", variant: "destructive" });
        }
      },
      onError: (err: any) => {
        toast({ title: "خطأ", description: err.message, variant: "destructive" });
      },
    });
  };

  const isConnected = settings?.pageId && settings?.verifyToken;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">ربط فيسبوك</h1>
          <p className="text-muted-foreground mt-1">ربط البوت بصفحتك على فيسبوك لاستقبال الرسائل والتعليقات</p>
        </div>
        {isConnected ? (
          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 px-3 py-1.5 text-sm font-semibold gap-1.5">
            <CheckCircle2 className="w-4 h-4" /> متصل / Connected
          </Badge>
        ) : (
          <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-semibold gap-1.5">
            <XCircle className="w-4 h-4" /> غير متصل / Not Connected
          </Badge>
        )}
      </div>

      {/* Long-lived Token Warning */}
      <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5 shadow-sm space-y-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800 leading-relaxed flex-1">
            <p className="font-bold text-base mb-2">⚠️ تأكد من استخدام Page Access Token دائم (Long-lived)</p>
            <p className="mb-3 text-amber-700">
              الـ Token المؤقت ينتهي خلال ساعتين فقط وسيوقف البوت. يجب الحصول على Token دائم:
            </p>
            <div className="bg-amber-100/70 rounded-xl p-4 space-y-2">
              <p className="font-bold text-amber-900 flex items-center gap-2">
                <Clock className="w-4 h-4" /> للحصول على Token دائم:
              </p>
              <ol className="list-decimal list-inside space-y-1.5 text-amber-800">
                <li>اذهب إلى <strong>Graph API Explorer</strong> (الرابط أدناه)</li>
                <li>اضغط <strong>Generate Token</strong> مع صلاحية <code className="bg-amber-200 px-1 rounded text-xs">pages_messaging</code></li>
                <li>انسخ الـ Token الذي ظهر</li>
                <li>افتحه في <strong>Access Token Debugger Tool</strong></li>
                <li>اضغط <strong>Extend Access Token</strong> للحصول على Token دائم (60 يوم)</li>
              </ol>
            </div>
          </div>
        </div>
        <a
          href="https://developers.facebook.com/tools/explorer"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full bg-[#1877F2] hover:bg-[#1565C0] text-white font-semibold rounded-xl px-4 py-2.5 text-sm transition-colors shadow-sm"
        >
          <ExternalLink className="w-4 h-4" />
          🔧 فتح Graph API Explorer
        </a>
      </div>

      {/* Required Permissions Checklist */}
      <Card className="border-none shadow-md shadow-black/10 rounded-2xl bg-gradient-to-br from-emerald-50/50 to-teal-50/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="w-5 h-5 text-emerald-600" />
            الصلاحيات المطلوبة / Required Permissions
          </CardTitle>
          <CardDescription>
            تأكد من تفعيل جميع هذه الصلاحيات عند إنشاء الـ Token في Graph API Explorer
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { perm: "pages_messaging", desc: "إرسال واستقبال الرسائل" },
              { perm: "pages_read_engagement", desc: "قراءة التفاعلات" },
              { perm: "pages_manage_metadata", desc: "إدارة إعدادات الصفحة" },
              { perm: "pages_show_list", desc: "عرض قائمة الصفحات" },
              { perm: "pages_manage_posts", desc: "إدارة المنشورات (للتعليقات)" },
              { perm: "pages_read_user_content", desc: "قراءة محتوى المستخدمين (للتعليقات)" },
            ].map(({ perm, desc }) => (
              <div key={perm} className="flex items-start gap-2.5 bg-card rounded-xl border border-emerald-100 px-3 py-2.5 shadow-sm">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <code className="text-xs font-mono font-bold text-foreground/80">{perm}</code>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Webhook URL Card */}
      <Card className="border-none shadow-md shadow-black/10 rounded-2xl bg-gradient-to-br from-blue-50/50 to-indigo-50/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Webhook className="w-5 h-5 text-blue-600" />
            رابط Webhook
          </CardTitle>
          <CardDescription>
            أدخل هذا الرابط في إعدادات فيسبوك Developer Portal تحت Messenger Webhooks
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Link className="w-3.5 h-3.5" /> Callback URL
            </p>
            <div className="flex items-center gap-2 bg-card rounded-xl border border-border/50 px-4 py-3 shadow-sm">
              <code className="flex-1 text-sm font-mono text-foreground/80 break-all">{webhookUrl}</code>
              <CopyButton text={webhookUrl} />
            </div>
          </div>
          <div className="bg-blue-50/80 rounded-xl p-4 text-sm text-blue-700 space-y-1 leading-relaxed">
            <p className="font-bold">خطوات الإعداد (2026 Facebook API):</p>
            <ol className="list-decimal list-inside space-y-1.5 text-blue-600">
              <li>افتح <strong>Facebook Developer Portal</strong> وأنشئ تطبيقاً (أو افتح تطبيقك الحالي)</li>
              <li>اذهب إلى <strong>App → Messenger → Settings</strong></li>
              <li>في قسم <strong>Access Tokens</strong>، اضغط <strong>Add Page</strong> واختر صفحتك</li>
              <li>اضغط <strong>Generate Token</strong> — <span className="text-amber-600 font-bold">انسخه فوراً! يظهر مرة واحدة فقط</span></li>
              <li>في قسم <strong>Webhooks</strong>، أدخل Callback URL أعلاه و Verify Token من النموذج أدناه</li>
              <li>اشترك في الحقول: <code className="bg-blue-100 px-1 rounded">messages, feed</code></li>
              <li>من <strong>App → Settings → Basic</strong> انسخ <strong>App Secret</strong> وأدخله أدناه (للتحقق من Webhook)</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      {/* Credentials Form */}
      <Card className="border-none shadow-md shadow-black/10 rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="w-5 h-5 text-primary" />
            بيانات الاعتماد / Credentials
          </CardTitle>
          <CardDescription>
            {isConnected
              ? "الإعدادات محفوظة. أدخل Page Access Token جديداً لتحديثه."
              : "أدخل بيانات صفحتك على فيسبوك لتفعيل البوت."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-8 h-8 animate-spin text-primary/40" />
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="pageId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5 font-semibold">
                        <Hash className="w-4 h-4 text-muted-foreground" />
                        Page ID
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="123456789012345" {...field} className="rounded-xl bg-muted/30 border-border/60 focus:bg-card transition-colors" dir="ltr" />
                      </FormControl>
                      <FormDescription>الرقم الموجود في about صفحتك على فيسبوك</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="verifyToken"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5 font-semibold">
                        <Shield className="w-4 h-4 text-muted-foreground" />
                        Verify Token
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="أي نص سري من اختيارك" {...field} className="rounded-xl bg-muted/30 border-border/60 focus:bg-card transition-colors" dir="ltr" />
                      </FormControl>
                      <FormDescription>كلمة سرية تتطابق مع ما ستدخله في فيسبوك Developer</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="pageAccessToken"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5 font-semibold">
                        <KeyRound className="w-4 h-4 text-muted-foreground" />
                        Page Access Token
                        {isConnected && (
                          <Badge variant="secondary" className="text-xs mr-auto font-normal">محفوظ / Saved</Badge>
                        )}
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder={isConnected ? "اتركه فارغاً للإبقاء على القيمة الحالية" : "EAAxxxxxxx..."}
                          {...field}
                          className="rounded-xl bg-muted/30 border-border/60 focus:bg-card transition-colors font-mono"
                          dir="ltr"
                        />
                      </FormControl>
                      <FormDescription>
                        مشفّر ومخزّن بأمان · يُولَّد من App → Messenger → Settings → Access Tokens → Generate Token
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="appSecret"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5 font-semibold">
                        <LockKeyhole className="w-4 h-4 text-muted-foreground" />
                        App Secret
                        {settings?.appSecret && (
                          <Badge variant="secondary" className="text-xs mr-auto font-normal">محفوظ / Saved</Badge>
                        )}
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder={settings?.appSecret ? "اتركه فارغاً للإبقاء على القيمة الحالية" : "أدخل App Secret..."}
                          {...field}
                          className="rounded-xl bg-muted/30 border-border/60 focus:bg-card transition-colors font-mono"
                          dir="ltr"
                        />
                      </FormControl>
                      <FormDescription>
                        من Facebook App → Settings → Basic → App Secret · يُستخدم للتحقق من صحة Webhook (X-Hub-Signature-256)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Separator className="my-2" />

                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    type="submit"
                    disabled={saveMut.isPending}
                    className="flex-1 rounded-xl shadow-sm h-11"
                  >
                    {saveMut.isPending ? (
                      <Loader2 className="w-4 h-4 me-2 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 me-2" />
                    )}
                    حفظ الإعدادات
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleTest}
                    disabled={testMut.isFetching || !isConnected}
                    className="flex-1 rounded-xl shadow-sm h-11 bg-card border-border/60 hover:bg-muted/40"
                  >
                    {testMut.isFetching ? (
                      <Loader2 className="w-4 h-4 me-2 animate-spin" />
                    ) : (
                      <TestTube2 className="w-4 h-4 me-2" />
                    )}
                    اختبار الاتصال / Test
                  </Button>
                </div>

                {testMut.data && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-3"
                  >
                    <div
                      className={`rounded-xl p-4 flex items-start gap-3 ${
                        testMut.data.success
                          ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
                          : "bg-red-50 border border-red-200 text-red-700"
                      }`}
                    >
                      {testMut.data.success ? (
                        <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <p className="font-bold text-sm">
                          {testMut.data.success
                            ? `✅ متصل بصفحة: ${testMut.data.pageName ?? "—"} (ID: ${testMut.data.pageId ?? "—"})`
                            : "فشل الاتصال"}
                        </p>
                        {testMut.data.error && (
                          <p className="text-sm mt-0.5 font-mono">{testMut.data.error}</p>
                        )}
                      </div>
                    </div>

                    {/* Permission / token expiry specific guidance */}
                    {!testMut.data.success && testMut.data.error && (
                      /permission|oauth|expired|صلاحي|منتهي/i.test(testMut.data.error)
                    ) && (
                      <div className="rounded-xl p-4 flex items-start gap-3 bg-amber-50 border border-amber-300 text-amber-800">
                        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                        <div className="text-sm space-y-2">
                          <p className="font-bold">
                            الـ Token منتهي أو يفتقر للصلاحيات المطلوبة.
                          </p>
                          <p>يرجى إنشاء Token جديد مع الصلاحيات الكاملة:</p>
                          <ol className="list-decimal list-inside space-y-1 text-amber-700">
                            <li>افتح <strong>Graph API Explorer</strong></li>
                            <li>Generate Token مع صلاحيات <code className="bg-amber-200 px-1 rounded text-xs">pages_messaging</code> وبقية الصلاحيات</li>
                            <li>افتحه في <strong>Access Token Tool</strong> واضغط <strong>Extend Access Token</strong></li>
                          </ol>
                          <a
                            href="https://developers.facebook.com/tools/explorer"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-[#1877F2] hover:underline font-semibold text-xs mt-1"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            فتح Graph API Explorer
                          </a>
                        </div>
                      </div>
                    )}

                    {testMut.data.pageIdMismatch && (
                      <div className="rounded-xl p-4 flex items-start gap-3 bg-amber-50 border border-amber-300 text-amber-800">
                        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                        <p className="text-sm font-bold">
                          ⚠️ الـ Token لصفحة مختلفة عن الـ Page ID المدخل — تأكد من إدخال Page ID الصحيح ({testMut.data.pageId})
                        </p>
                      </div>
                    )}
                  </motion.div>
                )}
              </form>
            </Form>
          )}
        </CardContent>
      </Card>

      {/* Subscribed Fields Card */}
      <Card className="border-none shadow-md shadow-black/10 rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Facebook className="w-5 h-5 text-[#1877F2]" />
            حقول Webhook المشترك بها
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {["messages", "messaging_postbacks", "feed", "message_reactions"].map((field) => (
              <Badge key={field} variant="secondary" className="font-mono text-xs px-3 py-1.5 bg-muted text-foreground/80">
                {field}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            تأكد من الاشتراك في هذه الحقول في إعدادات Webhooks على Facebook Developer Portal
          </p>
          <Separator />
          <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 space-y-3">
            <p className="text-sm font-semibold text-blue-800 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 shrink-0" />
              تفعيل استقبال التعليقات
            </p>
            <p className="text-xs text-blue-700 leading-relaxed">
              إذا لم تصلك أحداث التعليقات، اضغط هذا الزر لتسجيل الصفحة رسمياً في اشتراك <code className="bg-blue-100 px-1 rounded">feed</code> عبر Graph API.
            </p>
            <Button
              type="button"
              onClick={handleSubscribe}
              disabled={subscribeMut.isPending || !isConnected}
              className="w-full rounded-xl bg-[#1877F2] hover:bg-[#1565C0] text-white shadow-sm h-10 text-sm"
            >
              {subscribeMut.isPending ? (
                <Loader2 className="w-4 h-4 me-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 me-2" />
              )}
              تفعيل / إعادة تفعيل اشتراك التعليقات
            </Button>
            {subscribeMut.data && (
              <div className={`rounded-xl p-3 flex items-center gap-2 text-sm ${
                subscribeMut.data.success
                  ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
                  : "bg-red-50 border border-red-200 text-red-700"
              }`}>
                {subscribeMut.data.success ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{subscribeMut.data.success ? subscribeMut.data.message : subscribeMut.data.error}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
