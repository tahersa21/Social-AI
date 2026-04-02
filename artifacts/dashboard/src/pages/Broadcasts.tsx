import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Send, Plus, Trash2, Loader2, Megaphone, Users, Calendar, ImageIcon, Clock, AlertTriangle } from "lucide-react";
import {
  useListBroadcasts,
  useCreateBroadcast,
  useDeleteBroadcast,
  useSendBroadcast,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { getToken } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  draft: { label: "مسودة / Draft", className: "bg-gray-100 text-gray-700" },
  sent: { label: "مُرسلة / Sent", className: "bg-green-100 text-green-700" },
  failed: { label: "فشلت / Failed", className: "bg-red-100 text-red-700" },
};

const TARGET_OPTIONS: { value: "all" | "appointments" | "label"; label: string }[] = [
  { value: "all", label: "🌍 جميع المستخدمين النشطين (24 ساعة)" },
  { value: "appointments", label: "📅 أصحاب المواعيد" },
  { value: "label", label: "🏷️ تصنيف محدد" },
];

export default function Broadcasts() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [messageText, setMessageText] = useState("");
  const [targetFilter, setTargetFilter] = useState<"all" | "appointments" | "label">("all");
  const [targetLabel, setTargetLabel] = useState("");
  const [sendMode, setSendMode] = useState<"immediate" | "scheduled">("immediate");
  const [scheduledAt, setScheduledAt] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const { data: broadcasts = [], isLoading } = useListBroadcasts();
  const { mutate: deleteBroadcast } = useDeleteBroadcast();
  const { mutate: sendBroadcastMut } = useSendBroadcast();

  const handleCreate = async () => {
    if (!title.trim() || !messageText.trim()) {
      toast({ title: "خطأ", description: "العنوان والرسالة مطلوبان", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const token = getToken();
      const formData = new FormData();
      formData.append("title", title);
      formData.append("messageText", messageText);
      formData.append("targetFilter", targetFilter);
      if (targetFilter === "label" && targetLabel) formData.append("targetLabel", targetLabel);
      if (sendMode === "scheduled" && scheduledAt) formData.append("scheduledAt", scheduledAt);
      if (imageFile) formData.append("broadcastImage", imageFile);

      const res = await fetch(`${base}/api/broadcasts`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(err.message || "Failed to create");
      }

      queryClient.invalidateQueries({ queryKey: ["/api/broadcasts"] });
      toast({ title: "تم إنشاء البث" });
      resetForm();
      setOpen(false);
    } catch (err) {
      toast({ title: "خطأ", description: err instanceof Error ? err.message : "حدث خطأ", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const resetForm = () => {
    setTitle(""); setMessageText(""); setTargetFilter("all");
    setTargetLabel(""); setSendMode("immediate"); setScheduledAt("");
    setImageFile(null); setImagePreview(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const handleSend = (id: number) => {
    setSendingId(id);
    sendBroadcastMut(
      { id },
      {
        onSuccess: (data) => {
          queryClient.invalidateQueries({ queryKey: ["/api/broadcasts"] });
          const result = data as { sentCount?: number; totalRecipients?: number };
          toast({ title: `تم الإرسال`, description: `أُرسلت إلى ${result.sentCount ?? 0} من أصل ${result.totalRecipients ?? 0} مستخدم` });
          setSendingId(null);
        },
        onError: () => {
          toast({ title: "خطأ في الإرسال", variant: "destructive" });
          setSendingId(null);
        },
      }
    );
  };

  const handleDelete = (id: number) => {
    deleteBroadcast(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/broadcasts"] });
          toast({ title: "تم الحذف" });
        },
      }
    );
  };

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Facebook Policy Warning Banner */}
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-300 rounded-xl p-4 text-amber-800">
        <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
        <div className="space-y-1">
          <p className="font-semibold text-sm">⚠️ تنبيه — سياسة فيسبوك للرسائل الجماعية</p>
          <p className="text-sm leading-relaxed">
            لا يُنصح بالاستخدام المتكرر لهذه الميزة تجنباً لتعليق حساب صفحتك أو تقييد الرسائل من طرف فيسبوك.
            يُوصى بإرسال بث جماعي <strong>مرة واحدة في الأسبوع كحد أقصى</strong>، أو عند الضرورة القصوى فقط.
            تذكّر أن الإرسال يقتصر على المستخدمين الذين تواصلوا معك خلال آخر 24 ساعة.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">البث الجماعي / Broadcasts</h1>
          <p className="text-muted-foreground text-sm mt-1">إرسال رسائل جماعية للمستخدمين النشطين خلال 24 ساعة</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              بث جديد
            </Button>
          </DialogTrigger>
          <DialogContent dir="rtl" className="max-w-lg">
            <DialogHeader>
              <DialogTitle>إنشاء بث جديد</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2 max-h-[70vh] overflow-y-auto pe-1">
              <div className="space-y-1.5">
                <Label>العنوان</Label>
                <Input placeholder="عنوان البث..." value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>نص الرسالة</Label>
                <Textarea
                  placeholder="اكتب رسالتك هنا..."
                  className="min-h-[100px]"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                />
              </div>

              {/* Image upload */}
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <ImageIcon className="w-4 h-4 text-muted-foreground" />
                  صورة مرفقة (اختياري) / Attached Image
                </Label>
                <Input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setImageFile(f);
                      setImagePreview(URL.createObjectURL(f));
                    }
                  }}
                />
                {imagePreview && (
                  <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                    <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => { setImageFile(null); setImagePreview(null); if (imageInputRef.current) imageInputRef.current.value = ""; }}
                      className="absolute top-2 start-2 bg-black/50 text-white text-xs px-2 py-1 rounded-lg"
                    >
                      حذف الصورة
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>الجمهور المستهدف</Label>
                <Select value={targetFilter} onValueChange={(v) => setTargetFilter(v as "all" | "appointments" | "label")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TARGET_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {targetFilter === "label" && (
                <div className="space-y-1.5">
                  <Label>التصنيف</Label>
                  <Input placeholder="new / interested / customer ..." value={targetLabel} onChange={(e) => setTargetLabel(e.target.value)} />
                </div>
              )}

              {/* Schedule */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  وقت الإرسال / Send Timing
                </Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSendMode("immediate")}
                    className={`flex-1 py-2 rounded-xl border text-sm font-medium transition-all ${sendMode === "immediate" ? "bg-primary text-primary-foreground border-primary" : "bg-slate-50 border-border"}`}
                  >
                    🚀 فوري / Immediate
                  </button>
                  <button
                    type="button"
                    onClick={() => setSendMode("scheduled")}
                    className={`flex-1 py-2 rounded-xl border text-sm font-medium transition-all ${sendMode === "scheduled" ? "bg-primary text-primary-foreground border-primary" : "bg-slate-50 border-border"}`}
                  >
                    ⏰ مجدول / Scheduled
                  </button>
                </div>
                {sendMode === "scheduled" && (
                  <Input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="h-10"
                  />
                )}
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
                ⚠️ سيتم الإرسال فقط للمستخدمين الذين تواصلوا معك خلال آخر 24 ساعة (متطلب فيسبوك)
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => { setOpen(false); resetForm(); }}>إلغاء</Button>
                <Button onClick={handleCreate} disabled={creating}>
                  {creating && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
                  حفظ
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-primary" />
            قائمة البث
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : broadcasts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Megaphone className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>لا يوجد بث حتى الآن. أنشئ أول بث جماعي!</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>العنوان</TableHead>
                  <TableHead>الجمهور</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>الإرسال</TableHead>
                  <TableHead>التاريخ</TableHead>
                  <TableHead>إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {broadcasts.map((b) => {
                  const statusInfo = STATUS_BADGE[b.status] ?? STATUS_BADGE.draft;
                  return (
                    <TableRow key={b.id}>
                      <TableCell>
                        <div className="flex items-start gap-2">
                          {b.imageUrl && <ImageIcon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />}
                          <div>
                            <div className="font-medium">{b.title}</div>
                            <div className="text-xs text-muted-foreground mt-0.5 max-w-[200px] truncate">{b.messageText}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <Users className="w-3.5 h-3.5 text-muted-foreground" />
                          {b.targetFilter === "all" ? "الكل" : b.targetFilter === "appointments" ? "مواعيد" : `تصنيف: ${b.targetLabel ?? ""}`}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusInfo.className}`}>{statusInfo.label}</span>
                        {b.scheduledAt && b.status === "draft" && (
                          <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-0.5">
                            <Clock className="w-3 h-3" />
                            {new Date(b.scheduledAt).toLocaleDateString("ar-DZ")}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {b.status === "sent" ? (
                          <div className="flex items-center gap-1 text-sm text-green-700">
                            <Send className="w-3.5 h-3.5" />
                            {b.sentCount}/{b.totalRecipients}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="w-3.5 h-3.5" />
                          {new Date(b.createdAt).toLocaleDateString("ar-DZ")}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {b.status === "draft" && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="sm" variant="default" className="gap-1.5">
                                  <Send className="w-3.5 h-3.5" />
                                  إرسال
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent dir="rtl">
                                <AlertDialogHeader>
                                  <AlertDialogTitle>تأكيد الإرسال</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    سيتم إرسال هذا البث لجميع المستخدمين الذين تواصلوا معك خلال آخر <strong>24 ساعة</strong>. لا يمكن التراجع عن هذه العملية.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleSend(b.id)}
                                    disabled={sendingId === b.id}
                                  >
                                    {sendingId === b.id && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
                                    نعم، أرسل الآن
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent dir="rtl">
                              <AlertDialogHeader>
                                <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
                                <AlertDialogDescription>هل أنت متأكد من حذف هذا البث؟ لا يمكن التراجع.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(b.id)} className="bg-destructive text-white hover:bg-destructive/90">
                                  حذف
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
