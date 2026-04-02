# دليل المشروع الشامل — مساعد الصفحة الذكي

> **Facebook AI Agent Dashboard** — لوحة تحكم ثنائية اللغة (عربي / إنجليزي) لأتمتة رسائل Messenger وتعليقات المنشورات على Facebook باستخدام الذكاء الاصطناعي.

---

## جدول المحتويات

1. [نظرة عامة](#نظرة-عامة)
2. [هيكل المشروع](#هيكل-المشروع)
3. [كيفية تشغيل المشروع](#كيفية-تشغيل-المشروع)
4. [المنافذ والتوجيه](#المنافذ-والتوجيه)
5. [قاعدة البيانات](#قاعدة-البيانات)
6. [نظام المصادقة](#نظام-المصادقة)
7. [صفحات لوحة التحكم](#صفحات-لوحة-التحكم)
8. [API — جميع نقاط النهاية](#api--جميع-نقاط-النهاية)
9. [منطق الذكاء الاصطناعي](#منطق-الذكاء-الاصطناعي)
10. [Facebook Webhook — كيف يعمل](#facebook-webhook--كيف-يعمل)
11. [المراحل والميزات](#المراحل-والميزات)
12. [متغيرات البيئة](#متغيرات-البيئة)
13. [أوامر مفيدة](#أوامر-مفيدة)
14. [بيانات الدخول الافتراضية](#بيانات-الدخول-الافتراضية)
15. [سجل التحديثات الأخيرة](#سجل-التحديثات-الأخيرة)

---

## نظرة عامة

المشروع عبارة عن نظام متكامل يعمل على خادمين:
- **خادم API** (Express 5 + TypeScript) — يستقبل رسائل Facebook ويردّ عليها بالذكاء الاصطناعي
- **لوحة تحكم** (React + Vite) — واجهة المشغّل لإدارة كل شيء

النظام يدعم **16+ مجال تجاري** (أزياء، طعام، عقارات، طب، تقنية...إلخ) ويتيح للمشغّل التحكم الكامل في شخصية البوت وردوده وتدفق البيع.

---

## هيكل المشروع

```
workspace/
├── artifacts/
│   ├── api-server/              ← خادم API الرئيسي
│   │   └── src/
│   │       ├── index.ts         ← نقطة بدء الخادم
│   │       ├── routes/          ← جميع نقاط النهاية
│   │       │   ├── webhook.ts   ← قلب النظام (يستقبل رسائل Facebook)
│   │       │   ├── auth.ts      ← تسجيل الدخول / JWT
│   │       │   ├── aiConfig.ts  ← إعدادات البوت
│   │       │   ├── providers.ts ← مزودو الذكاء الاصطناعي
│   │       │   ├── products.ts  ← كتالوج المنتجات
│   │       │   ├── orders.ts    ← الطلبات
│   │       │   ├── conversations.ts ← المحادثات
│   │       │   ├── appointments.ts  ← المواعيد
│   │       │   ├── broadcasts.ts    ← الرسائل الجماعية
│   │       │   ├── leads.ts         ← جهات الاتصال المجمّعة
│   │       │   ├── stats.ts         ← إحصاءات الداشبورد
│   │       │   ├── conversions.ts   ← تتبع التحويلات (Phase 5)
│   │       │   ├── faqs.ts          ← الأسئلة الشائعة
│   │       │   ├── slots.ts         ← مواعيد متاحة
│   │       │   ├── reliability.ts   ← سجل أداء مزودي AI
│   │       │   └── notifications.ts ← إشعارات SSE
│   │       └── lib/
│   │           ├── ai.ts            ← منطق الذكاء الاصطناعي الرئيسي
│   │           ├── fbClient.ts      ← إرسال رسائل Facebook
│   │           └── seed.ts          ← بيانات أولية تلقائية
│   │
│   └── dashboard/               ← واجهة المستخدم
│       └── src/
│           ├── App.tsx           ← التوجيه + حماية المسارات
│           ├── pages/            ← صفحات لوحة التحكم (14 صفحة)
│           └── components/       ← مكونات مشتركة
│
├── lib/
│   ├── db/                      ← قاعدة البيانات (Drizzle ORM)
│   │   └── src/schema/          ← تعريف الجداول
│   ├── api-spec/                ← مواصفة OpenAPI 3.1
│   ├── api-client-react/        ← React Query hooks (مولّدة تلقائياً)
│   └── api-zod/                 ← مخططات Zod (مولّدة تلقائياً)
│
├── pnpm-workspace.yaml          ← إعداد الـ monorepo
└── PROJECT_GUIDE.md             ← هذا الملف
```

---

## كيفية تشغيل المشروع

### المتطلبات

- Node.js 24+
- pnpm 9+
- قاعدة بيانات PostgreSQL (تُوفّرها Replit تلقائياً)

### خطوات التشغيل

**1. تثبيت الاعتماديات**
```bash
pnpm install
```

**2. رفع مخطط قاعدة البيانات**
```bash
pnpm --filter @workspace/db run push
```

**3. تشغيل خادم API**
```bash
pnpm --filter @workspace/api-server run dev
```

**4. تشغيل لوحة التحكم (في نافذة ثانية)**
```bash
pnpm --filter @workspace/dashboard run dev
```

> **على Replit**: يتم تشغيل كلا الخادمين تلقائياً عبر Workflows المُعرّفة في المشروع.

### تشغيل الكل دفعة واحدة (من الجذر)
```bash
pnpm run dev
```

---

## المنافذ والتوجيه

| الخدمة | المنفذ | المسار |
|--------|--------|--------|
| خادم API (Express) | `8080` | `/api/*` |
| لوحة التحكم (React/Vite) | `3000` | `/` |

### كيف يصل المتصفح إلى الخادم

```
المتصفح
  │
  ├──  /api/*  ──→  خادم Express (8080)
  │
  └──  /*  ──→  لوحة React (3000)
```

على **Replit**: يوجد proxy يستقبل كل الطلبات ويوجّهها تلقائياً.

---

## قاعدة البيانات

**نوعها**: PostgreSQL مع Drizzle ORM  
**الملفات**: `lib/db/src/schema/`

### جدول الجداول الكاملة

| الجدول | الغرض |
|--------|--------|
| `admin_users` | حسابات المشغّلين (كلمة المرور مُشفّرة bcrypt) |
| `ai_config` | إعدادات البوت الكاملة (الشخصية، الأوقات، الحارسة...) |
| `ai_providers` | مزودو الذكاء الاصطناعي (OpenAI، Anthropic، DeepSeek...) |
| `conversations` | محادثات Messenger مع كل مستخدم |
| `messages` | رسائل كل محادثة |
| `products` | كتالوج المنتجات (حتى 5 صور، سعر، مخزون) |
| `orders` | طلبات الشراء من Messenger |
| `order_sessions` | جلسات جمع الطلب الجارية |
| `appointments` | حجوزات المواعيد |
| `available_slots` | الفترات المتاحة (يوم + وقت + حد أقصى) |
| `faqs` | الأسئلة الشائعة (تُحقن في system prompt) |
| `broadcasts` | حملات الرسائل الجماعية |
| `broadcast_templates` | قوالب رسائل جاهزة للبث |
| `leads` | جهات الاتصال التي جمعها البوت (هاتف / إيميل) |
| `comments_log` | سجل تعليقات المنشورات والردود |
| `fb_settings` | بيانات اعتماد صفحة Facebook (مُشفّرة AES-256-GCM) |
| `subscription_plans` | خطط الاشتراك الأربع |
| `subscription_usage` | استهلاك المحادثات والبث الشهري |
| `domain_templates` | قوالب جاهزة لكل مجال تجاري |
| `platform_events` | أحداث النظام (Sales Triggers، Price Lock...) |
| `product_inquiries` | استفسارات المنتجات (للسلة المتروكة) |
| `provider_usage_log` | سجل أداء مزودي AI |
| `pre_orders` | الطلبات المسبقة لمنتجات نفد مخزونها |
| `pre_order_sessions` | جلسات جمع بيانات الطلب المسبق الجارية |
| `conversation_sessions` | سياق المحادثة الجاري (لحفظ حالة البوت بين الرسائل) |
| `user_product_context` | آخر منتج شاهده المستخدم (للإجابة على أسئلة المتابعة) |
| `product_categories` | تصنيفات المنتجات الهرمية (رئيسية + فرعية) |
| `delivery_prices` | أسعار التوصيل (منزلي + مكتبي) لكل ولاية جزائرية |

### بيانات أولية تلقائية (Seed)

عند أول تشغيل يقوم النظام بإنشاء:
- مستخدم admin (admin / admin123)
- إعدادات بوت افتراضية بالعربية
- 6 مزودو AI (DeepSeek، OpenAI، Anthropic، Groq، OpenRouter، Orbit)
- منتج تجريبي بسعر 850 دج
- 3 أسئلة شائعة (أوقات العمل، الطلب، التوصيل)
- 20 موعد متاح (اثنين-جمعة، 4 أوقات/يوم)
- 4 خطط اشتراك (مجاني، مبتدئ 2900، احترافي 6900، وكالة 14900 دج)
- 6 قوالب مجالات تجارية

---

## نظام المصادقة

**نوعه**: JWT (JSON Web Token)  
**مكان التخزين**: `localStorage` بالمفتاح `fb_agent_token`

### تدفق الدخول

```
المستخدم يُدخل بيانات الدخول
        ↓
POST /api/auth/login
        ↓
الخادم يتحقق من bcrypt hash
        ↓
يُعيد { token, user }
        ↓
Token يُخزّن في localStorage
        ↓
كل طلب API يُرسل: Authorization: Bearer <token>
```

### حماية المسارات

- **Frontend**: مكون `PrivateRoute` يتحقق من الـ token قبل عرض أي صفحة
- **Backend**: middleware `authMiddleware` على كل `/api/*` إلا:
  - `POST /api/auth/login`
  - `GET|POST /api/webhook`
  - `GET /api/healthz`
  - `GET /api/notifications/stream`
  - `GET /api/products/image/:filename`

---

## صفحات لوحة التحكم

| المسار | الصفحة | الوصف |
|--------|--------|--------|
| `/login` | تسجيل الدخول | صفحة الدخول (بدون sidebar) |
| `/` | الداشبورد | إحصاءات + رسم Peak Hours + أفضل منتجات + Trust Layer |
| `/settings` | إعدادات AI | شخصية البوت، وقت العمل، الموضوعات المحظورة، Phase 5 Trust Controls |
| `/providers` | المزودون | إضافة/تعديل/تفعيل/اختبار مزودي الذكاء الاصطناعي |
| `/products` | المنتجات | كتالوج المنتجات مع الصور وإدارة المخزون |
| `/orders` | الطلبات | جدول الطلبات مع تبويبات الحالة |
| `/conversations` | المحادثات | عرض محادثات Messenger مع التحكم في البوت + ملاحظات المشغّل |
| `/appointments` | المواعيد | جدول الحجوزات + إدارة الفترات المتاحة |
| `/comments` | التعليقات | سجل تعليقات المنشورات وردود البوت |
| `/faq` | الأسئلة الشائعة | إضافة/تعديل/حذف الأسئلة التي يستخدمها البوت |
| `/broadcasts` | البث | إنشاء وإرسال رسائل جماعية |
| `/leads` | جهات الاتصال | قائمة العملاء المجمّعة + تصدير CSV |
| `/fb-connect` | ربط Facebook | إعداد الـ Webhook ورمز الوصول |
| `/subscription` | الاشتراك | خطط الاشتراك والاستهلاك الشهري |
| `/pre-orders` | الطلبات المسبقة | إدارة طلبات المنتجات المنفدة (قبول / رفض / تحويل لطلب) |
| `/reliability` | أداء المزودين | سجل تفصيلي لنجاح وفشل كل مزوّد AI |

> **ملاحظة UX — صفحة المحادثات**: الكارد الرئيسي مُقيّد بارتفاع `calc(100vh - 80px)` فقط منطقة الرسائل تتمرر داخلياً، ولا تتمرر الصفحة كاملةً.

---

## API — جميع نقاط النهاية

### المصادقة
```
POST   /api/auth/login          ← تسجيل الدخول → يعيد JWT token
POST   /api/auth/logout         ← تسجيل الخروج
GET    /api/auth/me             ← بيانات المستخدم الحالي
```

### إعدادات البوت
```
GET    /api/ai-config           ← قراءة كل إعدادات البوت
PUT    /api/ai-config           ← تعديل الإعدادات (يدعم رفع صورة logo)
```

### مزودو AI
```
GET    /api/providers           ← قائمة المزودين
POST   /api/providers           ← إضافة مزوّد
PUT    /api/providers/:id       ← تعديل مزوّد
DELETE /api/providers/:id       ← حذف مزوّد
POST   /api/providers/:id/activate  ← تفعيل مزوّد
POST   /api/providers/:id/test      ← اختبار الاتصال
```

### المنتجات
```
GET    /api/products              ← قائمة المنتجات
POST   /api/products              ← إضافة منتج (مع صور)
PUT    /api/products/:id          ← تعديل منتج
DELETE /api/products/:id          ← حذف منتج
PATCH  /api/products/:id/stock    ← تعديل المخزون (+/-)
```

### تصنيفات المنتجات
```
GET    /api/product-categories          ← قائمة التصنيفات (هرمية)
POST   /api/product-categories          ← إضافة تصنيف جديد
PUT    /api/product-categories/:id      ← تعديل تصنيف
DELETE /api/product-categories/:id      ← حذف تصنيف
```

### أسعار التوصيل
```
GET    /api/delivery-prices             ← قائمة الولايات مع الأسعار
POST   /api/delivery-prices             ← إضافة ولاية مخصصة
PUT    /api/delivery-prices/:id         ← تعديل سعر ولاية
DELETE /api/delivery-prices/:id         ← حذف ولاية مخصصة (IDs ≥ 70 فقط)
```

### الطلبات
```
GET    /api/orders              ← قائمة الطلبات (فلتر بالحالة)
GET    /api/orders/count        ← عدد الطلبات المعلّقة
PATCH  /api/orders/:id          ← تحديث حالة الطلب
```

### المحادثات
```
GET    /api/conversations                        ← قائمة المحادثات
GET    /api/conversations/:fbUserId              ← رسائل محادثة محددة
PATCH  /api/conversations/:fbUserId/pause        ← إيقاف البوت مؤقتاً
PATCH  /api/conversations/:fbUserId/resume       ← استئناف البوت
PATCH  /api/conversations/:fbUserId/label        ← تعيين تصنيف للعميل
PATCH  /api/conversations/:fbUserId/sentiment    ← تعيين المشاعر
PATCH  /api/conversations/:fbUserId/note         ← حفظ ملاحظة داخلية (Phase 5)
```

### المواعيد
```
GET    /api/appointments         ← قائمة الحجوزات
GET    /api/appointments/count   ← عدد الطلبات المعلّقة
PATCH  /api/appointments/:id     ← تحديث حالة
DELETE /api/appointments/:id     ← حذف
```

### الفترات الزمنية المتاحة
```
GET    /api/slots                ← جميع الفترات
POST   /api/slots                ← إضافة فترة
PATCH  /api/slots/:id            ← تعديل فترة
DELETE /api/slots/:id            ← حذف فترة
GET    /api/slots/available      ← الفترات المتاحة لتاريخ معين
```

### الأسئلة الشائعة
```
GET    /api/faqs                 ← قائمة الأسئلة
POST   /api/faqs                 ← إضافة سؤال
PUT    /api/faqs/:id             ← تعديل سؤال
DELETE /api/faqs/:id             ← حذف سؤال
```

### الرسائل الجماعية
```
GET    /api/broadcasts           ← قائمة الحملات
POST   /api/broadcasts           ← إنشاء حملة
POST   /api/broadcasts/:id/send  ← إرسال (نافذة 24 ساعة فقط)
DELETE /api/broadcasts/:id       ← حذف
```

### جهات الاتصال (Leads)
```
GET    /api/leads                ← قائمة العملاء
PATCH  /api/leads/:id            ← تعديل تصنيف / ملاحظات
DELETE /api/leads/:id            ← حذف
GET    /api/leads/export         ← تصدير CSV
```

### Facebook
```
GET    /api/fb-settings          ← بيانات الاعتماد المحفوظة
POST   /api/fb-settings          ← حفظ بيانات الاعتماد
GET    /api/fb-settings/test     ← اختبار الاتصال
GET    /api/webhook              ← التحقق من Webhook (Facebook يستدعيه)
POST   /api/webhook              ← استقبال الرسائل والتعليقات
```

### الإحصاءات
```
GET    /api/stats                ← كل إحصاءات الداشبورد (رسائل، طلبات، مواعيد، ذروة، Trust)
GET    /api/conversions          ← إحصاءات التحويلات (Phase 5)
```

### الاشتراك
```
GET    /api/subscription/plans   ← الخطط الأربع
GET    /api/subscription/current ← الخطة الحالية + الاستهلاك
PATCH  /api/subscription/current ← تغيير الخطة
GET    /api/subscription/usage   ← الاستهلاك الشهري
```

### الطلبات المسبقة
```
GET    /api/pre-orders           ← قائمة الطلبات المسبقة
GET    /api/pre-orders/:id       ← تفاصيل طلب مسبق محدد
PATCH  /api/pre-orders/:id/status ← تحديث الحالة (pending/confirmed/cancelled/fulfilled)
DELETE /api/pre-orders/:id       ← حذف
```

### أداء المزودين (Reliability)
```
GET    /api/reliability          ← سجل تفصيلي لنجاح/فشل كل مزوّد AI
GET    /api/providers/stats      ← إحصاءات مزودي AI (مع تنظيف تلقائي للسجلات المعطّلة)
```

### متنوع
```
GET    /api/healthz              ← فحص صحة الخادم
GET    /api/domain-templates     ← قوالب المجالات
GET    /api/domain-templates/:id ← قالب محدد
POST   /api/domain-templates/:id/apply ← تطبيق قالب
GET    /api/notifications/stream ← إشعارات SSE (Server-Sent Events)
GET    /api/comments             ← سجل التعليقات
GET    /api/comments/stats       ← إحصاءات التعليقات
```

---

## منطق الذكاء الاصطناعي

### الملف الرئيسي: `artifacts/api-server/src/lib/ai.ts`

#### `buildSystemPrompt()` — بناء System Prompt
هذه الدالة تبني التعليمات التي تُعطى للـ AI قبل كل رسالة. تشمل:
- اسم البوت وشخصيته
- قائمة المنتجات وأسعارها
- الأسئلة الشائعة المفعّلة
- ساعات العمل المتاحة اليوم
- قواعد الموضوعات (ما يُسمح بالحديث عنه)
- تعليمات الطلب والمواعيد

#### `callAI()` — استدعاء مزوّد AI
- يجلب المزوّد النشط من قاعدة البيانات
- يدعم: Anthropic (API الأصلية) وكل الآخرين (OpenAI-compatible)
- عند الفشل يُسجّل الخطأ في `provider_usage_log`

#### `parseOrderAction()` — تحليل طلبات البيع
تبحث في رد AI عن JSON من نوع:
```json
{"action": "start_order", "product": "اسم المنتج", "quantity": 1}
{"action": "confirm_order", "items": [...], "total": 1700}
{"action": "cancel_order"}
```

#### `parseAppointmentAction()` — تحليل حجز المواعيد
تبحث عن:
```json
{"action": "book_appointment", "date": "2026-04-01", "time": "10:00", "name": "العميل"}
```

#### `parseBrowseCatalogAction()` — اعتراض طلب تصفح الكاتالوج
عندما يسأل العميل عن المنتجات المتاحة، يُخرج AI:
```json
{"action": "browse_catalog"}
```
الـ Webhook يعترض هذا الرد **قبل** إرساله للمستخدم ويستبدله بقائمة أزرار الفئات مباشرةً (لا يُرسل أي نص).

#### `getAppBaseUrl()` — رابط التطبيق الصحيح
دالة مساعدة تُعيد الرابط الأساسي للخادم لاستخدامه في روابط صور المنتجات التي يُرسلها البوت إلى Facebook:
- **المصدر الأول**: متغير `REPLIT_DOMAINS` (يُحدَّث دائماً بالنطاق الصحيح)
- **الاحتياطي**: متغير `APP_URL` من `.replit`

---

## Facebook Webhook — كيف يعمل

الملف: `artifacts/api-server/src/routes/webhook.ts`

### تدفق معالجة الرسائل

```
رسالة تصل من Messenger
         ↓
1. [Phase 5] Price Lock — هل تحتوي على كلمات سعر؟
   نعم → يرد من قاعدة البيانات مباشرة (لا يصل للـ AI)
         ↓
2. هل المحادثة موقوفة (Paused)؟
   نعم → يتجاهل (المشغّل يتحدث مع العميل)
         ↓
3. هل الرسالة هي كلمة التحويل للإنسان؟
   نعم → يوقف المحادثة، يُرسل رسالة الانتقال
         ↓
4. هل خارج ساعات العمل؟
   نعم → يرسل رسالة "نعود في..."
         ↓
5. [Phase 5] Smart Escalation — هل يشعر العميل بتردد؟
   نعم + smartEscalationEnabled → يُرسل عرضاً خاصاً ويُسجّل حدثاً
         ↓
6. يُرسل الرسالة إلى AI مع System Prompt الكامل
         ↓
7. [Phase 6] يُحلّل رد AI:
   - {"action":"browse_catalog"} → يُلغي النص تماماً ويُرسل قائمة فئات الكاتالوج
   - هل يحتوي على طلب بيع؟ → ينفّذ الطلب
   - هل يحتوي على حجز موعد؟ → يُسجّل الموعد
         ↓
8. [Phase 5] Human Guarantee — إذا مفعّل يُضيف:
   "💬 إذا أردت التحدث مع شخص حقيقي، اكتب: بشري"
         ↓
9. يُرسل الرد عبر Facebook Graph API
         ↓
10. [Phase 5] Proof Engine — إذا تحوّل الطلب يُحدّث:
    convertedToOrder=1, conversionSource='bot'
```

### تدفق تصفح الكاتالوج (Phase 6)

```
مستخدم: "ماهي المنتجات المتاحة؟"
         ↓
AI يُخرج: {"action":"browse_catalog"}
         ↓
Webhook يعترض → sendCatalogCategoryMenu()
         ↓
أزرار Quick Reply: الأتمتة | تصميم | الإدارة ...
         ↓
مستخدم يضغط فئة → postback: FILTER_CATEGORY:تصميم
         ↓
sendCatalogPage() → كاروسيل المنتجات
   ├── مخزون > 0 → زر "🛒 اطلب الآن"  → ORDER_NOW → طلب عادي
   └── مخزون = 0 → زر "⏳ طلب مسبق" → PREORDER_START → طلب مسبق
```

### تدفق الطلب المسبق (Phase 6)

```
PREORDER_START:productId
         ↓
يُنشئ preOrderSession (step: collecting_name)
         ↓
يجمع: الاسم → الهاتف → الولاية → العنوان
         ↓
يحفظ في pre_orders بحالة "pending"
         ↓
المشغّل يرى الطلب في لوحة /pre-orders ويُحوّله لطلب عند توفر المنتج
```

### تدفق معالجة التعليقات

```
تعليق على منشور Facebook
         ↓
يُسجّل في comments_log
         ↓
يُرسل للـ AI ببرومبت خاص بالتعليقات
         ↓
يرد علناً على التعليق
         ↓
إذا كانت الإعدادات تطلب DM → يُرسل رسالة خاصة أيضاً
```

---

## المراحل والميزات

### Phase 1 — الأساسيات
- استقبال رسائل Messenger + ردود AI
- لوحة تحكم أساسية (محادثات، منتجات، طلبات)
- JWT auth

### Phase 2 — إدارة الأعمال
- تعدد مزودي AI مع التنشيط والاختبار
- مواعيد (جدولة + إدارة فترات)
- أسئلة شائعة تُحقن في System Prompt
- ربط Facebook (Webhook + Page Token)
- Strict Topic Mode (حارسة الموضوعات)
- Human Handoff (تحويل للإنسان بكلمة مفتاحية)

### Phase 3 — نمو وتوسع
- Lead Capture (جمع أرقام الهاتف والإيميل تلقائياً)
- Broadcast Messaging (رسائل جماعية)
- Subscription Plans (خطط اشتراك بالدينار الجزائري)
- Customer Labels (تصنيف العملاء)
- Sentiment Analysis (تحليل مشاعر تلقائي)
- Domain Templates (قوالب مجالات تجارية جاهزة)
- Quick Reply Buttons (أزرار ردود سريعة)

### Phase 4 — Sales Boost
- **Abandoned Cart Recovery** — رسالة تذكير للعميل الذي توقف عند استفسار منتج
- **Smart Sales Triggers** — يكتشف نية الشراء، والتردد، ومقارنة الأسعار، والاستعجال
- **Sales Boost UI** — شارات خضراء على المحادثات التي فيها نشاط بيعي
- **Multi-Provider Reliability** — تتبع أداء كل مزوّد وفشله

### Phase 5 — Trust Layer (طبقة الثقة)
- **Proof Engine** — تتبع تحويلات البوت (كم طلب أتمّه البوت فعلاً)
- **Price Lock** — يعترض كلمات السعر ويرد من قاعدة البيانات مباشرة (يمنع تذبذب الأسعار)
- **Smart Escalation** — يكتشف التردد ويُرسل عرضاً ذكياً بدلاً من فقدان العميل
- **Human Guarantee** — يُضيف تذكيراً دائماً بإمكانية التحدث مع إنسان
- **Operator Notes** — يُتيح للمشغّل كتابة ملاحظات داخلية عن كل محادثة (لا تُرسل للعميل)

### Phase 6 — Catalog Browser & Pre-order System (متجر ذكي)
- **Catalog Browser** — AI يُخرج `{"action":"browse_catalog"}` فيُعرض قائمة الفئات كـ Quick Reply مباشرةً
- **Product Carousel** — عند اختيار فئة يُعرض كاروسيل بصري مع صور المنتجات وأسعارها وأزرار تفاعلية
- **Smart Stock Buttons** — الكاروسيل يُفرّق تلقائياً:
  - مخزون > 0 → "🛒 اطلب الآن" (طلب عادي)
  - مخزون = 0 → "⏳ طلب مسبق" (Pre-order)
- **ORDER_NOW Stock Guard** — حتى لو وصل postback قديم لمنتج نفد، يُعاد توجيهه للطلب المسبق تلقائياً
- **Pre-order Flow** — جمع بيانات العميل (اسم → هاتف → ولاية → عنوان) وحفظها في `pre_orders`
- **Pre-orders Dashboard** — صفحة `/pre-orders` لإدارة الطلبات المسبقة وتحويلها لطلبات حقيقية عند توفر المخزون
- **Carousel UX** — رسالة "وجدنا X منتج 👇 اسحب ←" تظهر قبل الكاروسيل لإعلام المستخدم بالتمرير
- **Provider Alerts** — بانر أحمر في لوحة المزودين عند وجود مزوّد نشط بنسبة نجاح 0%
- **Provider Stats Auto-Cleanup** — تنظيف تلقائي لسجلات الأداء المعطّلة (orphan entries) عند كل استعلام
- **Image URL Fix** — `getAppBaseUrl()` يستخدم `REPLIT_DOMAINS` دائماً لضمان صحة روابط صور المنتجات
- **Order Validation Hardened** — التحقق من 4 حقول إلزامية (اسم، هاتف، ولاية، عنوان) في طرفَي AI والخادم

### Phase 7 — Product Intelligence & Multimodal (ذكاء المنتجات والوسائط المتعددة)

#### Phase 7A — Product Intelligence
- **User Product Context** — جدول `user_product_context` يحفظ آخر منتج شاهده كل مستخدم
- **Follow-up Questions** — الـ AI يُجيب على أسئلة "هل يناسبني؟"، "ما الفرق بين..."، "هل يستحق السعر؟" باستخدام سياق المنتج
- **Similar Product Suggestions** — عند عدم التطابق القوي يُقترح بدائل مشابهة

#### Phase 7B — Multimodal (الوسائط المتعددة) — مُعاد التصميم
التدفق **الجديد**: الصوت/الصور/الفيديو تُحوَّل إلى نص ثم تدخل الـ AI pipeline الطبيعية كاملاً (بدلاً من البحث المباشر عن منتج فقط)

| نوع المرفق | المعالجة |
|------------|----------|
| صوت | Gemini يُنسخ النص بدقة → يدخل pipeline الذكاء كرسالة نصية عادية |
| صورة | Gemini يُرسل وصفاً بالعربية → `[صورة]: <الوصف>` يدخل pipeline |
| فيديو | نفس معالجة الصورة |

- **دالة `transcribeOrDescribeAttachment()`** في `ai.ts` تتولى: جلب الوسيط، تحديد MIME type، إرساله لـ Gemini، إعادة النص
- **حد 15MB** — المرفقات الأكبر تُتجاهل
- **Timeout** — 15 ثانية للصور، 25 ثانية للصوت/الفيديو
- **إشعار واحد فقط** — يُرسَل من بلوك المرفق، لا يتكرر في Phase 8+
- **Fallback** — إذا فشل التحويل: رسالة خطأ واضحة + توقف (لا يُرسَل للـ AI)

#### Phase 7C — تصنيفات المنتجات الهرمية
- **جدول `product_categories`** — id, name, parentId, createdAt
- **دعم هرمي** — تصنيفات رئيسية (الهواتف) وتصنيفات فرعية تحتها (آيفون، سامسونج)
- **واجهة الإدارة** — زر "إدارة التصنيفات" في صفحة `/products` يفتح Dialog كامل
- **اختيار متعدد** — عند إضافة/تعديل منتج يمكن اختيار أكثر من تصنيف
- **التخزين** — أسماء التصنيفات تُخزَّن مفصولة بفواصل في عمود `category` الموجود

### Phase 8 — Delivery in Order Flow (التوصيل ضمن تدفق الطلب)
- **`deliveryEnabled`** — إعداد في `ai_config` يُفعّل/يوقف خطوة التوصيل
- **تدفق الطلب الكامل**:
  ```
  جمع البيانات (اسم → هاتف → ولاية → عنوان)
           ↓
  إذا deliveryEnabled → sendDeliveryOptions()
           ↓
  Quick Reply: "🏠 توصيل للمنزل Xدج" | "🏢 توصيل للمكتب Yدج"
           ↓
  DELIVERY_HOME / DELIVERY_OFFICE → يحفظ الاختيار والسعر
           ↓
  CONFIRM_ORDER → يحفظ deliveryType + deliveryPrice في ordersTable
           ↓
  رسالة التأكيد تتضمن سعر التوصيل في المجموع الكلي
  ```
- **69 ولاية جزائرية** مُدرجة بأسماء عربية وإنجليزية (IDs 1-69 غير قابلة للحذف)
- **ولايات مخصصة** — IDs ≥ 70 قابلة للإضافة والحذف
- **CHANGE_DELIVERY** — المستخدم يمكنه إعادة اختيار طريقة التوصيل
- **اعتراض نصي** — كتابة "منزل"/"مكتب" في أي وقت تعمل كـ Quick Reply
- **صفحة `/delivery`** — إدارة أسعار التوصيل لكل ولاية من لوحة التحكم

---

## متغيرات البيئة

| المتغير | مطلوب؟ | الوصف |
|---------|--------|--------|
| `DATABASE_URL` | نعم | رابط PostgreSQL (تُوفّره Replit تلقائياً) |
| `ENCRYPTION_KEY` | نعم | مفتاح 32 حرف لتشفير بيانات Facebook |
| `JWT_SECRET` | لا | سرّ توقيع JWT (افتراضياً يستخدم ENCRYPTION_KEY) |
| `ADMIN_USERNAME` | لا | اسم المستخدم الأولي (افتراضي: admin) |
| `ADMIN_PASSWORD` | لا | كلمة المرور الأولية (مطلوبة في الإنتاج) |
| `PORT` | نعم | المنفذ (تُوفّره Replit تلقائياً لكل artifact) |
| `BASE_PATH` | نعم | المسار الأساسي (يُوفّره Replit تلقائياً) |
| `REPLIT_DOMAINS` | تلقائي | النطاق الصحيح للبيئة — تستخدمه `getAppBaseUrl()` لروابط صور المنتجات |
| `APP_URL` | لا | رابط احتياطي إذا لم يُوجد `REPLIT_DOMAINS` |

---

## أوامر مفيدة

### تطوير
```bash
# تثبيت كل الاعتماديات
pnpm install

# تشغيل خادم API فقط
pnpm --filter @workspace/api-server run dev

# تشغيل لوحة التحكم فقط
pnpm --filter @workspace/dashboard run dev
```

### قاعدة البيانات
```bash
# رفع التغييرات على المخطط (بدون فقدان بيانات)
pnpm --filter @workspace/db run push

# رفع إجباري (قد يُحذف بيانات!)
pnpm --filter @workspace/db run push-force
```

### توليد الكود
```bash
# توليد React Query hooks + Zod schemas من OpenAPI spec
pnpm --filter @workspace/api-spec run codegen
```

### فحص الأنواع
```bash
# TypeScript typecheck للكل
pnpm run typecheck
```

---

## بيانات الدخول الافتراضية

```
اسم المستخدم : admin
كلمة المرور  : admin123
```

> ⚠️ **مهم**: غيّر كلمة المرور قبل النشر في الإنتاج عن طريق متغير البيئة `ADMIN_PASSWORD`.

---

## نصائح سريعة للمشغّل

1. **لربط صفحة Facebook**: اذهب إلى `/fb-connect` وأدخل رمز الوصول وتوكن التحقق
2. **لتفعيل الذكاء الاصطناعي**: اذهب إلى `/providers` وأضف مفتاح API لأي مزوّد وفعّله
3. **لتخصيص البوت**: اذهب إلى `/settings` وعدّل الاسم والشخصية والمجال التجاري
4. **لإيقاف البوت مؤقتاً**: من صفحة `/conversations`، اضغط "تولي المحادثة" لأي عميل
5. **لرصد التحويلات**: في الداشبورد الرئيسي — قسم "طبقة الثقة" يُظهر نسبة التحويل وعدد التدخلات
6. **لمتابعة الطلبات المسبقة**: اذهب إلى `/pre-orders` — كل طلب يمكن تحويله لطلب حقيقي عند توفر المخزون
7. **عند مشكلة في مزوّد AI**: تحقق من `/providers` — إذا ظهر بانر أحمر يعني المزوّد النشط لا يعمل

---

## سجل التحديثات الأخيرة

### Phase 8 + 7 — الإصدار الحالي (أبريل 2026)

| التاريخ | التحديث |
|---------|---------|
| أبريل 2026 | **Multimodal مُعاد التصميم (Phase 7B)**: الصوت يُنسَخ نصياً بـ Gemini والصور تُوصَف، ثم يدخل كل شيء الـ AI pipeline الطبيعية — بدلاً من البحث المباشر عن منتج فقط |
| أبريل 2026 | **تصنيفات المنتجات الهرمية (Phase 7C)**: جدول `product_categories` جديد، دعم parent/child، واجهة إدارة كاملة من `/products`، اختيار متعدد في نموذج المنتج |
| أبريل 2026 | **إحصائية المحادثات اليومية**: إصلاح الحساب ليعدّ محادثات فريدة (مستخدمون مختلفون) خلال آخر 24 ساعة بدلاً من عدد الرسائل |
| أبريل 2026 | **توثيق شامل**: تحديث `replit.md` و`PROJECT_GUIDE.md` بجميع الميزات الجديدة |

### Phase 6 — (مارس 2026)

| التاريخ | التحديث |
|---------|---------|
| مارس 2026 | **Delivery in Order Flow (Phase 8)**: خطوة اختيار التوصيل بعد جمع البيانات، أسعار منزلي/مكتبي لكل ولاية، حفظ `deliveryType` + `deliveryPrice` في `ordersTable` |
| مارس 2026 | **69 ولاية جزائرية**: قاعدة بيانات كاملة بأسماء عربية وإنجليزية؛ صفحة `/delivery` لإدارة الأسعار |
| مارس 2026 | **إصلاح نظام الطلبات مع المخزون**: زر الكاروسيل يتحول تلقائياً لـ "طلب مسبق" عند مخزون = 0؛ معالج ORDER_NOW يتحقق من المخزون ويوجّه للطلب المسبق |
| مارس 2026 | **إصلاح واجهة المحادثات**: الصفحة محصورة بارتفاع `calc(100vh - 80px)` — منطقة الرسائل فقط تتمرر داخلياً |
| مارس 2026 | **Catalog Browser**: AI يُخرج `{"action":"browse_catalog"}` → الـ Webhook يُلغي النص ويُرسل قائمة الفئات مباشرةً |
| مارس 2026 | **إصلاح روابط صور المنتجات**: `getAppBaseUrl()` تستخدم `REPLIT_DOMAINS` أولاً لتجنب انقطاع الروابط |
| مارس 2026 | **تصلّب جمع بيانات الطلب**: 4 حقول إلزامية (اسم، هاتف، ولاية، عنوان) يُتحقق منها في AI والخادم معاً |
| مارس 2026 | **Carousel UX**: رسالة عداد المنتجات ("وجدنا X منتج 👇 اسحب ←") قبل الكاروسيل |
| مارس 2026 | **Provider Stats Auto-Cleanup**: حذف تلقائي لسجلات الأداء اليتيمة عند كل استعلام للإحصاءات |
| مارس 2026 | **Provider Failure Alert**: بانر أحمر في `/providers` عند مزوّد نشط بنسبة نجاح 0% |
