import { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import { Package, Plus, Edit, Trash2, Star, X, Image as ImageIcon, Loader2, Minus, Tag, FolderOpen, ChevronRight, Folder, FolderPlus, Check } from "lucide-react";
import { useListProducts, useDeleteProduct, useAdjustProductStock, Product } from "@workspace/api-client-react";
import { createProductWithImages, updateProductWithImages } from "@/lib/api-overrides";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

interface ProductCategory {
  id: number;
  name: string;
  parentId: number | null;
}

async function fetchCategories(): Promise<ProductCategory[]> {
  const res = await fetch(`${BASE}/api/product-categories`, { credentials: "include" });
  if (!res.ok) throw new Error("فشل تحميل التصنيفات");
  return res.json();
}

async function createCategory(name: string, parentId?: number | null): Promise<ProductCategory> {
  const res = await fetch(`${BASE}/api/product-categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ name, parentId: parentId ?? null }),
  });
  if (!res.ok) throw new Error("فشل الإضافة");
  return res.json();
}

async function updateCategory(id: number, name: string, parentId?: number | null): Promise<ProductCategory> {
  const res = await fetch(`${BASE}/api/product-categories/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ name, parentId: parentId ?? null }),
  });
  if (!res.ok) throw new Error("فشل التعديل");
  return res.json();
}

async function deleteCategory(id: number): Promise<void> {
  const res = await fetch(`${BASE}/api/product-categories/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("فشل الحذف");
}

export default function Products() {
  const queryClient = useQueryClient();
  const { data: products = [], isLoading } = useListProducts();
  const deleteMut = useDeleteProduct();
  const stockMut = useAdjustProductStock();

  // Product form dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const [formData, setFormData] = useState({
    name: "", description: "", originalPrice: "", discountPrice: "",
    stockQuantity: "10", lowStockThreshold: "5", status: "available",
    brand: "", itemType: "", externalUrl: "",
  });
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [mainImageIndex, setMainImageIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  // Categories management dialog
  const [catsOpen, setCatsOpen] = useState(false);
  const [allCategories, setAllCategories] = useState<ProductCategory[]>([]);
  const [catsLoading, setCatsLoading] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatParent, setNewCatParent] = useState<string>("none");
  const [editingCat, setEditingCat] = useState<ProductCategory | null>(null);
  const [editCatName, setEditCatName] = useState("");
  const [editCatParent, setEditCatParent] = useState<string>("none");
  const [catSaving, setCatSaving] = useState(false);

  // Category picker popover in product form
  const [catPickerOpen, setCatPickerOpen] = useState(false);

  const loadCategories = async () => {
    setCatsLoading(true);
    try {
      const cats = await fetchCategories();
      setAllCategories(cats);
    } catch {
      toast({ title: "خطأ", description: "تعذر تحميل التصنيفات", variant: "destructive" });
    } finally {
      setCatsLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const openDialog = (prod?: Product) => {
    if (prod) {
      setEditingProduct(prod);
      setFormData({
        name: prod.name,
        description: prod.description || "",
        originalPrice: prod.originalPrice?.toString() || "",
        discountPrice: prod.discountPrice?.toString() || "",
        stockQuantity: prod.stockQuantity.toString(),
        lowStockThreshold: prod.lowStockThreshold.toString(),
        status: prod.status,
        brand: (prod as any).brand || "",
        itemType: (prod as any).itemType || "",
        externalUrl: (prod as any).externalUrl || "",
      });
      const catStr = (prod as any).category || "";
      setSelectedCategories(catStr ? catStr.split(",").map((c: string) => c.trim()).filter(Boolean) : []);
      const imgs = prod.images ? JSON.parse(prod.images) : [];
      setExistingImages(imgs);
      setFiles([]);
      setMainImageIndex(prod.mainImageIndex || 0);
    } else {
      setEditingProduct(null);
      setFormData({
        name: "", description: "", originalPrice: "", discountPrice: "",
        stockQuantity: "10", lowStockThreshold: "5", status: "available",
        brand: "", itemType: "", externalUrl: "",
      });
      setSelectedCategories([]);
      setExistingImages([]);
      setFiles([]);
      setMainImageIndex(0);
    }
    setDialogOpen(true);
  };

  const toggleCategory = (name: string) => {
    setSelectedCategories(prev =>
      prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]
    );
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const totalCurrent = existingImages.length + files.length;
    const remaining = 5 - totalCurrent;
    if (remaining <= 0) { toast({ title: "عفواً", description: "الحد الأقصى 5 صور", variant: "destructive" }); return; }
    setFiles(prev => [...prev, ...acceptedFiles.slice(0, remaining)]);
  }, [existingImages.length, files.length]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] }
  });

  const removeExisting = (index: number) => {
    setExistingImages(prev => prev.filter((_, i) => i !== index));
    if (mainImageIndex === index) setMainImageIndex(0);
    else if (mainImageIndex > index) setMainImageIndex(mainImageIndex - 1);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    const globalIdx = existingImages.length + index;
    if (mainImageIndex === globalIdx) setMainImageIndex(0);
    else if (mainImageIndex > globalIdx) setMainImageIndex(mainImageIndex - 1);
  };

  const setMain = (globalIndex: number) => {
    setMainImageIndex(globalIndex);
  };

  const handleSave = async () => {
    if (!formData.name) { toast({ title: "خطأ", description: "الاسم مطلوب", variant: "destructive" }); return; }
    setIsSaving(true);
    try {
      const payload = {
        ...formData,
        category: selectedCategories.join(","),
        mainImageIndex: mainImageIndex.toString(),
        keepImages: existingImages
      };

      if (editingProduct) {
        await updateProductWithImages(editingProduct.id, payload, files);
        toast({ title: "تم الحفظ", description: "تم تحديث المنتج بنجاح" });
      } else {
        await createProductWithImages(payload, files);
        toast({ title: "تمت الإضافة", description: "تمت إضافة المنتج بنجاح" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setDialogOpen(false);
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleStock = (id: number, change: number) => {
    stockMut.mutate({ id, data: { quantityChange: change } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/products"] })
    });
  };

  const discountPercent = formData.originalPrice && formData.discountPrice
    ? Math.round((1 - parseFloat(formData.discountPrice) / parseFloat(formData.originalPrice)) * 100)
    : 0;

  // Categories management
  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    setCatSaving(true);
    try {
      await createCategory(newCatName.trim(), newCatParent !== "none" ? Number(newCatParent) : null);
      setNewCatName("");
      setNewCatParent("none");
      await loadCategories();
      toast({ title: "تمت الإضافة" });
    } catch {
      toast({ title: "خطأ", description: "فشل إضافة التصنيف", variant: "destructive" });
    } finally {
      setCatSaving(false);
    }
  };

  const handleEditCatSave = async () => {
    if (!editingCat || !editCatName.trim()) return;
    setCatSaving(true);
    try {
      await updateCategory(editingCat.id, editCatName.trim(), editCatParent !== "none" ? Number(editCatParent) : null);
      setEditingCat(null);
      await loadCategories();
      toast({ title: "تم التعديل" });
    } catch {
      toast({ title: "خطأ", description: "فشل التعديل", variant: "destructive" });
    } finally {
      setCatSaving(false);
    }
  };

  const handleDeleteCat = async (id: number) => {
    if (!confirm("هل أنت متأكد من حذف هذا التصنيف؟")) return;
    try {
      await deleteCategory(id);
      await loadCategories();
      toast({ title: "تم الحذف" });
    } catch {
      toast({ title: "خطأ", description: "فشل الحذف", variant: "destructive" });
    }
  };

  const parentCategories = allCategories.filter(c => !c.parentId);
  const getChildren = (parentId: number) => allCategories.filter(c => c.parentId === parentId);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">المنتجات</h1>
          <p className="text-muted-foreground mt-1">إدارة الكتالوج والمخزون المتاح للبوت</p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => { setCatsOpen(true); loadCategories(); }}
            className="gap-2 h-11 px-5 rounded-xl border-primary/30 text-primary hover:bg-primary/5"
          >
            <FolderOpen className="w-4 h-4" /> إدارة التصنيفات
          </Button>
          <Button
            onClick={() => openDialog()}
            className="gap-2 h-11 px-6 rounded-xl shadow-lg shadow-primary/20 hover:-translate-y-0.5 transition-transform"
          >
            <Plus className="w-4 h-4" /> إضافة منتج جديد
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[1,2,3,4].map(i => <div key={i} className="h-80 rounded-2xl bg-slate-100 animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          <AnimatePresence>
            {products.map(product => {
              const imgs = product.images ? JSON.parse(product.images) : [];
              const mainImgUrl = imgs[product.mainImageIndex || 0] || "https://placehold.co/400x400/f8fafc/94a3b8?text=No+Image";
              const stockPercent = Math.min(100, (product.stockQuantity / (product.lowStockThreshold * 4)) * 100);
              const progressColor = stockPercent > 50 ? 'bg-emerald-500' : stockPercent > 20 ? 'bg-amber-500' : 'bg-red-500';
              const productCats = ((product as any).category || "").split(",").map((c: string) => c.trim()).filter(Boolean);

              return (
                <motion.div key={product.id} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
                  <Card className="overflow-hidden border-border/50 shadow-sm hover:shadow-xl hover:border-primary/20 transition-all duration-300 group rounded-2xl">
                    <div className="relative aspect-square bg-slate-100 overflow-hidden">
                      <img src={mainImgUrl} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      {imgs.length > 1 && (
                        <Badge variant="secondary" className="absolute top-2 left-2 bg-white/90 backdrop-blur-sm shadow-sm">
                          1/{imgs.length} <ImageIcon className="w-3 h-3 ms-1" />
                        </Badge>
                      )}
                      {product.status === 'out_of_stock' && (
                        <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] flex items-center justify-center">
                          <span className="bg-red-500 text-white px-4 py-2 rounded-lg font-bold shadow-lg rotate-12">نفد المخزون</span>
                        </div>
                      )}
                      {product.discountPrice && product.originalPrice && (
                        <Badge className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 shadow-md px-2 py-1 text-sm font-bold">
                          {Math.round((1 - product.discountPrice / product.originalPrice) * 100)}% خفض
                        </Badge>
                      )}
                    </div>
                    <CardContent className="p-4 space-y-4 bg-white">
                      <div>
                        <h3 className="font-bold text-lg leading-tight truncate" title={product.name}>{product.name}</h3>
                        {(productCats.length > 0 || (product as any).brand) && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {productCats.map((cat: string) => (
                              <span key={cat} className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 rounded-md px-1.5 py-0.5 font-medium">
                                🏷️ {cat}
                              </span>
                            ))}
                            {(product as any).brand && (
                              <span className="text-[10px] bg-violet-50 text-violet-700 border border-violet-200 rounded-md px-1.5 py-0.5 font-medium">
                                🔖 {(product as any).brand}
                              </span>
                            )}
                          </div>
                        )}
                        <div className="mt-1 flex items-baseline gap-2">
                          <span className="text-xl font-bold text-emerald-600">
                            {product.discountPrice || product.originalPrice || 0} د.ج
                          </span>
                          {product.discountPrice && product.originalPrice && (
                            <span className="text-sm text-muted-foreground line-through decoration-red-500/50">
                              {product.originalPrice}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <div className="flex justify-between text-sm font-medium">
                          <span className="text-muted-foreground">المخزون</span>
                          <span className={product.stockQuantity <= product.lowStockThreshold ? "text-red-500" : ""}>
                            {product.stockQuantity} قطعة
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${progressColor} transition-all duration-500`} style={{ width: `${Math.max(2, stockPercent)}%` }} />
                        </div>
                        {product.stockQuantity <= product.lowStockThreshold && product.stockQuantity > 0 && (
                          <p className="text-[10px] text-amber-600 font-bold text-center">⚠️ مخزون منخفض</p>
                        )}

                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200/50 mt-2">
                          <Button variant="outline" size="icon" className="h-7 w-7 rounded-lg" disabled={product.stockQuantity <= 0 || stockMut.isPending} onClick={() => handleStock(product.id, -1)}>
                            <Minus className="w-3 h-3" />
                          </Button>
                          <span className="text-xs font-mono font-medium">{product.stockQuantity}</span>
                          <Button variant="outline" size="icon" className="h-7 w-7 rounded-lg" disabled={stockMut.isPending} onClick={() => handleStock(product.id, 1)}>
                            <Plus className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>

                      <div className="flex gap-2 pt-2">
                        <Button variant="outline" className="flex-1 rounded-xl h-9" onClick={() => openDialog(product)}>
                          <Edit className="w-4 h-4 me-1" /> تعديل
                        </Button>
                        <Button variant="ghost" className="rounded-xl h-9 w-9 p-0 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => {
                          if (confirm("هل أنت متأكد من حذف المنتج؟")) {
                            deleteMut.mutate({ id: product.id }, {
                              onSuccess: () => {
                                queryClient.invalidateQueries({ queryKey: ["/api/products"] });
                                toast({ title: "تم الحذف" });
                              }
                            });
                          }
                        }}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* ===== PRODUCT DIALOG ===== */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent dir="rtl" className="max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl p-0 gap-0">
          <div className="p-6 bg-slate-50 border-b border-border/50 sticky top-0 z-10">
            <DialogTitle className="text-xl">{editingProduct ? "تعديل منتج" : "إضافة منتج جديد"}</DialogTitle>
          </div>

          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label>الاسم <span className="text-red-500">*</span></Label>
                <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="bg-slate-50 h-11" placeholder="اسم المنتج..." />
              </div>

              <div className="space-y-1.5">
                <Label>الوصف</Label>
                <Textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="bg-slate-50 min-h-[100px]" placeholder="وصف المنتج ليفهمه البوت..." />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>السعر الأصلي</Label>
                  <Input type="number" value={formData.originalPrice} onChange={e => setFormData({...formData, originalPrice: e.target.value})} className="bg-slate-50 h-11 font-mono text-left" dir="ltr" placeholder="0.00" />
                </div>
                <div className="space-y-1.5">
                  <Label>سعر التخفيض</Label>
                  <Input type="number" value={formData.discountPrice} onChange={e => setFormData({...formData, discountPrice: e.target.value})} className="bg-slate-50 h-11 font-mono text-left" dir="ltr" placeholder="0.00" />
                </div>
              </div>
              {discountPercent > 0 && (
                <div className="text-sm text-emerald-600 font-medium flex items-center gap-1">
                  <Tag className="w-4 h-4" /> نسبة التخفيض: {discountPercent}%
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>الكمية الحالية</Label>
                  <Input type="number" value={formData.stockQuantity} onChange={e => setFormData({...formData, stockQuantity: e.target.value})} className="bg-slate-50 h-11 font-mono text-center" />
                </div>
                <div className="space-y-1.5">
                  <Label>تنبيه نقص المخزون عند</Label>
                  <Input type="number" value={formData.lowStockThreshold} onChange={e => setFormData({...formData, lowStockThreshold: e.target.value})} className="bg-slate-50 h-11 font-mono text-center" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>حالة المنتج</Label>
                <Select value={formData.status} onValueChange={v => setFormData({...formData, status: v})}>
                  <SelectTrigger className="h-11 bg-slate-50"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">🟢 متاح (Available)</SelectItem>
                    <SelectItem value="out_of_stock">🔴 نفد (Out of Stock)</SelectItem>
                    <SelectItem value="paused">⏸️ موقوف (Paused)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="pt-2 border-t border-border/40 space-y-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">معلومات الكتالوج (للتصفح في Messenger)</p>

                {/* Category multi-select */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>التصنيفات</Label>
                    <button
                      type="button"
                      onClick={() => { setCatsOpen(true); loadCategories(); }}
                      className="text-[11px] text-primary hover:underline"
                    >
                      + إدارة التصنيفات
                    </button>
                  </div>

                  {allCategories.length === 0 ? (
                    <div className="border border-dashed border-slate-300 rounded-xl p-3 text-center text-sm text-muted-foreground">
                      لا توجد تصنيفات — أضف تصنيفات أولاً
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-xl bg-slate-50 p-3 space-y-2 max-h-52 overflow-y-auto">
                      {parentCategories.map(parent => {
                        const children = getChildren(parent.id);
                        return (
                          <div key={parent.id}>
                            {/* Parent category */}
                            <button
                              type="button"
                              onClick={() => toggleCategory(parent.name)}
                              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm font-medium transition-colors text-right ${
                                selectedCategories.includes(parent.name)
                                  ? "bg-primary/10 text-primary border border-primary/20"
                                  : "hover:bg-slate-100 text-slate-700"
                              }`}
                            >
                              {selectedCategories.includes(parent.name)
                                ? <Check className="w-3.5 h-3.5 shrink-0 text-primary" />
                                : <Folder className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                              }
                              <span className="flex-1">{parent.name}</span>
                            </button>
                            {/* Sub-categories */}
                            {children.map(child => (
                              <button
                                key={child.id}
                                type="button"
                                onClick={() => toggleCategory(child.name)}
                                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors text-right mr-4 ${
                                  selectedCategories.includes(child.name)
                                    ? "bg-primary/10 text-primary border border-primary/20"
                                    : "hover:bg-slate-100 text-slate-600"
                                }`}
                              >
                                <ChevronRight className="w-3 h-3 shrink-0 text-slate-300" />
                                {selectedCategories.includes(child.name)
                                  ? <Check className="w-3.5 h-3.5 shrink-0 text-primary" />
                                  : <Tag className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                                }
                                <span className="flex-1">{child.name}</span>
                              </button>
                            ))}
                          </div>
                        );
                      })}
                      {/* Categories with no parent (orphaned children shown as root) */}
                      {allCategories.filter(c => c.parentId && !allCategories.find(p => p.id === c.parentId)).map(orphan => (
                        <button
                          key={orphan.id}
                          type="button"
                          onClick={() => toggleCategory(orphan.name)}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors text-right ${
                            selectedCategories.includes(orphan.name)
                              ? "bg-primary/10 text-primary border border-primary/20"
                              : "hover:bg-slate-100 text-slate-700"
                          }`}
                        >
                          {selectedCategories.includes(orphan.name)
                            ? <Check className="w-3.5 h-3.5 shrink-0 text-primary" />
                            : <Tag className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                          }
                          <span className="flex-1">{orphan.name}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {selectedCategories.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {selectedCategories.map(cat => (
                        <span
                          key={cat}
                          className="inline-flex items-center gap-1 text-[11px] bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-0.5 font-medium"
                        >
                          {cat}
                          <button type="button" onClick={() => toggleCategory(cat)} className="hover:text-red-500">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>العلامة التجارية (Brand)</Label>
                    <Input value={formData.brand} onChange={e => setFormData({...formData, brand: e.target.value})} className="bg-slate-50 h-10" placeholder="مثال: Samsung, Apple..." />
                  </div>
                  <div className="space-y-1.5">
                    <Label>النوع (Type)</Label>
                    <Input value={formData.itemType} onChange={e => setFormData({...formData, itemType: e.target.value})} className="bg-slate-50 h-10" placeholder="مثال: smartphone, laptop..." />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>رابط خارجي (External URL)</Label>
                  <Input value={formData.externalUrl} onChange={e => setFormData({...formData, externalUrl: e.target.value})} className="bg-slate-50 h-10" dir="ltr" placeholder="https://..." />
                </div>
              </div>
            </div>

            {/* Image Upload Area */}
            <div className="space-y-4">
              <Label>صور المنتج (الحد الأقصى 5)</Label>
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${isDragActive ? 'border-primary bg-primary/5' : 'border-slate-300 hover:bg-slate-50'}`}
              >
                <input {...getInputProps()} />
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
                  <ImageIcon className="w-6 h-6 text-slate-400" />
                </div>
                <p className="font-medium text-sm">اسحب وأفلت الصور هنا أو اضغط للاختيار</p>
                <p className="text-xs text-muted-foreground mt-1">PNG, JPG حتى 5 ميجابايت</p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {existingImages.map((url, idx) => (
                  <div key={`ex-${idx}`} className={`relative aspect-square rounded-xl overflow-hidden group border-2 ${mainImageIndex === idx ? 'border-primary shadow-md' : 'border-transparent'}`}>
                    <img src={url} alt="img" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-white hover:text-white hover:bg-white/20" onClick={(e) => { e.stopPropagation(); setMain(idx); }}>
                        <Star className={`w-4 h-4 ${mainImageIndex === idx ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-white hover:text-red-400 hover:bg-white/20" onClick={(e) => { e.stopPropagation(); removeExisting(idx); }}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {files.map((file, fileIdx) => {
                  const globalIdx = existingImages.length + fileIdx;
                  return (
                    <div key={`new-${fileIdx}`} className={`relative aspect-square rounded-xl overflow-hidden group border-2 ${mainImageIndex === globalIdx ? 'border-primary shadow-md' : 'border-transparent'}`}>
                      <img src={URL.createObjectURL(file)} alt="img" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-white hover:text-white hover:bg-white/20" onClick={(e) => { e.stopPropagation(); setMain(globalIdx); }}>
                          <Star className={`w-4 h-4 ${mainImageIndex === globalIdx ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-white hover:text-red-400 hover:bg-white/20" onClick={(e) => { e.stopPropagation(); removeFile(fileIdx); }}>
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="p-6 bg-slate-50 border-t border-border/50 sticky bottom-0 z-10 flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="rounded-xl h-11 px-6">إلغاء</Button>
            <Button onClick={handleSave} disabled={isSaving} className="rounded-xl h-11 px-8 shadow-lg shadow-primary/20">
              {isSaving ? <><Loader2 className="w-4 h-4 me-2 animate-spin" /> جاري الحفظ...</> : "حفظ المنتج"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== CATEGORIES MANAGEMENT DIALOG ===== */}
      <Dialog open={catsOpen} onOpenChange={setCatsOpen}>
        <DialogContent dir="rtl" className="max-w-xl max-h-[85vh] overflow-y-auto rounded-2xl p-0 gap-0">
          <div className="p-5 bg-slate-50 border-b border-border/50 sticky top-0 z-10">
            <DialogTitle className="text-xl flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-primary" /> إدارة التصنيفات
            </DialogTitle>
            <p className="text-sm text-muted-foreground mt-0.5">أضف وعدّل وأحذف التصنيفات للمنتجات</p>
          </div>

          <div className="p-5 space-y-5">
            {/* Add new category */}
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold text-blue-800 flex items-center gap-1.5">
                <FolderPlus className="w-4 h-4" /> إضافة تصنيف جديد
              </p>
              <Input
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAddCategory()}
                placeholder="اسم التصنيف..."
                className="bg-white h-10"
              />
              <Select value={newCatParent} onValueChange={setNewCatParent}>
                <SelectTrigger className="h-10 bg-white">
                  <SelectValue placeholder="تصنيف رئيسي (اختياري)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— بدون تصنيف رئيسي —</SelectItem>
                  {parentCategories.map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={handleAddCategory}
                disabled={!newCatName.trim() || catSaving}
                className="w-full h-10 rounded-xl"
              >
                {catSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 me-1" /> إضافة</>}
              </Button>
            </div>

            {/* List categories */}
            {catsLoading ? (
              <div className="text-center py-6 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mx-auto" />
              </div>
            ) : allCategories.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border border-dashed border-slate-300 rounded-xl">
                <Folder className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">لا توجد تصنيفات بعد</p>
              </div>
            ) : (
              <div className="space-y-2">
                {parentCategories.map(parent => {
                  const children = getChildren(parent.id);
                  return (
                    <div key={parent.id} className="border border-slate-200 rounded-xl overflow-hidden">
                      {/* Parent row */}
                      <div className="flex items-center gap-2 p-3 bg-white">
                        {editingCat?.id === parent.id ? (
                          <div className="flex-1 flex items-center gap-2">
                            <Input
                              value={editCatName}
                              onChange={e => setEditCatName(e.target.value)}
                              className="h-8 flex-1"
                              autoFocus
                            />
                            <Select value={editCatParent} onValueChange={setEditCatParent}>
                              <SelectTrigger className="h-8 w-36">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">— بدون رئيسي —</SelectItem>
                                {parentCategories.filter(p => p.id !== parent.id).map(p => (
                                  <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button size="sm" className="h-8 px-3" onClick={handleEditCatSave} disabled={catSaving}>
                              {catSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : "حفظ"}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setEditingCat(null)}>
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        ) : (
                          <>
                            <Folder className="w-4 h-4 text-amber-500 shrink-0" />
                            <span className="flex-1 font-medium text-sm">{parent.name}</span>
                            {children.length > 0 && (
                              <span className="text-[10px] text-muted-foreground bg-slate-100 px-1.5 py-0.5 rounded-full">{children.length} فرعي</span>
                            )}
                            <Button
                              size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-primary"
                              onClick={() => {
                                setEditingCat(parent);
                                setEditCatName(parent.name);
                                setEditCatParent(parent.parentId ? String(parent.parentId) : "none");
                              }}
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-red-500"
                              onClick={() => handleDeleteCat(parent.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                      {/* Children rows */}
                      {children.map(child => (
                        <div key={child.id} className="flex items-center gap-2 p-3 border-t border-slate-100 bg-slate-50/50">
                          {editingCat?.id === child.id ? (
                            <div className="flex-1 flex items-center gap-2 mr-4">
                              <Input
                                value={editCatName}
                                onChange={e => setEditCatName(e.target.value)}
                                className="h-8 flex-1"
                                autoFocus
                              />
                              <Select value={editCatParent} onValueChange={setEditCatParent}>
                                <SelectTrigger className="h-8 w-36">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">— بدون رئيسي —</SelectItem>
                                  {parentCategories.map(p => (
                                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button size="sm" className="h-8 px-3" onClick={handleEditCatSave} disabled={catSaving}>
                                {catSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : "حفظ"}
                              </Button>
                              <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setEditingCat(null)}>
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          ) : (
                            <>
                              <ChevronRight className="w-3 h-3 text-slate-300 shrink-0" />
                              <Tag className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                              <span className="flex-1 text-sm text-slate-700">{child.name}</span>
                              <Button
                                size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-primary"
                                onClick={() => {
                                  setEditingCat(child);
                                  setEditCatName(child.name);
                                  setEditCatParent(child.parentId ? String(child.parentId) : "none");
                                }}
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-red-500"
                                onClick={() => handleDeleteCat(child.id)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="p-5 bg-slate-50 border-t border-border/50 sticky bottom-0 flex justify-end">
            <Button variant="outline" onClick={() => setCatsOpen(false)} className="rounded-xl h-10 px-6">إغلاق</Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
