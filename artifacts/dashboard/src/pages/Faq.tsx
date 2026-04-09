import { useState } from "react";
import { motion } from "framer-motion";
import { HelpCircle, Plus, Edit2, Trash2, Loader2 } from "lucide-react";
import { useListFaqs, useCreateFaq, useUpdateFaq, useDeleteFaq } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

import type { Faq as FaqType } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

type FaqForm = { question: string; answer: string; category: string };

export default function Faq() {
  const queryClient = useQueryClient();
  const { data: faqs = [], isLoading } = useListFaqs();
  const { mutate: createFaq } = useCreateFaq();
  const { mutate: updateFaq } = useUpdateFaq();
  const { mutate: deleteFaq } = useDeleteFaq();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FaqForm>({ question: "", answer: "", category: "" });

  const openAdd = () => {
    setEditingId(null);
    setForm({ question: "", answer: "", category: "" });
    setDialogOpen(true);
  };

  const openEdit = (faq: FaqType) => {
    setEditingId(faq.id);
    setForm({ question: faq.question, answer: faq.answer, category: faq.category || "" });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.question || !form.answer) return;
    if (editingId) {
      updateFaq({ id: editingId, data: { ...form, category: form.category || undefined } }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/faqs"] });
          setDialogOpen(false);
          toast({ title: "تم التحديث" });
        },
      });
    } else {
      createFaq({ data: { question: form.question, answer: form.answer, category: form.category || undefined } }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/faqs"] });
          setDialogOpen(false);
          toast({ title: "تمت الإضافة" });
        },
      });
    }
  };

  const handleDelete = (id: number) => {
    deleteFaq({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/faqs"] });
        toast({ title: "تم الحذف" });
      },
    });
  };

  const handleToggle = (faq: FaqType) => {
    updateFaq({ id: faq.id, data: { isActive: faq.isActive === 1 ? 0 : 1 } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/faqs"] }),
    });
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">الأسئلة الشائعة / FAQ</h1>
          <p className="text-muted-foreground mt-1">قاعدة معرفية يستخدمها البوت للإجابة على الأسئلة المتكررة</p>
        </div>
        <Button onClick={openAdd} className="gap-2 rounded-xl shadow-lg shadow-primary/20">
          <Plus className="w-4 h-4" /> إضافة سؤال
        </Button>
      </div>

      {faqs.length === 0 ? (
        <Card className="border-none shadow-md shadow-black/10">
          <CardContent className="py-12 text-center text-muted-foreground">
            <HelpCircle className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
            <p>لا توجد أسئلة شائعة. أضف أسئلة ليستخدمها البوت في الردود.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {faqs.map((faq) => (
            <Card key={faq.id} className={`border-none shadow-md shadow-black/10 ${faq.isActive ? '' : 'opacity-50'}`}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-base">{faq.question}</h3>
                      {faq.category && <Badge variant="outline" className="text-xs">{faq.category}</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{faq.answer}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch checked={faq.isActive === 1} onCheckedChange={() => handleToggle(faq)} />
                    <Button variant="ghost" size="icon" onClick={() => openEdit(faq)}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(faq.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent dir="rtl" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "تعديل السؤال" : "إضافة سؤال جديد"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">السؤال / Question</label>
              <Input value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} placeholder="مثال: ما هي ساعات العمل؟" className="h-11" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">الإجابة / Answer</label>
              <Textarea value={form.answer} onChange={(e) => setForm({ ...form, answer: e.target.value })} placeholder="الإجابة المفصلة..." className="min-h-[100px]" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">التصنيف / Category</label>
              <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="مثال: عام، طلبات، توصيل" className="h-11" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleSave} disabled={!form.question || !form.answer}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
