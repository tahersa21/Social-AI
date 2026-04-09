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
10. [Vertex AI — الإعداد والاستخدام](#vertex-ai--الإعداد-والاستخدام)
11. [Facebook Webhook — كيف يعمل](#facebook-webhook--كيف-يعمل)
12. [متغيرات البيئة](#متغيرات-البيئة)
13. [أوامر التشغيل والبناء](#أوامر-التشغيل-والبناء)
14. [بيانات الدخول الافتراضية](#بيانات-الدخول-الافتراضية)
15. [سجل التحديثات الأخيرة](#سجل-التحديثات-الأخيرة)

---

## نظرة عامة

المشروع عبارة عن نظام متكامل يعمل على خادمين:
- **خادم API** (Express 5 + TypeScript) — يستقبل رسائل Facebook ويردّ عليها بالذكاء الاصطناعي
- **لوحة تحكم** (React + Vite) — واجهة المشغّل لإدارة كل شيء

النظام يدعم **16+ مجال تجاري** (أزياء، طعام، عقارات، طب، تقنية...إلخ) ويدعم **9 مزودي ذكاء اصطناعي** مع نظام Failover تلقائي.

**أبرز المميزات:**
- ✅ رد تلقائي ذكي على Messenger والتعليقات
- ✅ دعم الصور والصوت والفيديو (Multimodal)
- ✅ كتالوج منتجات تفاعلي مع تدفق الطلبات
- ✅ نظام مواعيد متكامل
- ✅ بث جماعي للرسائل
- ✅ Dark Mode كامل + RTL كامل
- ✅ Vertex AI + Gemini + OpenAI + Anthropic وأكثر

---

## هيكل المشروع

```
workspace/
├── artifacts/
│   ├── api-server/              ← خادم API الرئيسي (Express 5)
│   │   └── src/
│   │       ├── index.ts         ← نقطة بدء الخادم
│   │       ├── app.ts           ← إعداد Express + Middleware
│   │       ├── routes/          ← جميع نقاط النهاية
│   │       │   ├── webhook.ts       ← قلب النظام (رسائل Facebook)
│   │       │   ├── auth.ts          ← تسجيل الدخول / JWT
│   │       │   ├── aiConfig.ts      ← إعدادات البوت
│   │       │   ├── providers.ts     ← مزودو الذكاء الاصطناعي
│   │       │   ├── products.ts      ← كتالوج المنتجات
│   │       │   ├── orders.ts        ← الطلبات
│   │       │   ├── conversations.ts ← المحادثات
│   │       │   ├── appointments.ts  ← المواعيد
│   │       │   ├── broadcasts.ts    ← الرسائل الجماعية
│   │       │   ├── leads.ts         ← جهات الاتصال
│   │       │   ├── faqs.ts          ← الأسئلة الشائعة
│   │       │   ├── deliveryPrices.ts ← أسعار التوصيل (69 ولاية)
│   │       │   ├── productFolders.ts ← مجلدات المنتجات (CRUD + bulk-assign)
│   │       │   ├── comments.ts      ← تعليقات المنشورات
│   │       │   ├── notifications.ts ← إشعارات SSE
│   │       │   ├── reliability.ts   ← أداء مزودي AI
│   │       │   └── stats.ts         ← إحصاءات الداشبورد
│   │       └── lib/
│   │           ├── ai.ts            ← منطق الذكاء الاصطناعي الرئيسي
│   │           ├── vertexAi.ts      ← Vertex AI provider (multimodal)
│   │           ├── webhookAttachment.ts ← معالجة المرفقات
│   │           ├── webhookUtils.ts  ← دوال مساعدة + rate limiters
│   │           ├── rateLimit.ts     ← rate limiters هجينة
│   │           ├── dbHelpers.ts     ← دوال DB المشتركة
│   │           ├── catalogFlow.ts   ← تدفق الكاتالوج
│   │           ├── orderFlow.ts     ← تدفق الطلبات
│   │           ├── cache.ts         ← In-memory cache
│   │           ├── redisCache.ts    ← Redis + fallback
│   │           ├── encryption.ts    ← AES-256-GCM
│   │           └── seed.ts          ← بيانات أولية
│   │
│   └── dashboard/               ← واجهة المستخدم (React + Vite)
│       └── src/
│           ├── App.tsx           ← التوجيه + حماية المسارات
│           ├── index.css         ← Dark Mode CSS variables
│           ├── pages/            ← 16+ صفحة
│           └── components/       ← مكونات مشتركة
│
├── lib/
│   ├── db/                      ← قاعدة البيانات (Drizzle ORM)
│   │   ├── src/schema/          ← تعريف الجداول (25+ جدول)
│   │   ├── drizzle.config.ts    ← إعداد Drizzle
│   │   └── migrations/          ← ملفات الترحيل
│   ├── api-spec/                ← مواصفة OpenAPI 3.1
│   ├── api-client-react/        ← React Query hooks (مولّدة)
│   └── api-zod/                 ← مخططات Zod (مولّدة)
│
├── .env.example                 ← مثال متغيرات البيئة
├── pnpm-workspace.yaml          ← إعداد الـ monorepo
├── package.json                 ← scripts الجذر
└── PROJECT_GUIDE.md             ← هذا الملف
```

---

## كيفية تشغيل المشروع

### المتطلبات

- **Node.js** 24+
- **pnpm** 9+
- **PostgreSQL** (تُوفّرها Replit تلقائياً، أو أي قاعدة بيانات PostgreSQL)

### خطوات التشغيل الكاملة

**1. استنساخ المشروع**
```bash
git clone https://github.com/tahersa21/Social-AI.git
cd Social-AI
```

**2. تثبيت الاعتماديات**
```bash
pnpm install
```

**3. ضبط متغيرات البيئة**
```bash
cp .env.example .env
# عدّل .env وأضف قيمك الخاصة
```

**4. رفع مخطط قاعدة البيانات**
```bash
pnpm --filter @workspace/db run push
```

**5. تشغيل خادم API**
```bash
PORT=8080 BASE_PATH=/api pnpm --filter @workspace/api-server run dev
```

**6. تشغيل لوحة التحكم (في نافذة ثانية)**
```bash
PORT=3000 BASE_PATH=/ pnpm --filter @workspace/dashboard run dev
```

> **على Replit**: يتم تشغيل كلا الخادمين تلقائياً عبر Workflows المُعرّفة في المشروع.

### تشغيل الكل دفعة واحدة
```bash
pnpm run dev
```

### بناء للإنتاج
```bash
# بناء API
pnpm --filter @workspace/api-server run build

# بناء Dashboard
pnpm --filter @workspace/dashboard run build
```

---

## المنافذ والتوجيه

| الخدمة | المنفذ | المسار |
|--------|--------|--------|
| خادم API (Express) | `8080` | `/api/*` |
| لوحة التحكم (React/Vite) | `3000` | `/` |

```
المتصفح
  │
  ├──  /api/*  ──→  Express API (8080)
  │
  └──  /*  ──→  React Dashboard (3000)
```

على **Replit**: Proxy يستقبل كل الطلبات ويوجّهها تلقائياً.

---

## قاعدة البيانات

**النوع**: PostgreSQL + Drizzle ORM  
**الملفات**: `lib/db/src/schema/`

### أوامر قاعدة البيانات
```bash
# رفع مخطط جديد
pnpm --filter @workspace/db run push

# إنشاء ملف migration جديد
pnpm --filter @workspace/db run generate

# تشغيل migrations
pnpm --filter @workspace/db run migrate

# فتح Drizzle Studio (واجهة DB بصرية)
pnpm --filter @workspace/db run studio
```

### جدول الجداول الكاملة

| الجدول | الغرض |
|--------|--------|
| `admin_users` | حسابات المشغّلين (bcrypt) |
| `ai_config` | إعدادات البوت الكاملة |
| `ai_providers` | مزودو الذكاء الاصطناعي + أولوياتهم |
| `conversations` | محادثات Messenger |
| `conversation_sessions` | سياق المحادثة الجاري |
| `products` | كتالوج المنتجات (5 صور، سعر، مخزون، folderId) |
| `product_categories` | تصنيفات هرمية (رئيسية + فرعية) |
| `product_folders` | مجلدات تنظيم المنتجات |
| `orders` | طلبات الشراء من Messenger (يشمل customerCommune) |
| `order_sessions` | جلسات جمع الطلب الجارية (يشمل customerCommune) |
| `pre_orders` | الطلبات المسبقة (منتجات نفد مخزونها) |
| `pre_order_sessions` | جلسات الطلب المسبق |
| `appointments` | حجوزات المواعيد |
| `available_slots` | الفترات الزمنية المتاحة |
| `faqs` | الأسئلة الشائعة (تُحقن في system prompt) |
| `broadcasts` | حملات الرسائل الجماعية |
| `broadcast_templates` | قوالب رسائل جاهزة |
| `leads` | جهات الاتصال (هاتف / إيميل) |
| `comments_log` | تعليقات المنشورات والردود |
| `fb_settings` | بيانات اعتماد صفحة Facebook (AES-256-GCM) |
| `delivery_prices` | أسعار التوصيل لكل ولاية (69 ولاية) |
| `subscription_plans` | خطط الاشتراك الأربع |
| `subscription_usage` | استهلاك المحادثات والبث الشهري |
| `domain_templates` | قوالب جاهزة لكل مجال تجاري |
| `platform_events` | أحداث النظام (Sales Triggers، تشخيص) |
| `product_inquiries` | استفسارات المنتجات (للسلة المتروكة) |
| `provider_usage_log` | سجل أداء مزودي AI |
| `user_product_context` | آخر منتج تفاعل معه المستخدم |
| `processed_messages` | معرّفات الرسائل (Idempotency، تُحذف بعد 24h) |
| `user_counters` | عدادات المستخدمين (offTopicCount) |

### بيانات أولية تلقائية (Seed)

عند أول تشغيل يُنشئ النظام:
- مستخدم admin (اسم: `ADMIN_USERNAME` أو `admin` — كلمة مرور: `ADMIN_PASSWORD` أو تُولَّد عشوائياً وتُطبَع في logs)
- إعدادات بوت افتراضية بالعربية
- 10 مزودو AI (DeepSeek، OpenAI، Anthropic، Gemini، Vertex AI، Groq، OpenRouter، Orbit، AgentRouter، Custom)
- منتج تجريبي
- 3 أسئلة شائعة
- 20 موعد متاح
- 4 خطط اشتراك
- 6 قوالب مجالات تجارية
- 69 ولاية جزائرية بأسعار توصيل افتراضية

---

## نظام المصادقة

**النوع**: JWT (JSON Web Token)  
**التخزين**: `localStorage` بالمفتاح `fb_agent_token`

### تدفق الدخول

```
بيانات الدخول
      ↓
POST /api/auth/login
      ↓
الخادم يتحقق من bcrypt hash
      ↓
يُعيد { token, user }
      ↓
Token → localStorage
      ↓
كل طلب: Authorization: Bearer <token>
```

### المسارات غير المحمية
- `POST /api/auth/login`
- `GET|POST /api/webhook`
- `GET /api/healthz`
- `GET /api/notifications/stream`
- `GET /api/products/image/:filename`
- `GET /api/broadcasts/image/:id`

---

## صفحات لوحة التحكم

| المسار | الصفحة | الوصف |
|--------|--------|--------|
| `/login` | تسجيل الدخول | صفحة الدخول |
| `/` | الداشبورد | إحصاءات + Peak Hours + Trust Layer |
| `/settings` | إعدادات AI | شخصية البوت، وقت العمل، الموضوعات |
| `/providers` | المزودون | إضافة/تعديل/تفعيل/اختبار مزودي AI (يشمل Vertex AI) |
| `/products` | المنتجات | كتالوج المنتجات + الصور + المخزون |
| `/orders` | الطلبات | جدول الطلبات مع تبويبات الحالة |
| `/conversations` | المحادثات | Messenger مع التحكم في البوت + ملاحظات |
| `/appointments` | المواعيد | جدول الحجوزات + الفترات المتاحة |
| `/comments` | التعليقات | سجل تعليقات المنشورات |
| `/faq` | الأسئلة الشائعة | إضافة/تعديل/حذف الأسئلة |
| `/broadcasts` | البث | إنشاء وإرسال رسائل جماعية |
| `/leads` | جهات الاتصال | قائمة العملاء + تصدير CSV |
| `/fb-connect` | ربط Facebook | إعداد الـ Webhook + رمز الوصول |
| `/subscription` | الاشتراك | خطط الاشتراك والاستهلاك الشهري |
| `/pre-orders` | الطلبات المسبقة | إدارة طلبات المنتجات المنفدة |
| `/reliability` | أداء المزودين | سجل نجاح/فشل كل مزوّد AI |
| `/delivery` | التوصيل | أسعار التوصيل لكل ولاية |

---

## API — جميع نقاط النهاية

### المصادقة
```
POST   /api/auth/login          → تسجيل الدخول → JWT token
POST   /api/auth/logout         → تسجيل الخروج
GET    /api/auth/me             → بيانات المستخدم الحالي
```

### إعدادات البوت
```
GET    /api/ai-config           → قراءة الإعدادات
PUT    /api/ai-config           → تعديل الإعدادات
```

### مزودو AI
```
GET    /api/providers           → قائمة المزودين
POST   /api/providers           → إضافة مزوّد
PUT    /api/providers/:id       → تعديل مزوّد
DELETE /api/providers/:id       → حذف مزوّد
POST   /api/providers/:id/activate  → تفعيل مزوّد
POST   /api/providers/:id/test      → اختبار الاتصال
```

### المنتجات
```
GET    /api/products              → قائمة المنتجات
POST   /api/products              → إضافة منتج (مع صور)
PUT    /api/products/:id          → تعديل منتج
DELETE /api/products/:id          → حذف منتج
PATCH  /api/products/:id/stock    → تعديل المخزون
GET    /api/products/image/:filename → عرض صورة منتج
```

### تصنيفات المنتجات
```
GET    /api/product-categories          → قائمة التصنيفات الهرمية
POST   /api/product-categories          → إضافة تصنيف
PUT    /api/product-categories/:id      → تعديل تصنيف
DELETE /api/product-categories/:id      → حذف تصنيف
```

### أسعار التوصيل
```
GET    /api/delivery-prices             → الولايات + الأسعار
POST   /api/delivery-prices             → إضافة ولاية مخصصة
PUT    /api/delivery-prices/:id         → تعديل سعر
DELETE /api/delivery-prices/:id         → حذف ولاية مخصصة (IDs ≥ 70)
```

### الطلبات
```
GET    /api/orders                        → قائمة الطلبات
GET    /api/orders/count                  → عدد الطلبات المعلّقة
GET    /api/orders/export?status=<filter> → تصدير Excel بصيغة Ecotrack (.xlsx)
PATCH  /api/orders/:id                    → تحديث حالة الطلب
```

> **تصدير Ecotrack**: يقبل `?status=pending|confirmed|delivered|cancelled` أو بدون فلتر للكل. يُعيد ملف `.xlsx` بـ 18 عموداً متوافق مع منصة Ecotrack الجزائرية للشحن. القالب محفوظ في `artifacts/api-server/public/ecotrack_template.xlsx`.

### المحادثات
```
GET    /api/conversations                       → قائمة المحادثات
GET    /api/conversations/:fbUserId             → رسائل محادثة
PATCH  /api/conversations/:fbUserId/pause       → إيقاف البوت
PATCH  /api/conversations/:fbUserId/resume      → استئناف البوت
PATCH  /api/conversations/:fbUserId/label       → تعيين تصنيف
PATCH  /api/conversations/:fbUserId/sentiment   → تعيين المشاعر
PATCH  /api/conversations/:fbUserId/note        → حفظ ملاحظة
```

### المواعيد
```
GET    /api/appointments         → قائمة الحجوزات
GET    /api/appointments/count   → عدد المعلّقة
PATCH  /api/appointments/:id     → تحديث حالة
DELETE /api/appointments/:id     → حذف
```

### الفترات الزمنية
```
GET    /api/slots                → جميع الفترات
POST   /api/slots                → إضافة فترة
PATCH  /api/slots/:id            → تعديل فترة
DELETE /api/slots/:id            → حذف فترة
GET    /api/slots/available      → الفترات المتاحة لتاريخ معين
```

### الأسئلة الشائعة
```
GET    /api/faqs                 → قائمة الأسئلة
POST   /api/faqs                 → إضافة سؤال
PUT    /api/faqs/:id             → تعديل سؤال
DELETE /api/faqs/:id             → حذف سؤال
```

### الرسائل الجماعية
```
GET    /api/broadcasts           → قائمة الحملات
POST   /api/broadcasts           → إنشاء حملة
POST   /api/broadcasts/:id/send  → إرسال (نافذة 24 ساعة)
GET    /api/broadcasts/image/:id → عرض صورة البث
DELETE /api/broadcasts/:id       → حذف
```

### جهات الاتصال
```
GET    /api/leads                → قائمة العملاء
PATCH  /api/leads/:id            → تعديل
DELETE /api/leads/:id            → حذف
GET    /api/leads/export         → تصدير CSV
```

### Facebook
```
GET    /api/fb-settings          → بيانات الاعتماد
POST   /api/fb-settings          → حفظ البيانات
GET    /api/fb-settings/test     → اختبار الاتصال
GET    /api/webhook              → التحقق من Webhook
POST   /api/webhook              → استقبال الرسائل والتعليقات
```

### الإحصاءات
```
GET    /api/stats                → كل إحصاءات الداشبورد
GET    /api/conversions          → إحصاءات التحويلات
GET    /api/reliability          → أداء مزودي AI
GET    /api/providers/stats      → إحصاءات تفصيلية للمزودين
```

### الاشتراك
```
GET    /api/subscription/plans   → الخطط
GET    /api/subscription/current → الخطة الحالية + الاستهلاك
PATCH  /api/subscription/current → تغيير الخطة
```

### الطلبات المسبقة
```
GET    /api/pre-orders               → قائمة الطلبات المسبقة
GET    /api/pre-orders/:id           → تفاصيل طلب
PATCH  /api/pre-orders/:id/status    → تحديث الحالة
DELETE /api/pre-orders/:id           → حذف
```

### متنوع
```
GET    /api/healthz                  → فحص صحة الخادم
GET    /api/domain-templates         → قوالب المجالات
GET    /api/domain-templates/:id     → قالب محدد
POST   /api/domain-templates/:id/apply → تطبيق قالب
GET    /api/notifications/stream     → إشعارات SSE
GET    /api/comments                 → سجل التعليقات
GET    /api/comments/stats           → إحصاءات التعليقات
```

---

## منطق الذكاء الاصطناعي

### الملف الرئيسي: `artifacts/api-server/src/lib/ai.ts`

#### `buildSystemPrompt()` — بناء System Prompt
تبني التعليمات التي تُعطى للـ AI قبل كل رسالة:
- اسم البوت وشخصيته
- قائمة المنتجات وأسعارها (أول 300 حرف لكل منتج)
- الأسئلة الشائعة المفعّلة
- ساعات العمل المتاحة اليوم
- قواعد الموضوعات المسموح بها
- معلومات النشاط التجاري (pageDescription، pageFacebookUrl)

#### `callAI()` — استدعاء مزوّد AI
- Load Balancing بين المزودين النشطين
- Failover تلقائي عند الفشل
- تسجيل الأداء في `provider_usage_log`

#### `transcribeOrDescribeAttachment()` — معالجة المرفقات
نظام Fallback ثنائي:
1. **المرحلة 1**: Gemini AI Studio (API Key مباشر)
2. **المرحلة 2** (عند فشل Gemini أو غيابه):
   - Vertex AI → `callVertexAiMultimodal()` (يدعم صوت + صور)
   - OpenAI-compatible → vision URL (للصور فقط)

#### `analyzeImageWithActiveProvider()` — تحليل الصور
- يدعم Vertex AI (`rawTypeKey === "vertexai"`) بـ inlineData format
- يدعم Anthropic بـ base64 format
- يدعم OpenAI-compatible بـ vision URL

---

## Vertex AI — الإعداد والاستخدام

### كيفية الإضافة في لوحة التحكم

1. اذهب إلى صفحة `/providers`
2. اضغط "إضافة مزوّد"
3. اختر **Vertex AI** من القائمة
4. أدخل:
   - **Project ID | Location**: مثل `my-project|us-central1`
   - **API Key (Service Account JSON)**: محتوى ملف JSON كاملاً
   - **Model**: مثل `gemini-2.5-flash`

### الملف: `artifacts/api-server/src/lib/vertexAi.ts`

```typescript
// استدعاء نصي عادي
callVertexAi(config, messages, systemPrompt, media?)

// استدعاء multimodal (صورة/صوت)
callVertexAiMultimodal(config, prompt, mediaBase64, mimeType, timeoutMs?)

// اختبار الاتصال
testVertexConnection(config) → { success: boolean, details: string }

// تحليل إعدادات DB
parseVertexConfig(apiKey, baseUrl, modelName) → VertexAiConfig
```

### اتفاقية DB
| حقل DB | المحتوى |
|--------|---------|
| `provider.apiKey` | serviceAccountJson (JSON كاملاً) |
| `provider.baseUrl` | `"projectId\|location"` مفصول بـ `\|` |
| `provider.modelName` | اسم النموذج (مثل `gemini-2.5-flash`) |

---

## Facebook Webhook — كيف يعمل

### تدفق معالجة الرسائل

```
رسالة تصل من Messenger
         ↓
1. IP Rate Limit (120 req/min)
         ↓
2. Signature Verification (HMAC-SHA256)
         ↓
3. Replay Attack Check (أعمر من 10 دقائق → رفض)
         ↓
4. هل مرفق (صورة/صوت/فيديو)؟
   نعم → transcribeOrDescribeAttachment() → fallback مزدوج
         ↓
5. Idempotency Guard (mid مكرر → تجاهل)
         ↓
6. Text Rate Limit (30 msg/min/sender)
         ↓
7. هل المحادثة موقوفة؟ نعم → تجاهل
         ↓
8. هل خارج ساعات العمل؟ نعم → رسالة خارج الدوام
         ↓
9. Exact Match Cache → رد فوري إن وُجد
         ↓
10. يُرسل للـ AI مع System Prompt الكامل
         ↓
11. يُحلّل رد AI:
    - browse_catalog → كاروسيل المنتجات
    - start_order → تدفق الطلب
    - book_appointment → حجز موعد
         ↓
12. يُرسل الرد عبر Facebook Graph API
```

### تدفق تصفح الكاتالوج

```
العميل: "ما هي المنتجات المتاحة؟"
         ↓
AI: {"action":"browse_catalog"}
         ↓
Webhook → sendCatalogCategoryMenu()
         ↓
أزرار Quick Reply للفئات
         ↓
العميل يختار فئة → sendCatalogPage()
         ↓
كاروسيل المنتجات
   ├── مخزون > 0 → "اطلب الآن" → طلب عادي
   └── مخزون = 0 → "طلب مسبق" → pre_order
```

---

## متغيرات البيئة

انسخ `.env.example` إلى `.env` وعدّل القيم:

```bash
cp .env.example .env
```

| المتغير | الإلزامية | الوصف | القيمة الافتراضية |
|---|---|---|---|
| `DATABASE_URL` | ✅ إلزامي | رابط PostgreSQL | — |
| `PORT` | ✅ إلزامي | منفذ API server | `8080` |
| `BASE_PATH` | ✅ إلزامي | مسار dashboard | `/` |
| `ENCRYPTION_KEY` | ✅ إلزامي | AES-256 key (≥32 حرف) | — |
| `JWT_SECRET` | ⚠️ مهم | مفتاح JWT | سيُولَّد عشوائياً |
| `ADMIN_USERNAME` | 🔒 أمني | اسم المدير | `admin` |
| `ADMIN_PASSWORD` | 🔒 أمني | كلمة المرور | `admin123` |
| `APP_URL` | ✅ في الإنتاج | رابط التطبيق | — |
| `ALLOWED_ORIGINS` | 🟡 اختياري | CORS origins إضافية | — |
| `REDIS_URL` | 🟡 موصى به | Redis للـ cache الدائم | in-memory fallback |
| `VITE_API_URL` | 🟡 اختياري | رابط API للـ dashboard | `window.location.origin` |

### توليد قيم آمنة
```bash
# ENCRYPTION_KEY (32+ bytes)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# JWT_SECRET (64 bytes)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## أوامر التشغيل والبناء

### التطوير
```bash
# تثبيت الاعتماديات
pnpm install

# رفع مخطط DB
pnpm --filter @workspace/db run push

# تشغيل API server
PORT=8080 BASE_PATH=/api pnpm --filter @workspace/api-server run dev

# تشغيل Dashboard
PORT=3000 BASE_PATH=/ pnpm --filter @workspace/dashboard run dev

# تشغيل الكل دفعة واحدة
pnpm run dev
```

### قاعدة البيانات
```bash
# رفع المخطط
pnpm --filter @workspace/db run push

# إنشاء migration
pnpm --filter @workspace/db run generate

# تشغيل migrations
pnpm --filter @workspace/db run migrate

# Drizzle Studio (واجهة بصرية)
pnpm --filter @workspace/db run studio
```

### API Codegen (بعد تعديل OpenAPI spec)
```bash
pnpm --filter @workspace/api-spec run codegen
```

### TypeScript Check
```bash
pnpm --filter @workspace/api-server tsc --noEmit
pnpm --filter @workspace/dashboard tsc --noEmit
```

### بناء للإنتاج
```bash
# API
pnpm --filter @workspace/api-server run build

# Dashboard
pnpm --filter @workspace/dashboard run build
```

---

## بيانات الدخول الافتراضية

| البيانات | القيمة |
|----------|--------|
| اسم المستخدم | `admin` (أو قيمة `ADMIN_USERNAME`) |
| كلمة المرور | قيمة `ADMIN_PASSWORD` — إذا غابت: تُولَّد عشوائياً وتُطبَع في logs مرة واحدة |

> ⚠️ **هام**: اضبط `ADMIN_PASSWORD` كمتغير بيئة قبل أول تشغيل لتتجنب فقدان كلمة المرور. إذا فاتتك، يمكن إعادة تعيينها مباشرةً من قاعدة البيانات.

---

## سجل التحديثات الأخيرة

### v2.7 — أبريل 2026
- ✅ **نظام مجلدات المنتجات**: جدول `product_folders` + حقل `folderId` في المنتجات + tabs تصفية + وضع تحديد متعدد (checkboxes) + bulk-assign + dialog إدارة المجلدات
- ✅ **إصلاح البث الجماعي مع الصور**: استبدال URL-based send بـ multipart مباشر (`sendFbImageFromDataUrl`) — فشل الصورة لا يوقف الرسالة النصية
- ✅ **تصحيح أسماء الولايات**: id=16 "الجزائر العاصمة"، id=64 "بئر العاتر"، id=69 "العريشة" في `ALGERIA_WILAYAS` وقاعدة البيانات
- ✅ **route جديد**: `productFolders.ts` — CRUD كامل + `PUT /api/product-folders/bulk-assign`

### v2.6 — أبريل 2026
- ✅ **حقل customerCommune**: إضافة البلدية لجداول `orders` و`order_sessions` — AI يجمعها تلقائياً (5 حقول بدلاً من 4)
- ✅ **تصدير Ecotrack**: `GET /api/orders/export` يُصدر `.xlsx` بـ 18 عموداً بصيغة Ecotrack الرسمية
- ✅ **زر التصدير في Orders**: يستخدم `fetch + blob` مع Authorization header لتجنب خطأ 401
- ✅ **إصلاح التعليقات**: رد علني "تم الرد في الخاص 📩" + رد تفصيلي في DM + تجاهل التعليقات الأقدم من 10 دقائق
- ✅ **إصلاح مسار Template في الإنتاج**: `findTemplate()` تجرب 4 مسارات لضمان العثور على القالب في كل بيئة
- ✅ **توضيح كلمة المرور**: تُولَّد عشوائياً عند أول تشغيل إذا غاب `ADMIN_PASSWORD` وتُطبَع في logs مرة واحدة

### v2.5 — أبريل 2026
- ✅ **Vertex AI Multimodal**: دعم كامل للصور والصوت عبر `callVertexAiMultimodal()`
- ✅ **Fallback مزدوج**: `transcribeOrDescribeAttachment()` تجرب Gemini أولاً ثم المزود النشط (Vertex AI / OpenAI)
- ✅ **إصلاح testVertexConnection**: كانت تُرجع `[object Object]` في الـ toast — تم إصلاح استخراج النص
- ✅ **Dark Mode كامل**: 252 لوناً ثابتاً → متغيرات CSS عبر 18 ملف، نظام 3 طبقات

### v2.4 — مارس 2026
- ✅ **Vertex AI**: إضافة مزود Vertex AI الكامل (callVertexAi، parseVertexConfig، testVertexConnection)
- ✅ **إصلاح bug المسافة**: `"vertex ai"` → `.replace(/\s+/g,"")` → `"vertexai"` في ai.ts وproviders.ts

### v2.3
- ✅ **69 ولاية جزائرية**: قاعدة بيانات كاملة لأسعار التوصيل
- ✅ **Idempotency**: منع تكرار معالجة نفس الرسالة بـ `mid`
- ✅ **Hybrid Rate Limiting**: Redis + in-memory fallback

### v2.2
- ✅ **Product Categories**: تصنيفات هرمية (رئيسية + فرعية)
- ✅ **Pre-Orders**: نظام الطلبات المسبقة للمنتجات المنفدة
- ✅ **Reliability Dashboard**: سجل تفصيلي لأداء مزودي AI

### v2.1
- ✅ **Phase 7B Multimodal**: معالجة الصور والصوت والفيديو
- ✅ **AI Context Evaluator**: نظام KEEP/UPDATE/DROP للسياق
- ✅ **Redis Cache**: دعم Redis مع in-memory fallback تلقائي
