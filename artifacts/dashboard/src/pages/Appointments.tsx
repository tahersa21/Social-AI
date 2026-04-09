import { useState } from "react";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { Calendar, Clock, Plus, Trash2, Loader2, ExternalLink, CalendarCheck } from "lucide-react";
import { useListAppointments, useUpdateAppointment, useDeleteAppointment, useListSlots, useCreateSlot, useUpdateSlot, useDeleteSlot, useGetAiConfig, useUpdateAiConfig } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const DAY_NAMES = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const DAY_NAMES_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const STATUS_OPTIONS = [
  { value: "pending", label: "معلق / Pending", color: "bg-yellow-100 text-yellow-800" },
  { value: "confirmed", label: "مؤكد / Confirmed", color: "bg-green-100 text-green-800" },
  { value: "cancelled", label: "ملغي / Cancelled", color: "bg-red-100 text-red-800" },
  { value: "completed", label: "مكتمل / Completed", color: "bg-blue-100 text-blue-800" },
];

export default function Appointments() {
  const queryClient = useQueryClient();
  const [dateFilter, setDateFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const { data: appointments = [], isLoading: loadingAppts } = useListAppointments({ status: statusFilter || undefined, date: dateFilter || undefined });
  const { mutate: updateAppt } = useUpdateAppointment();
  const { mutate: deleteAppt } = useDeleteAppointment();

  const { data: slots = [], isLoading: loadingSlots } = useListSlots();
  const { mutate: createSlot } = useCreateSlot();
  const { mutate: updateSlot } = useUpdateSlot();
  const { mutate: deleteSlotMut } = useDeleteSlot();

  const { data: aiConfig } = useGetAiConfig();
  const { mutate: updateConfig, isPending: savingToggle } = useUpdateAiConfig();

  const appointmentsEnabled = Boolean(aiConfig?.appointmentsEnabled);

  const [newSlotDay, setNewSlotDay] = useState("1");
  const [newSlotTime, setNewSlotTime] = useState("09:00");
  const [newSlotMax, setNewSlotMax] = useState("1");

  const handleToggleAppointments = (enabled: boolean) => {
    updateConfig({ data: { appointmentsEnabled: enabled ? 1 : 0 } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/ai-config"] });
        toast({ title: enabled ? "تم تفعيل حجز المواعيد" : "تم إيقاف حجز المواعيد" });
      },
    });
  };

  const handleStatusChange = (id: number, status: string) => {
    updateAppt({ id, data: { status } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
        toast({ title: "تم التحديث" });
      },
    });
  };

  const handleDeleteAppt = (id: number) => {
    deleteAppt({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
        toast({ title: "تم الحذف" });
      },
    });
  };

  const handleAddSlot = () => {
    createSlot({ data: { dayOfWeek: parseInt(newSlotDay, 10) || 1, timeSlot: newSlotTime, maxBookings: parseInt(newSlotMax, 10) || 1 } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/slots"] });
        toast({ title: "تمت الإضافة" });
      },
    });
  };

  const handleToggleSlot = (id: number, current: number) => {
    updateSlot({ id, data: { isActive: current === 1 ? 0 : 1 } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/slots"] }),
    });
  };

  const handleDeleteSlot = (id: number) => {
    deleteSlotMut({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/slots"] });
        toast({ title: "تم حذف الفترة" });
      },
    });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">المواعيد / Appointments</h1>
          <p className="text-muted-foreground mt-1">إدارة حجوزات العملاء والفترات المتاحة</p>
        </div>

        {/* زر تفعيل/إيقاف الحجز */}
        <Card className={`border-none shadow-md shadow-black/10 transition-colors ${appointmentsEnabled ? "bg-green-50" : "bg-muted/40"}`}>
          <CardContent className="flex items-center gap-4 py-4 px-5">
            <CalendarCheck className={`w-5 h-5 ${appointmentsEnabled ? "text-green-600" : "text-muted-foreground/70"}`} />
            <div>
              <p className="text-sm font-semibold leading-tight">
                {appointmentsEnabled ? "حجز المواعيد مفعّل" : "حجز المواعيد موقوف"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {appointmentsEnabled
                  ? "البوت يقبل طلبات الحجز من العملاء"
                  : "البوت يرفض طلبات الحجز تلقائياً"}
              </p>
            </div>
            <Switch
              checked={appointmentsEnabled}
              onCheckedChange={handleToggleAppointments}
              disabled={savingToggle}
              className="ml-2"
            />
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="bookings" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="bookings" className="gap-2"><Calendar className="w-4 h-4" /> الحجوزات</TabsTrigger>
          <TabsTrigger value="slots" className="gap-2"><Clock className="w-4 h-4" /> الفترات المتاحة</TabsTrigger>
        </TabsList>

        <TabsContent value="bookings" className="space-y-4 mt-4">
          <div className="flex gap-3 flex-wrap">
            <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="w-48 h-10 bg-card" placeholder="تصفية بالتاريخ" />
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="w-48 h-10 bg-card"><SelectValue placeholder="كل الحالات" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Card className="border-none shadow-md shadow-black/10">
            <CardContent className="p-0">
              {loadingAppts ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
              ) : appointments.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">لا توجد مواعيد</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>العميل</TableHead>
                      <TableHead>الخدمة</TableHead>
                      <TableHead>التاريخ</TableHead>
                      <TableHead>الوقت</TableHead>
                      <TableHead>الحالة</TableHead>
                      <TableHead>ملاحظة</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {appointments.map((appt) => (
                      <TableRow key={appt.id}>
                        <TableCell>
                          <a href={appt.fbProfileUrl || "#"} target="_blank" rel="noreferrer" className="text-primary hover:underline flex items-center gap-1">
                            {appt.fbUserName || appt.fbUserId}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </TableCell>
                        <TableCell>{appt.serviceName || "-"}</TableCell>
                        <TableCell className="font-mono text-sm">{appt.appointmentDate || "-"}</TableCell>
                        <TableCell className="font-mono text-sm">{appt.timeSlot || "-"}</TableCell>
                        <TableCell>
                          <Select value={appt.status} onValueChange={(v) => handleStatusChange(appt.id, v)}>
                            <SelectTrigger className="h-8 w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate">{appt.note || "-"}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteAppt(appt.id)} className="text-destructive hover:text-destructive">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="slots" className="space-y-4 mt-4">
          <Card className="border-none shadow-md shadow-black/10">
            <CardHeader>
              <CardTitle className="text-lg">إضافة فترة جديدة / Add Slot</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3 flex-wrap items-end">
                <div className="space-y-1">
                  <label className="text-sm font-medium">اليوم / Day</label>
                  <Select value={newSlotDay} onValueChange={setNewSlotDay}>
                    <SelectTrigger className="w-40 h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DAY_NAMES.map((d, i) => <SelectItem key={i} value={String(i)}>{d} / {DAY_NAMES_EN[i]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">الوقت / Time</label>
                  <Input type="time" value={newSlotTime} onChange={(e) => setNewSlotTime(e.target.value)} className="w-32 h-10" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">الحد الأقصى / Max</label>
                  <Input type="number" value={newSlotMax} onChange={(e) => setNewSlotMax(e.target.value)} className="w-20 h-10" min={1} />
                </div>
                <Button onClick={handleAddSlot} className="h-10 gap-2 rounded-xl">
                  <Plus className="w-4 h-4" /> إضافة
                </Button>
              </div>
            </CardContent>
          </Card>

          {loadingSlots ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {DAY_NAMES.map((dayName, dayIdx) => {
                const daySlots = slots.filter(s => s.dayOfWeek === dayIdx);
                return (
                  <Card key={dayIdx} className="border-none shadow-md shadow-black/10">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{dayName} / {DAY_NAMES_EN[dayIdx]}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {daySlots.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-3">لا توجد مواعيد / No slots</p>
                      ) : (
                        daySlots.map(slot => (
                          <div key={slot.id} className={`flex items-center justify-between p-2 rounded-lg border ${slot.isActive ? 'bg-green-50/50 border-green-200' : 'bg-muted/40 border-border opacity-60'}`}>
                            <div className="flex items-center gap-2">
                              <Switch checked={slot.isActive === 1} onCheckedChange={() => handleToggleSlot(slot.id, slot.isActive)} />
                              <span className="font-mono text-sm font-medium">{slot.timeSlot}</span>
                              <Badge variant="outline" className="text-xs">max: {slot.maxBookings}</Badge>
                            </div>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteSlot(slot.id)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
