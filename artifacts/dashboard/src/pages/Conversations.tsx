import { useState, useEffect, useRef } from "react";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { MessageSquare, RefreshCw, ExternalLink, Bot, User, Loader2, PauseCircle, PlayCircle, Send, ShieldCheck, Pencil, CheckCircle2 } from "lucide-react";
import { getToken } from "@/lib/auth";
import {
  useListConversations,
  useGetConversation,
  usePauseConversation,
  useResumeConversation,
  useSetConversationLabel,
  useReplyToConversation,
} from "@workspace/api-client-react";
import type { ConversationSummary, ConversationMessage } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const SENTIMENT_EMOJI: Record<string, string> = {
  positive: "😊",
  neutral: "😐",
  negative: "😤",
};

const SOURCE_TYPE_LABEL: Record<string, string> = {
  free_generation: "نص حر",
  order_status: "حالة طلب",
  order_action: "إجراء طلب",
  image_action: "إرسال صورة",
  appointment: "موعد",
  safe_mode_blocked: "⛔ وضع آمن",
};

const SALES_TRIGGER_LABEL: Record<string, string> = {
  price_inquiry: "💰 سؤال عن السعر",
  buying_intent: "🛒 نية شراء",
  hesitation: "🤔 تردد",
  discount_request: "🏷️ طلب خصم",
  comparison: "⚖️ مقارنة",
};

const LABEL_OPTIONS = [
  { value: "interested", label: "مهتم / Interested", color: "bg-yellow-100 text-yellow-700" },
  { value: "customer", label: "عميل / Customer", color: "bg-green-100 text-green-700" },
  { value: "vip", label: "VIP ⭐", color: "bg-purple-100 text-purple-700" },
  { value: "cold", label: "بارد / Cold", color: "bg-slate-100 text-slate-600" },
  { value: "issue", label: "مشكلة / Issue", color: "bg-red-100 text-red-700" },
];

export default function Conversations() {
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [noteText, setNoteText] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: users = [], isLoading: loadingList, isFetching: fetchingList } = useListConversations();
  const { data: messages = [], isLoading: loadingMsgs } = useGetConversation(selectedUserId || "", {
    query: { enabled: !!selectedUserId },
  });
  const { mutate: pauseConv } = usePauseConversation();
  const { mutate: resumeConv } = useResumeConversation();
  const { mutate: setLabel } = useSetConversationLabel();
  const { mutate: sendReply, isPending: sendingReply } = useReplyToConversation();

  useEffect(() => {
    if (!selectedUserId) return;
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: [`/api/conversations/${selectedUserId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    }, 8000);
    return () => clearInterval(interval);
  }, [selectedUserId, queryClient]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    if (selectedUserId) {
      queryClient.invalidateQueries({ queryKey: [`/api/conversations/${selectedUserId}`] });
    }
  };

  const selectedUser = users.find((u) => u.fbUserId === selectedUserId);
  const isSelectedPaused = selectedUser?.isPaused === 1;

  const handleTogglePause = () => {
    if (!selectedUserId) return;
    if (isSelectedPaused) {
      resumeConv({ fbUserId: selectedUserId }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
          queryClient.invalidateQueries({ queryKey: ["/api/conversations/paused-count"] });
          toast({ title: "تم استئناف الذكاء الاصطناعي" });
        },
      });
    } else {
      pauseConv({ fbUserId: selectedUserId }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
          queryClient.invalidateQueries({ queryKey: ["/api/conversations/paused-count"] });
          toast({ title: "تم إيقاف الذكاء الاصطناعي — يمكنك الرد يدوياً الآن" });
        },
      });
    }
  };

  const handleLabelChange = (fbUserId: string, label: string) => {
    setLabel({ fbUserId, data: { label } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
        toast({ title: "تم تحديث التصنيف" });
      },
    });
  };

  const handleSendReply = () => {
    if (!selectedUserId || !replyText.trim() || sendingReply) return;
    sendReply(
      { fbUserId: selectedUserId, data: { message: replyText.trim() } },
      {
        onSuccess: () => {
          setReplyText("");
          queryClient.invalidateQueries({ queryKey: [`/api/conversations/${selectedUserId}`] });
          queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
          queryClient.invalidateQueries({ queryKey: ["/api/conversations/paused-count"] });
        },
        onError: () => {
          toast({ title: "فشل إرسال الرسالة", variant: "destructive" });
        },
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendReply();
    }
  };

  const handleSaveNote = async () => {
    if (!selectedUserId) return;
    setNoteSaving(true);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const token = getToken();
      await fetch(`${base}/api/conversations/${selectedUserId}/note`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ note: noteText }),
      });
      toast({ title: "تم حفظ الملاحظة" });
    } catch {
      toast({ title: "فشل حفظ الملاحظة", variant: "destructive" });
    } finally {
      setNoteSaving(false);
    }
  };

  const pausedCount = users.filter((u) => u.isPaused === 1).length;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-6xl mx-auto flex flex-col gap-4" style={{ height: "calc(100vh - 80px)" }}>
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">المحادثات</h1>
          <p className="text-muted-foreground mt-1">سجل الدردشة بين البوت والعملاء</p>
        </div>
        <div className="flex items-center gap-3">
          {pausedCount > 0 && (
            <Badge variant="destructive" className="gap-1">
              <PauseCircle className="w-3 h-3" />
              {pausedCount} محادثة متوقفة
            </Badge>
          )}
          <span className="text-xs text-muted-foreground font-mono">آخر تحديث: {format(new Date(), "HH:mm")}</span>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={fetchingList} className="rounded-xl bg-white shadow-sm border-border/50 hover:bg-slate-50">
            <RefreshCw className={`w-4 h-4 me-2 ${fetchingList ? 'animate-spin' : ''}`} /> تحديث
          </Button>
        </div>
      </div>

      <Card className="flex-1 flex overflow-hidden border-border/50 shadow-md shadow-slate-200/50 rounded-2xl min-h-0">
        <div className="w-1/3 border-e border-border/50 bg-slate-50/50 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-border/50 bg-white/50 backdrop-blur-sm z-10 sticky top-0">
            <h3 className="font-bold text-sm text-slate-500">قائمة العملاء</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {loadingList ? (
              [1,2,3,4].map(i => <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse m-1" />)
            ) : users.length === 0 ? (
              <div className="text-center p-8 text-muted-foreground text-sm">لا توجد محادثات مسجلة</div>
            ) : (
              users.map((u) => {
                const isPaused = u.isPaused === 1;
                const sentimentEmoji = u.sentiment ? SENTIMENT_EMOJI[u.sentiment] : null;
                const labelInfo = LABEL_OPTIONS.find(l => l.value === u.label);
                return (
                  <button
                    key={u.fbUserId}
                    onClick={() => setSelectedUserId(u.fbUserId)}
                    className={`w-full text-start p-4 rounded-xl transition-all duration-200 ${
                      selectedUserId === u.fbUserId
                        ? "bg-white shadow-md shadow-slate-200/50 border border-primary/20 ring-1 ring-primary/20"
                        : "hover:bg-slate-100 border border-transparent"
                    }`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className={`font-bold text-sm truncate pe-2 ${selectedUserId === u.fbUserId ? 'text-primary' : 'text-slate-700'}`}>
                        {u.fbUserName || "مستخدم"}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {sentimentEmoji && <span className="text-sm">{sentimentEmoji}</span>}
                        {isPaused && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">AI مُوقف</Badge>}
                        <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap">
                          {u.lastTimestamp ? format(new Date(u.lastTimestamp), "HH:mm") : ""}
                        </span>
                      </div>
                    </div>
                    {labelInfo && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${labelInfo.color} inline-block mb-1`}>
                        {labelInfo.label.split(" / ")[0]}
                      </span>
                    )}
                    <p className="text-xs text-muted-foreground truncate opacity-80 leading-relaxed">
                      {u.lastSender === "bot" && <Bot className="inline w-3 h-3 me-1 text-primary/50" />}
                      {u.lastSender === "admin" && <ShieldCheck className="inline w-3 h-3 me-1 text-green-500" />}
                      {u.lastMessage}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="w-2/3 flex flex-col bg-[#F8FAFC]">
          {selectedUserId && selectedUser ? (
            <>
              <div className="p-4 border-b border-border/50 bg-white shadow-sm flex items-center justify-between z-10 gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                    {selectedUser.fbUserName?.charAt(0) || "U"}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-bold text-slate-800">{selectedUser.fbUserName}</h2>
                      {selectedUser.sentiment && (
                        <span className="text-lg" title={selectedUser.sentiment}>
                          {SENTIMENT_EMOJI[selectedUser.sentiment]}
                        </span>
                      )}
                      {isSelectedPaused ? (
                        <Badge className="text-xs bg-green-100 text-green-700 border-green-200">
                          <ShieldCheck className="w-3 h-3 me-1" />
                          Live Chat
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          <Bot className="w-3 h-3 me-1" />
                          AI يتحكم
                        </Badge>
                      )}
                    </div>
                    <a href={selectedUser.fbProfileUrl || "#"} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1 mt-0.5">
                      <ExternalLink className="w-3 h-3" /> فتح الملف الشخصي
                    </a>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Select
                    value={selectedUser.label ?? ""}
                    onValueChange={(val) => handleLabelChange(selectedUser.fbUserId, val)}
                  >
                    <SelectTrigger className="h-8 w-36 text-xs">
                      <SelectValue placeholder="بدون تصنيف" />
                    </SelectTrigger>
                    <SelectContent>
                      {LABEL_OPTIONS.map(l => (
                        <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant={isSelectedPaused ? "default" : "outline"}
                    size="sm"
                    onClick={handleTogglePause}
                    className="gap-2 rounded-xl"
                  >
                    {isSelectedPaused ? <PlayCircle className="w-4 h-4" /> : <PauseCircle className="w-4 h-4" />}
                    {isSelectedPaused ? "استئناف AI" : "تولي المحادثة"}
                  </Button>
                </div>
              </div>

              {/* ── PHASE 5: Operator Note ── */}
              <div className="px-5 py-3 border-b border-border/50 bg-amber-50/40 flex items-center gap-2">
                <Pencil className="w-4 h-4 text-amber-600 shrink-0" />
                <Input
                  placeholder="ملاحظة داخلية للمشغل (لا تُرسل للعميل)..."
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSaveNote(); }}
                  className="h-8 text-sm bg-transparent border-amber-200 focus-visible:ring-amber-400 flex-1"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleSaveNote}
                  disabled={noteSaving}
                  className="h-8 px-2 text-amber-700 hover:bg-amber-100"
                >
                  {noteSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50 relative">
                {loadingMsgs ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="w-8 h-8 animate-spin text-primary/30" />
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isUser = msg.sender === "user";
                    const isAdmin = msg.sender === "admin";
                    const isBot = msg.sender === "bot";
                    const sentimentEmoji = msg.sentiment ? SENTIMENT_EMOJI[msg.sentiment] : null;

                    let bubbleClasses = "";
                    let avatarClasses = "";
                    let avatarIcon = <Bot className="w-4 h-4" />;
                    let senderLabel = "";

                    if (isUser) {
                      bubbleClasses = "bg-primary text-white rounded-2xl rounded-tl-sm";
                      avatarClasses = "bg-slate-200 text-slate-600";
                      avatarIcon = <User className="w-4 h-4" />;
                    } else if (isAdmin) {
                      bubbleClasses = "bg-green-500 text-white rounded-2xl rounded-tr-sm";
                      avatarClasses = "bg-green-100 text-green-700";
                      avatarIcon = <ShieldCheck className="w-4 h-4" />;
                      senderLabel = "أنت";
                    } else {
                      bubbleClasses = "bg-white text-slate-800 rounded-2xl rounded-tr-sm border border-slate-100";
                      avatarClasses = "bg-primary text-white";
                      avatarIcon = <Bot className="w-4 h-4" />;
                    }

                    return (
                      <div key={msg.id} className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}>
                        <div className={`flex gap-2 max-w-[75%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                          <div className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center shadow-sm ${avatarClasses}`}>
                            {avatarIcon}
                          </div>
                          <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                            {senderLabel && (
                              <span className="text-[10px] font-bold text-green-600 mb-0.5 px-1">{senderLabel}</span>
                            )}
                            <div className={`px-4 py-3 shadow-sm text-sm whitespace-pre-wrap leading-relaxed ${bubbleClasses}`}>
                              {msg.message}
                            </div>
                            <div className={`flex items-center gap-1 mt-1 px-1 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {format(new Date(msg.timestamp), "HH:mm")}
                              </span>
                              {sentimentEmoji && <span className="text-sm">{sentimentEmoji}</span>}
                            </div>
                            {isUser && msg.salesTriggerType && (
                              <div className={`flex items-center gap-1 mt-0.5 px-1 flex-wrap ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                                <span className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                                  {SALES_TRIGGER_LABEL[msg.salesTriggerType] ?? msg.salesTriggerType}
                                </span>
                              </div>
                            )}
                            {isBot && (msg.providerName || msg.sourceType) && (
                              <div className="flex items-center gap-1 mt-0.5 px-1 flex-wrap">
                                {msg.providerName && (
                                  <span className="text-[9px] font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                                    {msg.providerName}
                                  </span>
                                )}
                                {msg.modelName && (
                                  <span className="text-[9px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">
                                    {msg.modelName}
                                  </span>
                                )}
                                {msg.sourceType && (
                                  <span className="text-[9px] bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded-full">
                                    {SOURCE_TYPE_LABEL[msg.sourceType] ?? msg.sourceType}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {isSelectedPaused ? (
                <div className="p-4 border-t border-border/50 bg-white shadow-inner">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-xs font-medium text-green-600">Live Chat — أنت تتحكم الآن</span>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="اكتب رسالتك..."
                      className="flex-1 rounded-xl"
                      disabled={sendingReply}
                      dir="auto"
                    />
                    <Button
                      onClick={handleSendReply}
                      disabled={!replyText.trim() || sendingReply}
                      className="rounded-xl bg-green-600 hover:bg-green-700 gap-2"
                    >
                      {sendingReply ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      إرسال
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="p-4 border-t border-border/50 bg-white/80 flex items-center justify-center gap-3">
                  <Badge variant="secondary" className="gap-1">
                    <Bot className="w-3 h-3" />
                    AI يتحكم
                  </Badge>
                  <Button variant="outline" size="sm" onClick={handleTogglePause} className="rounded-xl gap-2">
                    <PauseCircle className="w-4 h-4" />
                    تولي المحادثة
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50">
              <MessageSquare className="w-16 h-16 mb-4 text-slate-200" />
              <p className="text-lg font-medium text-slate-500">اختر محادثة لعرضها</p>
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
