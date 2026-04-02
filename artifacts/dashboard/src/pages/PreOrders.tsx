import { useState } from "react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { motion } from "framer-motion";
import { ClipboardList, Phone, Trash2, RefreshCw } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface PreOrder {
  id: number;
  fbUserId: string;
  fbUserName: string | null;
  productId: number;
  productName: string | null;
  customerName: string | null;
  phone: string | null;
  status: string;
  createdAt: string;
  updatedAt: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  notified: "bg-emerald-100 text-emerald-800 border-emerald-200",
  cancelled: "bg-red-100 text-red-800 border-red-200",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "قيد الانتظار",
  notified: "تم الإشعار",
  cancelled: "ملغي",
};

async function fetchPreOrders(): Promise<PreOrder[]> {
  const res = await fetch(`${BASE}/api/pre-orders`);
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

async function updateStatus(id: number, status: string) {
  const res = await fetch(`${BASE}/api/pre-orders/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error("Failed to update");
  return res.json();
}

async function deletePreOrder(id: number) {
  const res = await fetch(`${BASE}/api/pre-orders/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete");
  return res.json();
}

export default function PreOrders() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: orders = [], isLoading, refetch } = useQuery<PreOrder[]>({
    queryKey: ["/api/pre-orders"],
    queryFn: fetchPreOrders,
    refetchInterval: 30000,
  });

  const updateMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => updateStatus(id, status),
    onSuccess: () => {
      toast({ title: "تم التحديث", description: "تم تحديث حالة الطلب المسبق" });
      queryClient.invalidateQueries({ queryKey: ["/api/pre-orders"] });
    },
    onError: () => toast({ title: "خطأ", description: "فشل تحديث الحالة", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deletePreOrder(id),
    onSuccess: () => {
      toast({ title: "تم الحذف", description: "تم حذف الطلب المسبق" });
      queryClient.invalidateQueries({ queryKey: ["/api/pre-orders"] });
    },
    onError: () => toast({ title: "خطأ", description: "فشل الحذف", variant: "destructive" }),
  });

  const filtered = statusFilter === "all" ? orders : orders.filter((o) => o.status === statusFilter);

  const counts = {
    all: orders.length,
    pending: orders.filter((o) => o.status === "pending").length,
    notified: orders.filter((o) => o.status === "notified").length,
    cancelled: orders.filter((o) => o.status === "cancelled").length,
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
            <ClipboardList className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">الطلبات المسبقة</h1>
            <p className="text-sm text-gray-500">إدارة طلبات المنتجات غير المتاحة</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          تحديث
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { key: "all", label: "الكل", color: "from-gray-50 to-gray-100 border-gray-200" },
          { key: "pending", label: "قيد الانتظار", color: "from-amber-50 to-amber-100 border-amber-200" },
          { key: "notified", label: "تم الإشعار", color: "from-emerald-50 to-emerald-100 border-emerald-200" },
          { key: "cancelled", label: "ملغي", color: "from-red-50 to-red-100 border-red-200" },
        ].map((s) => (
          <button
            key={s.key}
            onClick={() => setStatusFilter(s.key)}
            className={`rounded-xl border bg-gradient-to-br ${s.color} p-4 text-right transition-all hover:shadow-md ${
              statusFilter === s.key ? "ring-2 ring-violet-400" : ""
            }`}
          >
            <div className="text-2xl font-bold text-gray-900">{counts[s.key as keyof typeof counts]}</div>
            <div className="text-sm text-gray-600">{s.label}</div>
          </button>
        ))}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-16 text-gray-400">جارٍ التحميل...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>لا توجد طلبات مسبقة</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((order, i) => (
            <motion.div
              key={order.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <Card className="p-4 hover:shadow-md transition-shadow">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  {/* Info */}
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900">
                        {order.customerName ?? order.fbUserName ?? order.fbUserId}
                      </span>
                      <Badge className={`text-xs border ${STATUS_COLORS[order.status] ?? ""}`}>
                        {STATUS_LABELS[order.status] ?? order.status}
                      </Badge>
                    </div>
                    <div className="text-sm text-gray-700 font-medium">
                      📦 {order.productName ?? `المنتج #${order.productId}`}
                    </div>
                    {order.phone && (
                      <div className="flex items-center gap-1 text-sm text-gray-500">
                        <Phone className="w-3.5 h-3.5" />
                        <span dir="ltr">{order.phone}</span>
                      </div>
                    )}
                    <div className="text-xs text-gray-400">
                      {format(new Date(order.createdAt), "d MMMM yyyy، HH:mm", { locale: ar })}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Select
                      value={order.status}
                      onValueChange={(val) => updateMut.mutate({ id: order.id, status: val })}
                    >
                      <SelectTrigger className="w-36 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">قيد الانتظار</SelectItem>
                        <SelectItem value="notified">تم الإشعار</SelectItem>
                        <SelectItem value="cancelled">ملغي</SelectItem>
                      </SelectContent>
                    </Select>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:bg-red-50">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent dir="rtl">
                        <AlertDialogHeader>
                          <AlertDialogTitle>حذف الطلب المسبق</AlertDialogTitle>
                          <AlertDialogDescription>
                            هل أنت متأكد أنك تريد حذف هذا الطلب المسبق؟ لا يمكن التراجع عن هذا الإجراء.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>إلغاء</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteMut.mutate(order.id)}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            حذف
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
