# 🤖 Facebook AI Agent Dashboard

> لوحة تحكم ذكية ثنائية اللغة (عربي / إنجليزي) لأتمتة رسائل Facebook Messenger وتعليقات المنشورات باستخدام الذكاء الاصطناعي.

---

## ✨ المميزات الرئيسية

| الميزة | الوصف |
|--------|--------|
| 🧠 **10 مزودي AI** | OpenAI، Anthropic، Gemini، Vertex AI، DeepSeek، Groq، OpenRouter، Orbit، AgentRouter، Custom |
| 🖼️ **Multimodal** | تحليل الصور والصوت والفيديو مع Fallback تلقائي بين المزودين |
| 🛍️ **كتالوج تفاعلي** | تصفح المنتجات، الطلبات، الطلبات المسبقة كاملاً من Messenger |
| 📁 **مجلدات المنتجات** | تنظيم المنتجات في مجلدات مع bulk-assign وتصفية سريعة |
| 📅 **مواعيد** | نظام حجز متكامل مع خانات زمنية قابلة للضبط |
| 📢 **بث جماعي** | رسائل جماعية مع فلاتر استهداف وجدولة |
| 📦 **تصدير Ecotrack** | تصدير الطلبات بصيغة Excel متوافقة مع منصة Ecotrack |
| 🌙 **Dark Mode** | واجهة كاملة بوضعين فاتح/داكن + RTL كامل |
| 🔒 **أمان متعدد الطبقات** | 6 طبقات حماية للـ Webhook + تشفير AES-256-GCM |
| 📊 **تحليلات** | إحصاءات المحادثات، الطلبات، ساعات الذروة، أداء المزودين |

---

## 🏗️ التقنيات المستخدمة

```
pnpm monorepo
├── artifacts/api-server   → Express 5 + TypeScript
├── artifacts/dashboard    → React + Vite + TailwindCSS v4
└── lib/db                 → PostgreSQL + Drizzle ORM
```

| التقنية | الاستخدام |
|---------|-----------|
| **Node.js 24** | Runtime |
| **TypeScript 5.9** | اللغة |
| **Express 5** | API Framework |
| **PostgreSQL** | قاعدة البيانات |
| **Drizzle ORM** | ORM + Migrations |
| **React 19** | Frontend |
| **Vite 7** | Build Tool |
| **TailwindCSS v4** | Styling |
| **shadcn/ui** | مكونات UI |
| **JWT + bcrypt** | المصادقة |
| **xlsx** | تصدير Excel (Ecotrack) |

---

## 🚀 التشغيل السريع

### المتطلبات
- Node.js 24+
- pnpm 9+
- PostgreSQL

### الخطوات

```bash
# 1. استنساخ المشروع
git clone https://github.com/tahersa21/Social-AI.git
cd Social-AI

# 2. تثبيت الاعتماديات
pnpm install

# 3. ضبط متغيرات البيئة
cp .env.example .env
# عدّل .env وأضف DATABASE_URL، ENCRYPTION_KEY، JWT_SECRET، ADMIN_PASSWORD

# 4. رفع مخطط قاعدة البيانات
pnpm --filter @workspace/db run push

# 5. تشغيل API (نافذة 1)
PORT=8080 BASE_PATH=/api pnpm --filter @workspace/api-server run dev

# 6. تشغيل Dashboard (نافذة 2)
PORT=3000 BASE_PATH=/ pnpm --filter @workspace/dashboard run dev
```

افتح المتصفح على `http://localhost:3000`

> ⚠️ **كلمة المرور**: إذا لم تضبط `ADMIN_PASSWORD`، تُولَّد تلقائياً وتُطبَع في الـ logs مرة واحدة — اقرأها فور التشغيل الأول!

---

## 🔑 متغيرات البيئة الأساسية

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/dbname
PORT=8080
BASE_PATH=/api
ENCRYPTION_KEY=your-32-char-min-key-here
JWT_SECRET=your-64-char-secret-here
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-password
APP_URL=https://your-domain.com
```

> انظر `.env.example` للقائمة الكاملة.

---

## 📁 هيكل المشروع

```
workspace/
├── artifacts/
│   ├── api-server/    ← Express 5 API
│   │   └── public/
│   │       └── ecotrack_template.xlsx  ← قالب تصدير Ecotrack
│   └── dashboard/     ← React Dashboard
├── lib/
│   ├── db/            ← Drizzle ORM Schema (25+ جدول)
│   ├── api-spec/      ← OpenAPI 3.1
│   └── api-client-react/ ← React Query hooks
├── .env.example
└── PROJECT_GUIDE.md   ← الدليل التفصيلي الكامل
```

---

## 🤖 مزودو الذكاء الاصطناعي المدعومون

| المزود | الدعم |
|--------|-------|
| **OpenAI** | ✅ نصي + صور |
| **Anthropic (Claude)** | ✅ نصي + صور |
| **Google Gemini** | ✅ نصي + صور + صوت |
| **Google Vertex AI** | ✅ نصي + صور + صوت (Service Account) |
| **DeepSeek** | ✅ نصي |
| **Groq** | ✅ نصي |
| **OpenRouter** | ✅ نصي + صور |
| **Orbit** | ✅ نصي |
| **AgentRouter** | ✅ نصي |
| **Custom** | ✅ أي OpenAI-compatible |

---

## 📦 تصدير Ecotrack

```
GET /api/orders/export?status=pending    ← طلبات معلقة فقط
GET /api/orders/export?status=confirmed  ← طلبات مؤكدة فقط
GET /api/orders/export                   ← جميع الطلبات
```

يُصدر ملف `.xlsx` متوافق مع منصة **Ecotrack** الجزائرية للشحن، بـ 18 عموداً تشمل: رقم الطلب، الاسم، الهاتف، كود الولاية، البلدية، العنوان، المنتج، المبلغ.

---

## 🔐 الأمان

- **6 طبقات حماية** للـ Webhook (IP Rate Limit، Signature، Replay Attack، Idempotency، Text Rate، Attachment Rate)
- **تشفير AES-256-GCM** لجميع API Keys في قاعدة البيانات
- **JWT** مع bcrypt لمصادقة لوحة التحكم
- **CORS** محكوم بقائمة بيضاء

---

## 📖 الوثائق

- **[PROJECT_GUIDE.md](./PROJECT_GUIDE.md)** — الدليل التفصيلي الكامل (API، DB، التشغيل، الميزات)
- **[.env.example](./.env.example)** — متغيرات البيئة المطلوبة

---

## 📄 الترخيص

MIT License — استخدم المشروع بحرية.
