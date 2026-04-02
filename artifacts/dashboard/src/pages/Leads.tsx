import { useState } from "react";
import { motion } from "framer-motion";
import { Download, Trash2, Loader2, UserCheck, Phone, Mail, Tag, Edit2, Check, X, ShoppingBag } from "lucide-react";
import { useListLeads, useUpdateLead, useDeleteLead } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { getToken } from "@/lib/auth";

const LABEL_OPTIONS = [
  { value: "interested", label: "مهتم / Interested", color: "bg-yellow-100 text-yellow-700" },
  { value: "customer", label: "عميل / Customer", color: "bg-green-100 text-green-700" },
  { value: "vip", label: "VIP ⭐", color: "bg-purple-100 text-purple-700" },
  { value: "cold", label: "بارد / Cold", color: "bg-slate-100 text-slate-600" },
  { value: "issue", label: "مشكلة / Issue", color: "bg-red-100 text-red-700" },
];

const getLabelStyle = (label: string) => LABEL_OPTIONS.find((l) => l.value === label) ?? { label, color: "bg-gray-100 text-gray-600" };

function EditableNotes({ id, notes }: { id: number; notes: string | null }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(notes ?? "");
  const { mutate: updateLead, isPending } = useUpdateLead();

  const save = () => {
    updateLead({ id, data: { notes: val } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
        setEditing(false);
      },
    });
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-1 group">
        <span className="text-sm text-muted-foreground truncate max-w-[150px]">{notes ?? "—"}</span>
        <Button variant="ghost" size="icon" className="w-5 h-5 opacity-0 group-hover:opacity-100" onClick={() => setEditing(true)}>
          <Edit2 className="w-3 h-3" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Input className="h-7 text-sm w-36" value={val} onChange={(e) => setVal(e.target.value)} autoFocus />
      <Button variant="ghost" size="icon" className="w-6 h-6" onClick={save} disabled={isPending}>
        {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3 text-green-600" />}
      </Button>
      <Button variant="ghost" size="icon" className="w-6 h-6" onClick={() => { setEditing(false); setVal(notes ?? ""); }}>
        <X className="w-3 h-3 text-red-500" />
      </Button>
    </div>
  );
}

export default function Leads() {
  const queryClient = useQueryClient();
  const [labelFilter, setLabelFilter] = useState("all");

  const { data: leads = [], isLoading } = useListLeads();
  const { mutate: updateLead } = useUpdateLead();
  const { mutate: deleteLead } = useDeleteLead();

  const filtered = labelFilter === "all" ? leads : leads.filter((l) => l.label === labelFilter);

  const handleLabelChange = (id: number, label: string) => {
    updateLead({ id, data: { label } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
        toast({ title: "تم تحديث التصنيف" });
      },
    });
  };

  const handleDelete = (id: number) => {
    deleteLead({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
        toast({ title: "تم الحذف" });
      },
    });
  };

  const handleExport = async () => {
    try {
      const token = getToken();
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/leads/export`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "تم تصدير قائمة العملاء" });
    } catch {
      toast({ title: "خطأ في التصدير", variant: "destructive" });
    }
  };

  const today = new Date().toDateString();
  const counts = LABEL_OPTIONS.reduce<Record<string, number>>((acc, opt) => {
    acc[opt.value] = leads.filter((l) => l.label === opt.value).length;
    return acc;
  }, {});

  const summaryStats = [
    { key: "all", label: "إجمالي / Total", value: leads.length, color: "text-slate-700" },
    { key: "today", label: "جديد اليوم / New Today", value: leads.filter(l => { const d = new Date(l.createdAt); return !isNaN(d.getTime()) && d.toDateString() === today; }).length, color: "text-blue-600" },
    { key: "customer", label: "عملاء / Customers", value: counts["customer"] ?? 0, color: "text-green-600" },
    { key: "vip", label: "VIP ⭐", value: counts["vip"] ?? 0, color: "text-purple-600" },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">العملاء المحتملون / Leads</h1>
          <p className="text-muted-foreground text-sm mt-1">قائمة العملاء الذين تواصلوا عبر الماسنجر</p>
        </div>
        <Button variant="outline" onClick={handleExport} className="gap-2">
          <Download className="w-4 h-4" />
          تصدير CSV
        </Button>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {summaryStats.map((stat) => (
          <button
            key={stat.key}
            onClick={() => stat.key !== "today" && setLabelFilter(labelFilter === stat.key ? "all" : stat.key)}
            className={`rounded-xl p-4 text-start transition-all border bg-card shadow-sm hover:shadow-md ${
              (stat.key !== "today" && labelFilter === stat.key) ? "border-primary ring-1 ring-primary/20" : "border-border hover:border-primary/40"
            } ${stat.key === "today" ? "cursor-default" : "cursor-pointer"}`}
          >
            <div className={`text-3xl font-bold ${stat.color}`}>{stat.value}</div>
            <div className="text-xs text-muted-foreground mt-1 font-medium">{stat.label}</div>
          </button>
        ))}
      </div>

      {/* Label filter row */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setLabelFilter("all")}
          className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${labelFilter === "all" ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:border-primary/40"}`}
        >
          الكل ({leads.length})
        </button>
        {LABEL_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setLabelFilter(labelFilter === opt.value ? "all" : opt.value)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${labelFilter === opt.value ? `${opt.color} border-current` : "bg-card border-border hover:border-primary/40"}`}
          >
            {opt.label.split(" / ")[0]} ({counts[opt.value] ?? 0})
          </button>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-primary" />
            قائمة العملاء ({filtered.length})
          </CardTitle>
          {labelFilter !== "all" && (
            <Button variant="ghost" size="sm" onClick={() => setLabelFilter("all")}>
              <X className="w-3.5 h-3.5 ml-1" /> إلغاء الفلتر
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <UserCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>لا يوجد عملاء بهذا التصنيف</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الاسم / Name</TableHead>
                    <TableHead>هاتف / Phone</TableHead>
                    <TableHead>بريد / Email</TableHead>
                    <TableHead>آخر طلب / Order</TableHead>
                    <TableHead>التصنيف / Label</TableHead>
                    <TableHead>المصدر / Source</TableHead>
                    <TableHead>ملاحظات / Notes</TableHead>
                    <TableHead>تاريخ الإضافة / Date</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((lead) => {
                    const labelStyle = getLabelStyle(lead.label);
                    return (
                      <TableRow key={lead.id}>
                        <TableCell>
                          <a href={lead.fbProfileUrl ?? "#"} target="_blank" rel="noopener noreferrer" className="font-medium hover:text-primary transition-colors flex items-center gap-1">
                            {lead.fbUserName ?? lead.fbUserId}
                          </a>
                        </TableCell>
                        <TableCell>
                          {lead.phone ? (
                            <div className="flex items-center gap-1 text-sm">
                              <Phone className="w-3 h-3 text-muted-foreground" />
                              <span dir="ltr">{lead.phone}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {lead.email ? (
                            <div className="flex items-center gap-1 text-sm">
                              <Mail className="w-3 h-3 text-muted-foreground" />
                              <span className="truncate max-w-[120px]">{lead.email}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {lead.latestOrderProduct ? (
                            <div className="flex items-center gap-1.5">
                              <ShoppingBag className="w-3.5 h-3.5 text-muted-foreground" />
                              <div className="text-xs space-y-0.5">
                                <div className="font-semibold truncate max-w-[120px]">{lead.latestOrderProduct}</div>
                                <div className="flex items-center gap-1.5">
                                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                                    lead.latestOrderStatus === "confirmed" || lead.latestOrderStatus === "delivered" ? "bg-green-50 text-green-700 border-green-200" :
                                    lead.latestOrderStatus === "pending" ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
                                    lead.latestOrderStatus === "cancelled" ? "bg-red-50 text-red-700 border-red-200" :
                                    "bg-gray-50 text-gray-500"
                                  }`}>
                                    {lead.latestOrderStatus === "confirmed" ? "مؤكد" :
                                     lead.latestOrderStatus === "delivered" ? "تم التسليم" :
                                     lead.latestOrderStatus === "pending" ? "قيد الانتظار" :
                                     lead.latestOrderStatus === "cancelled" ? "ملغي" : lead.latestOrderStatus}
                                  </Badge>
                                  {lead.latestOrderPrice != null && (
                                    <span className="text-emerald-600 font-mono font-medium">{lead.latestOrderPrice} د.ج</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">لا يوجد طلب</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Select value={lead.label} onValueChange={(v) => handleLabelChange(lead.id, v)}>
                            <SelectTrigger className="h-7 text-xs border-0 p-0 w-auto">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${labelStyle.color}`}>
                                {labelStyle.label?.split(" / ")[0]}
                              </span>
                            </SelectTrigger>
                            <SelectContent>
                              {LABEL_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground capitalize">{lead.source ?? "—"}</span>
                        </TableCell>
                        <TableCell>
                          <EditableNotes id={lead.id} notes={lead.notes ?? null} />
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">
                            {(() => {
                              if (!lead.createdAt) return "—";
                              const d = new Date(lead.createdAt);
                              if (isNaN(d.getTime())) return "—";
                              return d.toLocaleDateString("ar-DZ", { year: "numeric", month: "short", day: "numeric" });
                            })()}
                          </span>
                        </TableCell>
                        <TableCell>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent dir="rtl">
                              <AlertDialogHeader>
                                <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
                                <AlertDialogDescription>
                                  هل تريد حذف العميل <strong>{lead.fbUserName ?? lead.fbUserId}</strong>؟ لا يمكن التراجع.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(lead.id)} className="bg-destructive text-white hover:bg-destructive/90">
                                  حذف
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
