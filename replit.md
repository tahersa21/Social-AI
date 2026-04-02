# مساعد الصفحة الذكي — Facebook AI Agent

## Overview
مشروع متكامل من طرف لطرف (Full-Stack) للوحة تحكم ثنائية اللغة (عربي/إنجليزي) بدعم RTL كامل، مصمّم لأتمتة التفاعلات على Facebook Messenger وتعليقات المنشورات. يعتمد على نظام ذكاء اصطناعي متعدد المزودين قابل للضبط للرد التلقائي، وإدارة استفسارات العملاء، وتبسيط عمليات المبيعات.

---

## User Preferences
- أُفضّل التطوير التدريجي.
- يُرجى الاستفسار قبل إجراء تغييرات معمارية كبرى أو إدخال تبعيات خارجية جديدة.
- أُفضّل الشرح التفصيلي للمنطق المعقد أو قرارات التصميم.
- أُفضّل لغة بسيطة وواضحة في التواصل.
- لا تُعدّل `artifacts/api-server/src/lib/ai.ts` بدون نقاش مسبق.
- لا تُعدّل `lib/db/src/schema/index.ts` بدون نقاش مسبق.

---

## System Architecture

**التقنيات المستخدمة:**
- **Monorepo**: pnpm workspaces
- **Node.js**: v24
- **TypeScript**: v5.9
- **API Framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod v4 + drizzle-zod
- **API Codegen**: Orval (React Query hooks + Zod schemas من OpenAPI)
- **Frontend**: React, Vite, TailwindCSS v4, shadcn/ui, Recharts, Framer Motion
- **Auth**: JWT (jsonwebtoken) + bcrypt
- **Build**: esbuild للـ API، Vite للـ dashboard

**هيكل المشروع:**
- `artifacts/api-server/` — Express 5 API (يخدم على `/api`)
- `artifacts/dashboard/` — React + Vite dashboard (يخدم على `/`)
- `lib/api-spec/` — OpenAPI 3.1 spec + Orval config
- `lib/api-client-react/` — Generated React Query hooks
- `lib/api-zod/` — Generated Zod schemas
- `lib/db/` — Drizzle ORM schema + database connection

**التوجيه:**
- مسارات API تعمل تحت `/api/*`
- Dashboard يعالج كل المسارات الأخرى `/*`

**التصميم:**
- تخطيط RTL كامل (يمين لليسار)
- خط Noto Kufi Arabic
- مكونات shadcn/ui
- تحريكات Framer Motion

---

## Core Features & Implementations

### 1. نظام المصادقة (Authentication)
- JWT مخزّن في `localStorage` كـ `fb_agent_token`
- `fetchWithAuth.ts` يُضيف التوكن تلقائياً لكل طلب (override لـ `window.fetch`)
- JWT_SECRET عشوائي عند كل إعادة تشغيل → يجب إعادة تسجيل الدخول
- بيانات الدخول الافتراضية: `admin` / `admin123`
- Middleware لحماية جميع مسارات الـ API

### 2. نظام الذكاء الاصطناعي متعدد المزودين
- مزودون مدعومون: **OpenAI، Anthropic، DeepSeek، Groq، OpenRouter، Orbit، Custom**
- أولويات قابلة للضبط مع Failover وLoad Balancing تلقائي
- `buildSystemPrompt()` يبني Prompt ديناميكياً من: إعدادات الذكاء، المنتجات، FAQ، نطاقات العمل
- معالجة أخطاء 429 (Rate Limit) مع إعادة المحاولة عند المزود التالي
- صفحة `/providers` لإدارة المزودين بالكامل من الواجهة

### 3. معالجة الرسائل المتعددة الوسائط (Multimodal) — مُعاد تصميمه
**المنطق الجديد (Phase 7B):**
- **صوت (Audio):** يُرسَل إلى Gemini للنسخ النصي الدقيق → النص يدخل pipeline الذكاء الطبيعي كاملاً
- **صورة (Image):** يُرسَل إلى Gemini لوصفها بالعربية → `[صورة]: <الوصف>` يدخل pipeline الذكاء
- **فيديو (Video):** نفس معالجة الصورة
- **فائدة:** الـ AI يكتشف النية طبيعياً (طلب، موعد، سؤال، تحية...) بدلاً من البحث المباشر عن المنتج فقط
- حد 15MB للمرفقات (تُتجاهل ما فوق ذلك)
- رسائل خطأ واضحة إذا فشل التحويل
- إشعار لوحة التحكم يُرسَل مرة واحدة فقط لكل مرفق
- `transcribeOrDescribeAttachment()` في `ai.ts` تتولى كل هذا المنطق

### 4. فهرس المنتجات (Product Catalog)
- CRUD كامل للمنتجات مع صور ومخزون وإمكانية Pre-order
- **نظام التصنيفات الهرمية الجديد:**
  - جدول `productCategoriesTable` (id, name, parentId, createdAt)
  - دعم تصنيفات رئيسية وفرعية (parent/child)
  - مسار API: `/api/product-categories`
  - زر "إدارة التصنيفات" في صفحة المنتجات
  - اختيار متعدد للتصنيفات عند إضافة/تعديل منتج
  - التصنيفات تُخزَّن كأسماء مفصولة بفواصل في عمود `category`

### 5. نظام المواعيد (Appointments)
- حجز مواعيد مع خانات زمنية قابلة للضبط
- حد أقصى للحجوزات في اليوم الواحد
- تتبع الحالة: معلق، مؤكد، ملغى، مكتمل
- تكامل كامل مع مسار المحادثة

### 6. إدارة الطلبات (Orders) + التوصيل
- **تدفق الطلب الكامل (Phase 8):**
  - حلقة جمع البيانات (الاسم، العنوان، الهاتف)
  - عرض خيارات التوصيل بعد اكتمال البيانات (إذا كان `deliveryEnabled` مفعّلاً)
  - `sendDeliveryOptions()` تعرض أسعار المنزل/المكتب بالـ Quick Replies حسب الولاية
  - Handlers لـ `DELIVERY_HOME`، `DELIVERY_OFFICE`، `CHANGE_DELIVERY`
  - `CONFIRM_ORDER` يحفظ `deliveryType` + `deliveryPrice` في `ordersTable`
  - يُحتسب سعر التوصيل في المجموع الكلي ورسالة التأكيد

### 7. أسعار التوصيل لكل ولاية (Delivery Pricing)
- **69 ولاية جزائرية** مُدرجة بأسماء عربية وإنجليزية
- جدول `deliveryPricesTable`: سعر منزلي + سعر مكتبي لكل ولاية
- ولايات IDs 1-69 قياسية (غير قابلة للحذف)
- ولايات IDs ≥ 70 مخصصة (قابلة للحذف)
- صفحة `/delivery` لإدارة الأسعار من الواجهة

### 8. البث الجماعي (Broadcasts)
- حملات رسائل جماعية مع فلاتر استهداف: الكل، ذوو المواعيد، بالتسمية
- تطبيق نافذة 24 ساعة لـ Messenger
- جدولة البث بوقت محدد

### 9. العملاء المحتملون (Leads)
- التقاط تلقائي لمعلومات التواصل (هاتف/إيميل) من الرسائل
- تصدير CSV
- ربط تلقائي بالمحادثات

### 10. الأسئلة الشائعة (FAQ)
- CRUD للأسئلة والأجوبة
- يُضاف محتوى FAQ تلقائياً في System Prompt
- الـ AI يجيب من FAQ أولاً قبل الإنترنت

### 11. إدارة المحادثات
- عرض مزدوج (قائمة + Chat view)
- إيقاف/استئناف الـ AI لكل محادثة
- تسمية العملاء (labels)
- تحليل المشاعر (Sentiment Analysis)
- ملاحظات المشغل

### 12. لوحة التحليلات (Analytics Dashboard)
- بطاقات إحصائية: محادثات اليوم، رسائل اليوم، الطلبات المعلقة، المواعيد القادمة
- مقياس "المحادثات اليومية" — يُحسب كمحادثات فريدة بدأت خلال آخر 24 ساعة
- مخطط ساعات الذروة
- إصلاح ساعات العمل: يدعم الأوقات التي تتخطى منتصف الليل

### 13. Catalog Browser (Phase 6)
- الـ AI يُصدر `{"action":"browse_catalog"}` ← يُعترض في الـ webhook
- يعرض أزرار Quick Reply للفئات وعروض المنتجات (Generic Template)
- أزرار المخزون الذكية + تكامل Pre-order

### 14. Product Intelligence (Phase 7A)
- جدول `user_product_context` يتتبع المنتج الأخير لكل مستخدم
- الـ AI يُجيب على أسئلة المقارنة والملاءمة والقيمة
- اقتراح بدائل مشابهة

### 15. إعدادات الصفحة والنظام
- صفحة `/settings` للإعدادات الكاملة (Page Access Token، Welcome Message، Working Hours...)
- صفحة `/providers` لإدارة مزودي الذكاء الاصطناعي
- Human Handoff مع منطق توقف/إعادة تفعيل الذكاء تلقائياً
- Kill Switch لإيقاف الـ AI كلياً

### 16. Quick Replies
- أزرار ردود سريعة قابلة للضبط من الواجهة
- تُرسَل ضمن رسائل الـ Messenger

### 17. التصنيفات المخصصة (Topic Guardrails)
- ضبط النطاقات التي يتحدث عنها الـ AI
- Domain Templates جاهزة (أزياء، طعام، عقارات...)

---

## Database Tables
| الجدول | الوصف |
|--------|--------|
| `fb_settings` | إعدادات الصفحة والتكامل |
| `ai_config` | إعدادات الذكاء الاصطناعي والـ System Prompt |
| `ai_providers` | مزودو الذكاء الاصطناعي وأولوياتهم |
| `products` | كتالوج المنتجات |
| `product_categories` | تصنيفات المنتجات الهرمية |
| `conversations` | سجل المحادثات الكامل |
| `conversation_sessions` | جلسات المحادثة النشطة |
| `orders` | الطلبات المكتملة |
| `order_sessions` | جلسات جمع بيانات الطلب |
| `appointments` | المواعيد |
| `available_slots` | الخانات الزمنية المتاحة |
| `leads` | العملاء المحتملون |
| `faqs` | الأسئلة الشائعة |
| `delivery_prices` | أسعار التوصيل لكل ولاية |
| `comments_log` | تعليقات المنشورات |
| `platform_events` | أحداث النظام للتتبع والتشخيص |
| `user_product_context` | آخر منتج تفاعل معه كل مستخدم |
| `pre_orders` | الطلبات المسبقة |
| `pre_order_sessions` | جلسات الطلب المسبق |
| `product_inquiries` | استفسارات المنتجات |
| `broadcasts` | حملات البث الجماعي |
| `admins` | حسابات المشرفين |
| `subscription_plans` | خطط الاشتراك |

---

## External Dependencies
- **Facebook Graph API** — إرسال الرسائل، الـ Webhooks، التفاعل مع الصفحات
- **PostgreSQL** — قاعدة البيانات الرئيسية
- **Gemini API** — معالجة الوسائط المتعددة (نسخ الصوت، وصف الصور/الفيديو)
- **مزودو الذكاء الاصطناعي:**
  - OpenAI
  - Anthropic
  - DeepSeek
  - Groq
  - OpenRouter
  - Orbit
  - Custom (قابل للضبط)

---

## Important Implementation Notes
- **Sidebar**: يستخدم `inline styles` وليس Tailwind responsive classes — ضروري للحفاظ عليه
- **Route registration**: المسارات الجديدة تحتاج إعادة تشغيل السيرفر
- **Workflow الحقيقي**: `artifacts/api-server: API Server` يخدم على port 8080
- **JWT**: يُولَّد عشوائياً عند كل restart → المستخدمون يحتاجون إعادة تسجيل الدخول
- **attLabel في Phase 7B**: متغيرات المرفق (`attLabel`, `attType`, `attUrl`, `attSenderId`) موجودة في نفس النطاق مع `transcribeOrDescribeAttachment`
