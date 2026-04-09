import React, { useState } from "react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, RefreshCw, CheckCircle, XCircle, ChevronDown, MessageSquareShare } from "lucide-react";
import { useListComments, useGetCommentStats } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function Comments() {
  const queryClient = useQueryClient();
  const { data: stats, isFetching: fetchingStats } = useGetCommentStats();
  const { data: comments = [], isLoading, isFetching } = useListComments({ limit: 50 });
  
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/comments"] });
    queryClient.invalidateQueries({ queryKey: ["/api/comments/stats"] });
  };

  const isRefreshing = fetchingStats || isFetching;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">التعليقات</h1>
          <p className="text-muted-foreground mt-1">مراقبة ردود البوت على تعليقات المنشورات</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground font-mono">آخر تحديث: {format(new Date(), "HH:mm")}</span>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing} className="rounded-xl shadow-sm hover:bg-muted/40">
            <RefreshCw className={`w-4 h-4 me-2 ${isRefreshing ? 'animate-spin' : ''}`} /> تحديث
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-none shadow-md shadow-black/10 bg-gradient-to-br from-white to-slate-50/80 rounded-2xl">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shadow-inner">
              <MessageCircle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">إجمالي التعليقات</p>
              <h3 className="text-3xl font-bold font-mono">{stats?.total || 0}</h3>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-md shadow-black/10 bg-gradient-to-br from-white to-slate-50/80 rounded-2xl">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shadow-inner">
              <MessageSquareShare className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">الرسائل الخاصة المرسلة</p>
              <h3 className="text-3xl font-bold font-mono">{stats?.dmSent || 0}</h3>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-md shadow-black/10 bg-gradient-to-br from-white to-slate-50/80 rounded-2xl">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center shadow-inner">
              <RefreshCw className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">تعليقات اليوم</p>
              <h3 className="text-3xl font-bold font-mono">{stats?.today || 0}</h3>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-none shadow-md shadow-black/10 overflow-hidden rounded-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="text-xs text-muted-foreground bg-muted/40 border-b border-border/50 uppercase">
              <tr>
                <th className="w-8 px-4 py-4"></th>
                <th className="px-6 py-4 font-bold text-muted-foreground">المنشور</th>
                <th className="px-6 py-4 font-bold text-muted-foreground">المستخدم</th>
                <th className="px-6 py-4 font-bold text-muted-foreground">مقتطف التعليق</th>
                <th className="px-6 py-4 font-bold text-muted-foreground">رسالة DM</th>
                <th className="px-6 py-4 font-bold text-muted-foreground">الوقت</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50 bg-card">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground animate-pulse">جاري التحميل...</td>
                </tr>
              ) : comments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-16 text-center text-muted-foreground/70">لا توجد تعليقات مسجلة بعد</td>
                </tr>
              ) : (
                comments.map(comment => (
                  <React.Fragment key={comment.id}>
                    <tr 
                      className={`hover:bg-muted/50 transition-colors cursor-pointer ${expandedId === comment.id ? 'bg-muted/50' : ''}`}
                      onClick={() => setExpandedId(expandedId === comment.id ? null : comment.id)}
                    >
                      <td className="px-4 py-4 text-muted-foreground/70">
                        <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${expandedId === comment.id ? 'rotate-180' : ''}`} />
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-muted-foreground/70" dir="ltr">
                        {comment.postId ? comment.postId.split("_")[1]?.substring(0,8) + '...' : '-'}
                      </td>
                      <td className="px-6 py-4 font-semibold text-primary">{comment.fbUserName || "مستخدم"}</td>
                      <td className="px-6 py-4 max-w-xs truncate text-muted-foreground">{comment.commentText}</td>
                      <td className="px-6 py-4">
                        {comment.dmSent === 1 ? (
                          <CheckCircle className="w-5 h-5 text-emerald-500" />
                        ) : (
                          <XCircle className="w-5 h-5 text-muted-foreground/40" />
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs text-muted-foreground whitespace-nowrap font-mono">
                        {format(new Date(comment.timestamp), "HH:mm")}
                      </td>
                    </tr>
                    <AnimatePresence>
                      {expandedId === comment.id && (
                        <tr className="bg-muted/30 border-t-0">
                          <td colSpan={6} className="px-0 py-0">
                            <motion.div 
                              initial={{ height: 0, opacity: 0 }} 
                              animate={{ height: "auto", opacity: 1 }} 
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="p-6 md:px-16 grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                  <p className="text-xs font-bold text-muted-foreground/70 uppercase">نص التعليق الأصلي</p>
                                  <div className="bg-card p-4 rounded-xl border border-border shadow-sm leading-relaxed text-foreground">
                                    {comment.commentText}
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <p className="text-xs font-bold text-primary/70 uppercase">رد الذكاء الاصطناعي</p>
                                  <div className="bg-primary/5 p-4 rounded-xl border border-primary/10 shadow-sm leading-relaxed text-foreground">
                                    {comment.aiReply || <span className="text-muted-foreground/70 italic">بدون رد آلي</span>}
                                  </div>
                                </div>
                                <div className="md:col-span-2 flex items-center justify-between text-sm bg-card p-3 rounded-lg border border-border/50">
                                  <div className="flex gap-4">
                                    <span className="text-muted-foreground">رسالة DM: {comment.dmSent === 1 ? <span className="text-emerald-600 font-bold">✅ نعم</span> : <span className="text-muted-foreground/70">❌ لا</span>}</span>
                                  </div>
                                  <span className="text-muted-foreground/70 font-mono">{format(new Date(comment.timestamp), "PPpp", { locale: ar })}</span>
                                </div>
                              </div>
                            </motion.div>
                          </td>
                        </tr>
                      )}
                    </AnimatePresence>
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </motion.div>
  );
}
