import { useState, useCallback } from "react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { motion } from "framer-motion";
import { ShoppingCart, ExternalLink, MessageCircle, MessageSquare, Phone, MapPin, Trash2, Download } from "lucide-react";
import { useListOrders, useUpdateOrderStatus, useDeleteOrder, useBulkDeleteOrders, OrderStatus, ListOrdersStatus } from "@workspace/api-client-react";
import { getToken } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  confirmed: "bg-blue-100 text-blue-800 border-blue-200",
  delivered: "bg-emerald-100 text-emerald-800 border-emerald-200",
  cancelled: "bg-red-100 text-red-800 border-red-200",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "قيد الانتظار",
  confirmed: "مؤكد",
  delivered: "تم التسليم",
  cancelled: "ملغي",
};

export default function Orders() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<ListOrdersStatus | "all">("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const { data: orders = [], isLoading } = useListOrders(filter === "all" ? {} : { status: filter });
  const updateMut = useUpdateOrderStatus();
  const deleteMut = useDeleteOrder();
  const bulkDeleteMut = useBulkDeleteOrders();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    queryClient.invalidateQueries({ queryKey: ["/api/orders/count"] });
  };

  const handleStatusChange = (id: number, status: OrderStatus) => {
    updateMut.mutate({ id, data: { status } }, {
      onSuccess: () => {
        toast({ title: "تم التحديث", description: "تم تحديث حالة الطلب" });
        invalidate();
      }
    });
  };

  const handleDelete = (id: number) => {
    deleteMut.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "تم الحذف", description: "تم حذف الطلب بنجاح" });
        setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
        invalidate();
      }
    });
  };

  const handleBulkDelete = () => {
    const ids = Array.from(selectedIds);
    bulkDeleteMut.mutate({ data: { ids } }, {
      onSuccess: () => {
        toast({ title: "تم الحذف", description: `تم حذف ${ids.length} طلبات بنجاح` });
        setSelectedIds(new Set());
        invalidate();
      }
    });
  };

  const [exporting, setExporting] = useState(false);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const params = filter !== "all" ? `?status=${filter}` : "";
      const token = getToken();
      const res = await fetch(`/api/orders/export${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        toast({ title: "خطأ", description: "فشل تصدير الطلبات", variant: "destructive" });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const date = new Date().toISOString().slice(0, 10);
      a.download = `commandes_${date}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "تم التصدير", description: "تم تحميل ملف Excel بنجاح" });
    } catch {
      toast({ title: "خطأ", description: "تعذّر تحميل الملف", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }, [filter]);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === orders.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(orders.map((o) => o.id)));
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">الطلبات</h1>
          <p className="text-muted-foreground mt-1">تتبع وإدارة طلبات العملاء الواردة من فيسبوك</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={handleExport} disabled={exporting}>
            <Download className="w-4 h-4" />
            {exporting ? "جاري التصدير..." : `تصدير Excel ${filter !== "all" ? `(${STATUS_LABELS[filter] ?? filter})` : "(الكل)"}`}
          </Button>
        {selectedIds.size > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="gap-2">
                <Trash2 className="w-4 h-4" />
                حذف المحدد ({selectedIds.size})
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent dir="rtl">
              <AlertDialogHeader>
                <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
                <AlertDialogDescription>
                  هل تريد حذف {selectedIds.size} طلبات؟ لا يمكن التراجع عن هذا الإجراء.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-white hover:bg-destructive/90">
                  تأكيد الحذف
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        </div>
      </div>

      <Tabs value={filter} onValueChange={(v) => { setFilter(v as ListOrdersStatus | "all"); setSelectedIds(new Set()); }} className="w-full" dir="rtl">
        <TabsList className="bg-muted/80 p-1 rounded-xl h-auto">
          <TabsTrigger value="all" className="rounded-lg px-6 py-2">الكل / All</TabsTrigger>
          <TabsTrigger value="pending" className="rounded-lg px-6 py-2">قيد الانتظار / Pending</TabsTrigger>
          <TabsTrigger value="confirmed" className="rounded-lg px-6 py-2">مؤكد / Confirmed</TabsTrigger>
          <TabsTrigger value="delivered" className="rounded-lg px-6 py-2">تم التسليم / Delivered</TabsTrigger>
          <TabsTrigger value="cancelled" className="rounded-lg px-6 py-2">ملغي / Cancelled</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="border-none shadow-md shadow-black/10 overflow-hidden rounded-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="text-xs text-muted-foreground bg-muted/40 border-b border-border/50 uppercase">
              <tr>
                <th className="px-4 py-4">
                  <Checkbox
                    checked={orders.length > 0 && selectedIds.size === orders.length}
                    onCheckedChange={toggleAll}
                    aria-label="تحديد الكل"
                  />
                </th>
                <th className="px-6 py-4 font-bold text-muted-foreground">رقم #</th>
                <th className="px-6 py-4 font-bold text-muted-foreground">المصدر</th>
                <th className="px-6 py-4 font-bold text-muted-foreground">العميل</th>
                <th className="px-6 py-4 font-bold text-muted-foreground">المنتج</th>
                <th className="px-6 py-4 font-bold text-muted-foreground">الهاتف</th>
                <th className="px-6 py-4 font-bold text-muted-foreground">الولاية</th>
                <th className="px-6 py-4 font-bold text-muted-foreground">البلدية</th>
                <th className="px-6 py-4 font-bold text-muted-foreground">العنوان</th>
                <th className="px-6 py-4 font-bold text-muted-foreground">الكمية</th>
                <th className="px-6 py-4 font-bold text-muted-foreground">الإجمالي</th>
                <th className="px-6 py-4 font-bold text-muted-foreground">الحالة</th>
                <th className="px-6 py-4 font-bold text-muted-foreground">التاريخ</th>
                <th className="px-4 py-4 font-bold text-muted-foreground"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50 bg-card">
              {isLoading ? (
                <tr>
                  <td colSpan={14} className="p-8 text-center text-muted-foreground animate-pulse">جاري التحميل...</td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={14} className="p-16 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground/70">
                      <ShoppingCart className="w-12 h-12 mb-4 opacity-50" />
                      <p className="text-lg font-medium">لا توجد طلبات</p>
                      <p className="text-sm">لم يتم العثور على طلبات مطابقة للبحث</p>
                    </div>
                  </td>
                </tr>
              ) : (
                orders.map(order => (
                  <tr key={order.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-4">
                      <Checkbox
                        checked={selectedIds.has(order.id)}
                        onCheckedChange={() => toggleSelect(order.id)}
                        aria-label={`تحديد طلب #${order.id}`}
                      />
                    </td>
                    <td className="px-6 py-4 font-mono font-medium text-muted-foreground">#{order.id}</td>
                    <td className="px-6 py-4">
                      {order.source === "messenger" ? (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 px-2 py-0.5"><MessageSquare className="w-3 h-3 me-1" /> رسالة</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 px-2 py-0.5"><MessageCircle className="w-3 h-3 me-1" /> تعليق</Badge>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <a href={order.fbProfileUrl || "#"} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline flex items-center gap-1">
                          {order.customerName || order.fbUserName || "مستخدم فيسبوك"} <ExternalLink className="w-3 h-3" />
                        </a>
                        {order.customerName && order.fbUserName && order.customerName !== order.fbUserName && (
                          <span className="text-xs text-muted-foreground/70">FB: {order.fbUserName}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 font-medium">{order.productName}</td>
                    <td className="px-6 py-4">
                      {order.customerPhone ? (
                        <span className="flex items-center gap-1 text-xs"><Phone className="w-3 h-3 text-muted-foreground/70" />{order.customerPhone}</span>
                      ) : <span className="text-muted-foreground/40">—</span>}
                    </td>
                    <td className="px-6 py-4">
                      {order.customerWilaya ? (
                        <span className="flex items-center gap-1 text-xs"><MapPin className="w-3 h-3 text-muted-foreground/70" />{order.customerWilaya}</span>
                      ) : <span className="text-muted-foreground/40">—</span>}
                    </td>
                    <td className="px-6 py-4 text-xs">
                      {order.customerCommune || <span className="text-muted-foreground/40">—</span>}
                    </td>
                    <td className="px-6 py-4 text-xs max-w-[150px] truncate" title={order.customerAddress ?? ""}>
                      {order.customerAddress || <span className="text-muted-foreground/40">—</span>}
                    </td>
                    <td className="px-6 py-4 font-mono">{order.quantity}</td>
                    <td className="px-6 py-4 font-bold text-emerald-600 font-mono">{order.totalPrice} د.ج</td>
                    <td className="px-6 py-4">
                      <Select value={order.status} onValueChange={(v) => handleStatusChange(order.id, v as OrderStatus)}>
                        <SelectTrigger className={`h-8 border-0 shadow-sm w-[130px] font-medium ${STATUS_COLORS[order.status]}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent dir="rtl">
                          {Object.entries(STATUS_LABELS).map(([k, v]) => (
                            <SelectItem key={k} value={k} className="font-medium">{v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-6 py-4 text-xs text-muted-foreground whitespace-nowrap">
                      {order.createdAt ? format(new Date(order.createdAt), "PPp", { locale: ar }) : "-"}
                    </td>
                    <td className="px-4 py-4">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-red-50">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent dir="rtl">
                          <AlertDialogHeader>
                            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
                            <AlertDialogDescription>
                              هل أنت متأكد من حذف هذا الطلب؟ لا يمكن التراجع عن هذا الإجراء.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>إلغاء</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(order.id)} className="bg-destructive text-white hover:bg-destructive/90">
                              تأكيد الحذف
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </motion.div>
  );
}
