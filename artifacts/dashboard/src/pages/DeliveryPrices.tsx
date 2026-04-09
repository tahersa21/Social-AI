import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Truck, Save, Search, ToggleLeft, ToggleRight, Loader2,
  MapPin, Home, Building2, Plus, Trash2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "").replace(/^\//, "/");

interface WilayaPrice {
  id: number;
  wilayaId: number;
  wilayaName: string;
  homePrice: number;
  officePrice: number;
}

interface DeliveryData {
  deliveryEnabled: number;
  prices: WilayaPrice[];
}

export default function DeliveryPrices() {
  const { toast } = useToast();
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [toggling, setToggling]         = useState(false);
  const [deliveryEnabled, setDeliveryEnabled] = useState(false);
  const [prices, setPrices]             = useState<WilayaPrice[]>([]);
  const [search, setSearch]             = useState("");
  const changedRef                       = useRef<Set<number>>(new Set());

  // ── Add-custom-wilaya dialog state ──────────────────────────────────────
  const [showAdd, setShowAdd]           = useState(false);
  const [newName, setNewName]           = useState("");
  const [newHome, setNewHome]           = useState("");
  const [newOffice, setNewOffice]       = useState("");
  const [adding, setAdding]             = useState(false);

  // ── Deleting state ──────────────────────────────────────────────────────
  const [deletingId, setDeletingId]     = useState<number | null>(null);

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/delivery-prices`);
      const data: DeliveryData = await res.json();
      setDeliveryEnabled(!!data.deliveryEnabled);
      setPrices(data.prices);
    } catch {
      toast({ title: "خطأ في جلب البيانات", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, []);

  function handlePriceChange(wilayaId: number, field: "homePrice" | "officePrice", value: string) {
    const num = parseInt(value.replace(/\D/g, ""), 10);
    const safeNum = isNaN(num) ? 0 : Math.max(0, num);
    setPrices((prev) =>
      prev.map((p) => p.wilayaId === wilayaId ? { ...p, [field]: safeNum } : p)
    );
    changedRef.current.add(wilayaId);
  }

  async function handleToggle() {
    setToggling(true);
    try {
      const res = await fetch(`${API_BASE}/api/delivery-prices/toggle`, { method: "PATCH" });
      const data = await res.json();
      setDeliveryEnabled(!!data.deliveryEnabled);
      toast({
        title: data.deliveryEnabled ? "✅ تم تفعيل أسعار التوصيل" : "⏹️ تم إيقاف أسعار التوصيل",
      });
    } catch {
      toast({ title: "فشل تغيير الحالة", variant: "destructive" });
    } finally {
      setToggling(false);
    }
  }

  async function handleSave() {
    if (changedRef.current.size === 0) {
      toast({ title: "لا توجد تغييرات لحفظها" });
      return;
    }
    setSaving(true);
    try {
      const toSave = prices
        .filter((p) => changedRef.current.has(p.wilayaId))
        .map((p) => ({ wilayaId: p.wilayaId, homePrice: p.homePrice, officePrice: p.officePrice }));

      const res = await fetch(`${API_BASE}/api/delivery-prices`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prices: toSave }),
      });
      if (!res.ok) throw new Error();
      changedRef.current.clear();
      toast({ title: `✅ تم حفظ أسعار التوصيل (${toSave.length} ولاية)` });
    } catch {
      toast({ title: "فشل حفظ البيانات", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  // ── Add custom wilaya ────────────────────────────────────────────────────
  async function handleAddCustom() {
    if (!newName.trim()) {
      toast({ title: "يرجى إدخال اسم الولاية", variant: "destructive" });
      return;
    }
    setAdding(true);
    try {
      const res = await fetch(`${API_BASE}/api/delivery-prices/custom`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wilayaName: newName.trim(),
          homePrice: parseInt(newHome, 10) || 0,
          officePrice: parseInt(newOffice, 10) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "فشل الإضافة");
      setPrices((prev) => [...prev, data.wilaya]);
      setNewName(""); setNewHome(""); setNewOffice("");
      setShowAdd(false);
      toast({ title: `✅ تمت إضافة "${data.wilaya.wilayaName}" بنجاح` });
    } catch (err: any) {
      toast({ title: err.message ?? "فشل الإضافة", variant: "destructive" });
    } finally {
      setAdding(false);
    }
  }

  // ── Delete custom wilaya ─────────────────────────────────────────────────
  async function handleDelete(wilayaId: number, wilayaName: string) {
    if (!confirm(`هل تريد حذف ولاية "${wilayaName}"؟`)) return;
    setDeletingId(wilayaId);
    try {
      const res = await fetch(`${API_BASE}/api/delivery-prices/${wilayaId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "فشل الحذف");
      setPrices((prev) => prev.filter((p) => p.wilayaId !== wilayaId));
      changedRef.current.delete(wilayaId);
      toast({ title: `🗑️ تم حذف "${wilayaName}"` });
    } catch (err: any) {
      toast({ title: err.message ?? "فشل الحذف", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  }

  const filtered = prices.filter(
    (p) => p.wilayaName.includes(search) || String(p.wilayaId).includes(search)
  );

  const customWilayas = prices.filter((p) => p.wilayaId >= 70);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5"
    >
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Truck className="w-6 h-6 text-primary" />
            أسعار التوصيل / Delivery Prices
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            إدارة أسعار التوصيل لجميع الولايات ({prices.length} ولاية)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setShowAdd(true)}
            className="gap-2 border-dashed border-primary/50 text-primary hover:bg-primary/5"
          >
            <Plus className="w-4 h-4" />
            إضافة ولاية جديدة
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            حفظ التغييرات
          </Button>
        </div>
      </div>

      {/* Add Custom Wilaya Dialog */}
      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            className="rounded-xl border-2 border-primary/30 bg-primary/5 p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-base flex items-center gap-2">
                <Plus className="w-4 h-4 text-primary" />
                إضافة ولاية جديدة / منطقة مخصصة
              </h3>
              <Button
                variant="ghost" size="icon"
                onClick={() => { setShowAdd(false); setNewName(""); setNewHome(""); setNewOffice(""); }}
                className="h-7 w-7"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              يمكنك إضافة ولايات إضافية أو مناطق مخصصة (خارج الـ 69 الأساسية) وستكون قابلة للحذف لاحقاً.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-1 space-y-1">
                <label className="text-xs font-medium text-muted-foreground">اسم الولاية / المنطقة *</label>
                <Input
                  placeholder="مثال: ولاية المستقبل"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="text-right"
                  onKeyDown={(e) => e.key === "Enter" && handleAddCustom()}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium flex items-center gap-1 text-blue-600">
                  <Home className="w-3 h-3" /> سعر التوصيل للمنزل (DZD)
                </label>
                <div className="relative">
                  <Input
                    type="text" inputMode="numeric"
                    placeholder="0"
                    value={newHome}
                    onChange={(e) => setNewHome(e.target.value.replace(/\D/g, ""))}
                    className="pl-12 border-blue-200 focus:border-blue-400"
                  />
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">DZD</span>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium flex items-center gap-1 text-orange-600">
                  <Building2 className="w-3 h-3" /> سعر مكتب التوصيل (DZD)
                </label>
                <div className="relative">
                  <Input
                    type="text" inputMode="numeric"
                    placeholder="0"
                    value={newOffice}
                    onChange={(e) => setNewOffice(e.target.value.replace(/\D/g, ""))}
                    className="pl-12 border-orange-200 focus:border-orange-400"
                  />
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">DZD</span>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => { setShowAdd(false); setNewName(""); setNewHome(""); setNewOffice(""); }}
              >
                إلغاء
              </Button>
              <Button onClick={handleAddCustom} disabled={adding || !newName.trim()} className="gap-2">
                {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                إضافة الولاية
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom Wilayas Badge */}
      {customWilayas.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-1 font-medium">
            <Plus className="w-3 h-3" />
            {customWilayas.length} ولاية مخصصة
          </span>
          <span>— يمكنك حذف الولايات المخصصة بالضغط على أيقونة الحذف</span>
        </div>
      )}

      {/* Toggle Card */}
      <div className={`flex items-center justify-between rounded-xl border p-4 transition-colors ${
        deliveryEnabled ? "bg-green-50 border-green-200" : "bg-muted/40 border-border"
      }`}>
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${deliveryEnabled ? "bg-green-100" : "bg-muted"}`}>
            <Truck className={`w-5 h-5 ${deliveryEnabled ? "text-green-600" : "text-muted-foreground"}`} />
          </div>
          <div>
            <p className="font-semibold text-sm">
              {deliveryEnabled ? "✅ ميزة التوصيل مفعّلة" : "⏹️ ميزة التوصيل معطّلة"}
            </p>
            <p className="text-xs text-muted-foreground">
              {deliveryEnabled
                ? "سيعرض البوت أسعار التوصيل للعملاء عند الطلب"
                : "الأسعار محفوظة لكنها لن تُعرض على العملاء"}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={handleToggle}
          disabled={toggling}
          className={`gap-2 min-w-32 ${deliveryEnabled ? "border-green-300 text-green-700 hover:bg-green-100" : ""}`}
        >
          {toggling ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : deliveryEnabled ? (
            <ToggleRight className="w-5 h-5 text-green-600" />
          ) : (
            <ToggleLeft className="w-5 h-5" />
          )}
          {deliveryEnabled ? "إيقاف" : "تفعيل"}
        </Button>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 text-xs text-muted-foreground px-1">
        <span className="flex items-center gap-1.5">
          <Home className="w-3.5 h-3.5 text-blue-500" />
          التوصيل للمنزل
        </span>
        <span className="flex items-center gap-1.5">
          <Building2 className="w-3.5 h-3.5 text-orange-500" />
          مكتب التوصيل / الاستلام
        </span>
        <span className="flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
          القيمة بالدينار الجزائري (DZD)
        </span>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="ابحث عن ولاية..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pr-9 text-right"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          {/* Table Header */}
          <div className="grid grid-cols-12 bg-muted/60 px-4 py-3 text-xs font-semibold text-muted-foreground border-b">
            <div className="col-span-1 text-center">#</div>
            <div className="col-span-4">الولاية</div>
            <div className="col-span-3 flex items-center gap-1.5">
              <Home className="w-3.5 h-3.5 text-blue-500" />
              توصيل للمنزل (DZD)
            </div>
            <div className="col-span-3 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-orange-500" />
              مكتب التوصيل (DZD)
            </div>
            <div className="col-span-1" />
          </div>

          {/* Rows */}
          <div className="divide-y">
            {filtered.map((wilaya, idx) => {
              const isCustom = wilaya.wilayaId >= 70;
              return (
                <div
                  key={wilaya.wilayaId}
                  className={`grid grid-cols-12 items-center px-4 py-2.5 text-sm transition-colors hover:bg-muted/30 ${
                    idx % 2 === 0 ? "" : "bg-muted/10"
                  } ${isCustom ? "bg-primary/5 hover:bg-primary/10" : ""}`}
                >
                  {/* Wilaya ID */}
                  <div className="col-span-1 text-center">
                    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                      isCustom
                        ? "bg-primary/20 text-primary ring-1 ring-primary/30"
                        : "bg-primary/10 text-primary"
                    }`}>
                      {wilaya.wilayaId}
                    </span>
                  </div>

                  {/* Wilaya Name */}
                  <div className="col-span-4 font-medium flex items-center gap-1.5">
                    {wilaya.wilayaName}
                    {isCustom && (
                      <span className="text-[10px] rounded-full bg-primary/15 text-primary px-1.5 py-0.5 font-normal">
                        مخصص
                      </span>
                    )}
                  </div>

                  {/* Home Price */}
                  <div className="col-span-3 pl-4">
                    <div className="relative">
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={wilaya.homePrice === 0 ? "" : String(wilaya.homePrice)}
                        placeholder="0"
                        onChange={(e) => handlePriceChange(wilaya.wilayaId, "homePrice", e.target.value)}
                        className="h-8 text-sm pr-2 pl-12 border-blue-200 focus:border-blue-400"
                      />
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        DZD
                      </span>
                    </div>
                  </div>

                  {/* Office Price */}
                  <div className="col-span-3 pl-4">
                    <div className="relative">
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={wilaya.officePrice === 0 ? "" : String(wilaya.officePrice)}
                        placeholder="0"
                        onChange={(e) => handlePriceChange(wilaya.wilayaId, "officePrice", e.target.value)}
                        className="h-8 text-sm pr-2 pl-12 border-orange-200 focus:border-orange-400"
                      />
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        DZD
                      </span>
                    </div>
                  </div>

                  {/* Delete (custom only) */}
                  <div className="col-span-1 flex justify-center">
                    {isCustom && (
                      <Button
                        variant="ghost" size="icon"
                        className="h-7 w-7 text-destructive/60 hover:text-destructive hover:bg-destructive/10"
                        disabled={deletingId === wilaya.wilayaId}
                        onClick={() => handleDelete(wilaya.wilayaId, wilaya.wilayaName)}
                        title="حذف هذه الولاية المخصصة"
                      >
                        {deletingId === wilaya.wilayaId
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />
                        }
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}

            {filtered.length === 0 && (
              <div className="py-12 text-center text-muted-foreground text-sm">
                لا توجد ولايات مطابقة للبحث
              </div>
            )}
          </div>

          {/* Footer summary */}
          <div className="bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground flex items-center justify-between border-t">
            <span>
              إجمالي الولايات: <strong>{prices.length}</strong>
              {customWilayas.length > 0 && (
                <span className="text-primary ml-2">({customWilayas.length} مخصصة)</span>
              )}
              {search && ` — معروض: ${filtered.length}`}
            </span>
            <span>
              متوسط التوصيل للمنزل:{" "}
              <strong>
                {prices.length > 0
                  ? Math.round(
                      prices.reduce((s, p) => s + p.homePrice, 0) /
                      (prices.filter((p) => p.homePrice > 0).length || 1)
                    )
                  : 0}{" "}
                DZD
              </strong>
            </span>
          </div>
        </div>
      )}

      {/* Save Button Bottom */}
      <div className="flex justify-between items-center pb-4">
        <Button
          variant="outline"
          onClick={() => setShowAdd(true)}
          className="gap-2 border-dashed"
        >
          <Plus className="w-4 h-4" />
          إضافة ولاية جديدة
        </Button>
        <Button onClick={handleSave} disabled={saving} size="lg" className="gap-2 px-8">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          حفظ جميع التغييرات
        </Button>
      </div>
    </motion.div>
  );
}
