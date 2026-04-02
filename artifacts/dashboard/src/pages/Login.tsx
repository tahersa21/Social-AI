import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Bot, Loader2, LogIn } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { isLoggedIn, setToken } from "@/lib/auth";

export default function Login() {
  const [, navigate] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isLoggedIn()) {
      navigate("/", { replace: true });
    }
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { message?: string };
        setError(data.message || "خطأ في تسجيل الدخول");
        return;
      }

      const data = await res.json() as { token: string };
      setToken(data.token);
      navigate("/", { replace: true });
    } catch {
      setError("فشل الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  };

  if (isLoggedIn()) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50/50 p-4" dir="rtl">
      <Card className="w-full max-w-md border-none shadow-xl shadow-slate-200/50">
        <CardHeader className="text-center space-y-4 pb-2">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20">
            <Bot className="w-9 h-9 text-white" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">مساعد الصفحة الذكي</CardTitle>
            <p className="text-muted-foreground text-sm mt-1">تسجيل الدخول إلى لوحة التحكم</p>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-xl text-center font-medium">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium">اسم المستخدم / Username</label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                className="h-11 bg-slate-50/50"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">كلمة المرور / Password</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-11 bg-slate-50/50"
              />
            </div>
            <Button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full h-11 rounded-xl shadow-lg shadow-primary/20 hover:shadow-xl transition-all gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
              تسجيل الدخول
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
