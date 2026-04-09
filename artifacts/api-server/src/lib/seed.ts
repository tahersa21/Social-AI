import { db, aiConfigTable, aiProvidersTable, productsTable, fbSettingsTable, adminUsersTable, faqsTable, availableSlotsTable, subscriptionPlansTable, subscriptionUsageTable, domainTemplatesTable, leadsTable, broadcastTemplatesTable, deliveryPricesTable } from "@workspace/db";
import { count, eq, and } from "drizzle-orm";
import bcrypt from "bcrypt";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const PROVIDERS = [
  { name: "Anthropic", providerType: "anthropic", apiKey: "", baseUrl: "https://api.anthropic.com", modelName: "claude-haiku-4-5" },
  { name: "OpenAI", providerType: "openai", apiKey: "", baseUrl: "https://api.openai.com", modelName: "gpt-4o-mini" },
  { name: "DeepSeek", providerType: "deepseek", apiKey: "", baseUrl: "https://api.deepseek.com", modelName: "deepseek-chat" },
  { name: "Groq", providerType: "groq", apiKey: "", baseUrl: "https://api.groq.com/openai", modelName: "llama-3.3-70b-versatile" },
  { name: "OpenRouter", providerType: "openrouter", apiKey: "", baseUrl: "https://openrouter.ai/api", modelName: "openai/gpt-4o-mini" },
  { name: "Orbit", providerType: "orbit", apiKey: "", baseUrl: "https://api.orbit-provider.com/api/provider/agy", modelName: "claude-sonnet-4-6" },
  { name: "AgentRouter", providerType: "agentrouter", apiKey: "", baseUrl: "https://agentrouter.org", modelName: "claude-sonnet-4-5-20250514" },
  { name: "Google Gemini", providerType: "gemini", apiKey: "", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", modelName: "gemini-2.0-flash" },
];

const DEFAULT_FAQS = [
  { question: "ما هي ساعات العمل؟", answer: "نعمل من الساعة 9:00 صباحاً حتى 10:00 مساءً من السبت إلى الخميس.", category: "عام" },
  { question: "كيف يمكنني تقديم طلب؟", answer: "يمكنك إرسال رسالة لنا عبر الصفحة وسيقوم المساعد الذكي بمساعدتك في إتمام طلبك.", category: "طلبات" },
  { question: "هل يوجد توصيل؟", answer: "نعم، نوفر خدمة التوصيل. تختلف رسوم التوصيل حسب الموقع. راسلنا لمزيد من التفاصيل.", category: "توصيل" },
];

const DEFAULT_SLOTS = [
  { dayOfWeek: 1, timeSlot: "09:00" }, { dayOfWeek: 1, timeSlot: "11:00" }, { dayOfWeek: 1, timeSlot: "14:00" }, { dayOfWeek: 1, timeSlot: "16:00" },
  { dayOfWeek: 2, timeSlot: "09:00" }, { dayOfWeek: 2, timeSlot: "11:00" }, { dayOfWeek: 2, timeSlot: "14:00" }, { dayOfWeek: 2, timeSlot: "16:00" },
  { dayOfWeek: 3, timeSlot: "09:00" }, { dayOfWeek: 3, timeSlot: "11:00" }, { dayOfWeek: 3, timeSlot: "14:00" }, { dayOfWeek: 3, timeSlot: "16:00" },
  { dayOfWeek: 4, timeSlot: "09:00" }, { dayOfWeek: 4, timeSlot: "11:00" }, { dayOfWeek: 4, timeSlot: "14:00" }, { dayOfWeek: 4, timeSlot: "16:00" },
  { dayOfWeek: 5, timeSlot: "09:00" }, { dayOfWeek: 5, timeSlot: "11:00" }, { dayOfWeek: 5, timeSlot: "14:00" }, { dayOfWeek: 5, timeSlot: "16:00" },
];

const SUBSCRIPTION_PLANS = [
  {
    name: "free",
    displayName: "المجانية / Free",
    priceDzd: 0,
    aiConversationsLimit: 30,
    productsLimit: 10,
    providersLimit: 1,
    broadcastLimit: 0,
    appointmentsEnabled: 0,
    leadsEnabled: 0,
    analyticsAdvanced: 0,
    multiPage: 0,
  },
  {
    name: "starter",
    displayName: "المبتدئة / Starter",
    priceDzd: 2900,
    aiConversationsLimit: 300,
    productsLimit: 50,
    providersLimit: 3,
    broadcastLimit: 500,
    appointmentsEnabled: 1,
    leadsEnabled: 1,
    analyticsAdvanced: 0,
    multiPage: 0,
  },
  {
    name: "pro",
    displayName: "الاحترافية / Pro",
    priceDzd: 6900,
    aiConversationsLimit: 1000,
    productsLimit: -1,
    providersLimit: 6,
    broadcastLimit: -1,
    appointmentsEnabled: 1,
    leadsEnabled: 1,
    analyticsAdvanced: 1,
    multiPage: 0,
  },
  {
    name: "agency",
    displayName: "الوكالات / Agency",
    priceDzd: 14900,
    aiConversationsLimit: -1,
    productsLimit: -1,
    providersLimit: 6,
    broadcastLimit: -1,
    appointmentsEnabled: 1,
    leadsEnabled: 1,
    analyticsAdvanced: 1,
    multiPage: 1,
  },
];

const DOMAIN_TEMPLATES = [
  {
    domain: "phones",
    templateName: "متجر الهواتف والإكسسوارات",
    botName: "مساعد موبايل برو",
    personality: "أنا مساعد متخصص في الهواتف الذكية والإكسسوارات. أقدم معلومات دقيقة عن المواصفات والأسعار وأساعد العملاء في اختيار الهاتف المناسب لاحتياجاتهم وميزانيتهم. أتحدث بلغة تقنية مبسطة وودية، وأهتم بتقديم أفضل العروض المتاحة.",
    greetingMessage: "مرحباً بك في متجر الهواتف! 📱 هل تبحث عن هاتف جديد أو إكسسوار معين؟ أنا هنا لمساعدتك في اختيار أفضل ما يناسبك.",
    sampleFaqs: JSON.stringify([
      { question: "هل تبيعون هواتف أصلية مضمونة؟", answer: "نعم، جميع هواتفنا أصلية 100% مع ضمان المصنع لمدة سنة كاملة." },
      { question: "هل يوجد خدمة استبدال الهاتف القديم؟", answer: "نعم، نقبل استبدال هاتفك القديم بخصم على شراء هاتف جديد. أرسل لنا صور الهاتف لتقييمه." },
      { question: "ما هي طرق الدفع المتاحة؟", answer: "نقبل الدفع نقداً، بطاقة بريدية CIB، أو تحويل بنكي. يمكن الدفع بالتقسيط أيضاً." },
    ]),
    sampleProducts: JSON.stringify([
      { name: "Samsung Galaxy A55", price: 89000, description: "هاتف سامسونج A55 - شاشة AMOLED 6.6 بوصة، كاميرا 50MP، بطارية 5000mAh" },
      { name: "iPhone 14 - 128GB", price: 145000, description: "أيفون 14 أصلي مضمون - شاشة Super Retina XDR، كاميرا 12MP، شريحة A15 Bionic" },
    ]),
  },
  {
    domain: "restaurant",
    templateName: "المطعم والمأكولات",
    botName: "مساعد المطعم",
    personality: "أنا مساعد مطعمنا الودود والمحبوب! أساعدك في الاطلاع على قائمة الطعام، معرفة المكونات والأسعار، وإتمام طلبك بسهولة. أهتم بتجربتك وأسعى لتقديم أفضل خدمة. أتحدث بحماس عن أكلاتنا اللذيذة المحضرة بمكونات طازجة يومياً.",
    greetingMessage: "أهلاً وسهلاً! 🍽️ مرحباً بك في مطعمنا. هل تريد الاطلاع على قائمة الطعام أو تقديم طلب الآن؟ يسعدنا خدمتك!",
    sampleFaqs: JSON.stringify([
      { question: "هل تتوفر خدمة التوصيل؟", answer: "نعم! نوصل لجميع أحياء المدينة. رسوم التوصيل 200 دج، ومجاني للطلبات فوق 1500 دج." },
      { question: "هل يمكن تخصيص الطلب حسب الحمية الغذائية؟", answer: "بالتأكيد! يمكننا تحضير وجباتك بدون ملح زائد، أو بدون غلوتين، أو نباتية. فقط أخبرنا باحتياجاتك." },
      { question: "ما هو وقت التسليم؟", answer: "نسلم خلال 30-45 دقيقة داخل المدينة. وقت التحضير 20 دقيقة لمعظم الأطباق." },
    ]),
    sampleProducts: JSON.stringify([
      { name: "برغر كلاسيك مع بطاطس", price: 850, description: "برغر لحم طازج 200غ مع خس، طماطم، جبن، صلصة منزلية + بطاطس مقلية" },
      { name: "بيتزا مارغريتا 30cm", price: 1200, description: "بيتزا إيطالية بعجينة طازجة، صلصة طماطم، جبن موزاريلا وريحان طازج" },
    ]),
  },
  {
    domain: "salon",
    templateName: "صالون التجميل",
    botName: "مساعد الصالون",
    personality: "أنا مساعد صالون التجميل المتخصص والأنيق. أساعدك في الاستفسار عن خدماتنا، الأسعار، ومواعيد الحجز. أتحدث بلغة لطيفة وأنيقة تعكس أسلوب صالوننا الراقي. أهتم بتقديم نصائح الجمال المناسبة وأساعدك في اختيار الخدمة الأنسب لك.",
    greetingMessage: "مرحباً بك في صالون التجميل ✨ هل تودين حجز موعد أو الاستفسار عن خدماتنا؟ أنا هنا لمساعدتك!",
    sampleFaqs: JSON.stringify([
      { question: "هل يمكن الحجز مسبقاً؟", answer: "نعم، ننصح بالحجز المسبق لضمان حصولك على الموعد المناسب. يمكنك الحجز عبر الرسائل أو الاتصال بنا." },
      { question: "هل تستخدمون منتجات عالمية؟", answer: "نعم، نستخدم منتجات عالمية مرخصة مثل L'Oréal وKeratin Complex للحصول على أفضل النتائج." },
      { question: "ما هي مدة جلسة الكيراتين؟", answer: "جلسة الكيراتين تستغرق من 2 إلى 3 ساعات حسب طول الشعر وكثافته." },
    ]),
    sampleProducts: JSON.stringify([
      { name: "جلسة كيراتين برازيلي", price: 4500, description: "علاج الكيراتين البرازيلي الأصلي لتنعيم وترطيب الشعر لمدة 3-6 أشهر" },
      { name: "صبغة شعر كاملة", price: 2800, description: "صبغة شعر احترافية بمنتجات L'Oréal، تشمل الغسيل والتجفيف والتصفيف" },
    ]),
  },
  {
    domain: "medical",
    templateName: "العيادة والخدمات الطبية",
    botName: "مساعد العيادة",
    personality: "أنا مساعد العيادة الطبية المتخصص والمحترف. أساعدك في حجز المواعيد، الاستفسار عن الخدمات الطبية والأسعار، وتقديم معلومات عامة مفيدة. أتحدث باحترافية ودقة مع الحرص على الخصوصية التامة. لا أقدم تشخيصات طبية، وأنصح دائماً بزيارة الطبيب للاستشارة المتخصصة.",
    greetingMessage: "مرحباً بك في عيادتنا 🏥 يسعدنا خدمتك. هل تريد حجز موعد أو الاستفسار عن خدماتنا الطبية؟",
    sampleFaqs: JSON.stringify([
      { question: "هل يمكن حجز موعد عاجل؟", answer: "نعم، لدينا مواعيد عاجلة متاحة يومياً. يرجى التواصل معنا مباشرة لمعرفة الأوقات المتاحة." },
      { question: "هل تقبلون التأمين الصحي؟", answer: "نعم، نتعامل مع معظم شركات التأمين الصحي. يرجى إحضار بطاقة التأمين عند زيارتك." },
      { question: "ما هي وثائق التحضير للفحص؟", answer: "يرجى إحضار بطاقة الهوية الوطنية، ونتائج الفحوصات السابقة إن وجدت." },
    ]),
    sampleProducts: JSON.stringify([
      { name: "استشارة طبية عامة", price: 1500, description: "فحص طبي شامل مع استشارة الطبيب العام وتقرير طبي مفصل" },
      { name: "تحاليل دم شاملة", price: 2500, description: "مجموعة تحاليل دم شاملة تشمل CBC، السكر، الكوليسترول، وظائف الكبد والكلى" },
    ]),
  },
  {
    domain: "fashion",
    templateName: "متجر الأزياء والملابس",
    botName: "مساعد الموضة",
    personality: "أنا مساعد متجر الأزياء العصري والأنيق! أشاركك أحدث صيحات الموضة، أساعدك في اختيار الملابس المناسبة لكل مناسبة، وأقدم لك عروض وخصومات حصرية. أتحدث بلغة عصرية وأنيقة، وأهتم بتقديم تجربة تسوق ممتعة ومميزة.",
    greetingMessage: "مرحباً بك في عالم الموضة! 👗✨ اكتشف أحدث تشكيلاتنا وعروضنا الحصرية. كيف يمكنني مساعدتك اليوم؟",
    sampleFaqs: JSON.stringify([
      { question: "هل يمكن الاستبدال أو الإرجاع؟", answer: "نعم، يمكن الاستبدال خلال 7 أيام من تاريخ الشراء مع الحفاظ على القطعة بحالتها الأصلية ووسومها." },
      { question: "هل تتوفر مقاسات كبيرة Plus Size؟", answer: "نعم، لدينا تشكيلة واسعة من المقاسات من S حتى 4XL لجميع القطع." },
      { question: "هل يوجد توصيل للمنزل؟", answer: "نعم، نوصل لجميع ولايات الجزائر خلال 2-5 أيام عمل. التوصيل مجاني فوق 5000 دج." },
    ]),
    sampleProducts: JSON.stringify([
      { name: "فستان سهرة أنيق", price: 7500, description: "فستان سهرة راقي بقماش الساتان، متوفر بألوان متعددة، مقاسات S-3XL" },
      { name: "بدلة رسمية رجالية", price: 12000, description: "بدلة رسمية كلاسيكية بقماش عالي الجودة، تشمل جاكيت وبنطلون وقميص" },
    ]),
  },
  {
    domain: "real_estate",
    templateName: "العقارات والإيجارات",
    botName: "مساعد العقارات",
    personality: "أنا مساعد وكالة العقارات المتخصص والموثوق. أساعدك في البحث عن العقار المناسب للشراء أو الإيجار، أقدم معلومات تفصيلية عن المواقع والأسعار، وأنسق مواعيد المعاينة. أتحدث باحترافية وشفافية تامة، وأسعى لإيجاد أفضل صفقة تناسب احتياجاتك وميزانيتك.",
    greetingMessage: "مرحباً بك في وكالة العقارات! 🏠 هل تبحث عن شراء أو إيجار عقار؟ أخبرني باحتياجاتك وسأساعدك في إيجاد أفضل الخيارات المتاحة.",
    sampleFaqs: JSON.stringify([
      { question: "هل يمكن رؤية العقار قبل التعاقد؟", answer: "بالطبع! نرتب مواعيد معاينة مجانية لجميع عقاراتنا. تواصل معنا لتحديد الموعد المناسب." },
      { question: "ما هي الوثائق المطلوبة للشراء؟", answer: "تحتاج: بطاقة الهوية، كشف حساب بنكي 3 أشهر، شهادة العمل، وعقد البيع يحرره موثق معتمد." },
      { question: "هل تقدمون خدمة إدارة العقارات؟", answer: "نعم، نقدم خدمة إدارة العقارات المؤجرة شاملة: إيجاد المستأجرين، جمع الإيجارات، وصيانة العقار." },
    ]),
    sampleProducts: JSON.stringify([
      { name: "شقة F3 - حيدرة الجزائر", price: 12500000, description: "شقة F3 في حيدرة، 85م², الطابق 3، مطلة على حديقة، قريبة من المواصلات" },
      { name: "فيلا دوبلكس - تيبازة", price: 28000000, description: "فيلا دوبلكس 200م²، 4 غرف، حديقة 150م², كراج، قريبة من البحر" },
    ]),
  },
];

const DEFAULT_BROADCAST_TEMPLATES = [
  {
    name: "عرض خاص",
    category: "offers",
    messageText: "🎉 عرض خاص لفترة محدودة!\n{product_name} بسعر {price} دج فقط\nاطلب الآن قبل نفاد الكمية! ⏳\n{page_name}",
    createdAt: new Date().toISOString(),
  },
  {
    name: "عيد الفطر",
    category: "holidays",
    messageText: "كل عام وأنتم بخير بمناسبة عيد الفطر المبارك 🌙\nنتمنى لكم عيداً سعيداً مع أهلكم وأحبائكم ❤️\n— {page_name}",
    createdAt: new Date().toISOString(),
  },
  {
    name: "عيد الأضحى",
    category: "holidays",
    messageText: "عيد أضحى مبارك وكل عام وأنتم بخير 🐑\n{page_name} يتمنى لكم عيداً سعيداً مباركاً 😊",
    createdAt: new Date().toISOString(),
  },
  {
    name: "إعادة استهداف",
    category: "retargeting",
    messageText: "مرحباً! 👋 لم نرك منذ فترة\nلدينا منتجات جديدة قد تعجبك 😊\nتفضل بزيارتنا وسنسعد بخدمتك\n— {page_name}",
    createdAt: new Date().toISOString(),
  },
  {
    name: "ترحيب بعميل جديد",
    category: "welcome",
    messageText: "🎉 مرحباً بك في {page_name}!\nيسعدنا خدمتك في أي وقت.\nلا تتردد في السؤال عن أي شيء 😊",
    createdAt: new Date().toISOString(),
  },
  {
    name: "تخفيض موسمي",
    category: "offers",
    messageText: "🔥 تخفيضات موسمية الآن!\nوفر على مشترياتك اليوم فقط\nتواصل معنا لمعرفة العروض 📲\n— {page_name}",
    createdAt: new Date().toISOString(),
  },
];

const SAMPLE_LEADS = [
  {
    fbUserId: "sample_lead_001",
    fbUserName: "أحمد بن علي",
    fbProfileUrl: "https://facebook.com/sample1",
    phone: "0551234567",
    email: "ahmed@example.com",
    label: "customer",
    notes: "عميل منتظم، يطلب أسبوعياً",
    source: "messenger",
    lastInteractionAt: new Date().toISOString(),
    totalMessages: 12,
  },
  {
    fbUserId: "sample_lead_002",
    fbUserName: "فاطمة بوزيد",
    fbProfileUrl: "https://facebook.com/sample2",
    phone: "0661234567",
    email: null,
    label: "interested",
    notes: "مهتمة بالمنتجات، تحتاج متابعة",
    source: "messenger",
    lastInteractionAt: new Date().toISOString(),
    totalMessages: 4,
  },
  {
    fbUserId: "sample_lead_003",
    fbUserName: "يوسف خالد",
    fbProfileUrl: "https://facebook.com/sample3",
    phone: null,
    email: "youssef@example.com",
    label: "new",
    notes: "",
    source: "comment",
    lastInteractionAt: new Date().toISOString(),
    totalMessages: 1,
  },
];

const DEFAULT_DELIVERY_PRICES: Record<number, { officePrice: number; homePrice: number }> = {
  1:  { officePrice: 650,  homePrice: 1100 },
  2:  { officePrice: 400,  homePrice: 700  },
  3:  { officePrice: 450,  homePrice: 800  },
  4:  { officePrice: 450,  homePrice: 700  },
  5:  { officePrice: 400,  homePrice: 700  },
  6:  { officePrice: 400,  homePrice: 700  },
  7:  { officePrice: 450,  homePrice: 700  },
  8:  { officePrice: 750,  homePrice: 1000 },
  9:  { officePrice: 300,  homePrice: 500  },
  10: { officePrice: 400,  homePrice: 700  },
  11: { officePrice: 700,  homePrice: 1100 },
  12: { officePrice: 450,  homePrice: 800  },
  13: { officePrice: 450,  homePrice: 700  },
  14: { officePrice: 400,  homePrice: 700  },
  15: { officePrice: 400,  homePrice: 700  },
  16: { officePrice: 250,  homePrice: 400  },
  17: { officePrice: 450,  homePrice: 750  },
  18: { officePrice: 400,  homePrice: 700  },
  19: { officePrice: 350,  homePrice: 700  },
  20: { officePrice: 350,  homePrice: 700  },
  21: { officePrice: 350,  homePrice: 700  },
  22: { officePrice: 400,  homePrice: 700  },
  23: { officePrice: 450,  homePrice: 700  },
  24: { officePrice: 500,  homePrice: 700  },
  25: { officePrice: 400,  homePrice: 700  },
  26: { officePrice: 300,  homePrice: 600  },
  27: { officePrice: 400,  homePrice: 700  },
  28: { officePrice: 350,  homePrice: 700  },
  29: { officePrice: 450,  homePrice: 700  },
  30: { officePrice: 500,  homePrice: 800  },
  31: { officePrice: 400,  homePrice: 700  },
  32: { officePrice: 500,  homePrice: 900  },
  33: { officePrice: 1100, homePrice: 1200 },
  34: { officePrice: 350,  homePrice: 700  },
  35: { officePrice: 300,  homePrice: 600  },
  36: { officePrice: 450,  homePrice: 700  },
  37: { officePrice: 550,  homePrice: 1300 },
  38: { officePrice: 400,  homePrice: 700  },
  39: { officePrice: 550,  homePrice: 700  },
  40: { officePrice: 450,  homePrice: 700  },
  41: { officePrice: 400,  homePrice: 700  },
  42: { officePrice: 400,  homePrice: 600  },
  43: { officePrice: 400,  homePrice: 700  },
  44: { officePrice: 400,  homePrice: 700  },
  45: { officePrice: 650,  homePrice: 900  },
  46: { officePrice: 450,  homePrice: 700  },
  47: { officePrice: 450,  homePrice: 800  },
  48: { officePrice: 400,  homePrice: 700  },
  49: { officePrice: 750,  homePrice: 1000 },
  50: { officePrice: 0,    homePrice: 0    },
  51: { officePrice: 600,  homePrice: 800  },
  52: { officePrice: 700,  homePrice: 1200 },
  53: { officePrice: 1000, homePrice: 1000 },
  54: { officePrice: 0,    homePrice: 0    },
  55: { officePrice: 550,  homePrice: 1100 },
  56: { officePrice: 0,    homePrice: 0    },
  57: { officePrice: 500,  homePrice: 800  },
  58: { officePrice: 700,  homePrice: 1000 },
};

async function ensurePlaceholderImage(): Promise<string> {
  const uploadDir = path.resolve(process.cwd(), "public", "uploads");
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const placeholderPath = path.join(uploadDir, "placeholder.jpg");
  if (!fs.existsSync(placeholderPath)) {
    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
  <rect width="400" height="400" fill="#f3f4f6"/>
  <rect x="150" y="100" width="100" height="80" rx="8" fill="#d1d5db"/>
  <polygon points="200,80 150,140 250,140" fill="#9ca3af"/>
  <text x="200" y="250" font-family="sans-serif" font-size="18" fill="#6b7280" text-anchor="middle">منتج تجريبي</text>
  <text x="200" y="280" font-family="sans-serif" font-size="14" fill="#9ca3af" text-anchor="middle">Test Product</text>
</svg>`;
    fs.writeFileSync(placeholderPath, svgContent);
  }

  return "/public/uploads/placeholder.jpg";
}

export async function runSeed(): Promise<void> {
  try {
    const [adminCount] = await db.select({ value: count() }).from(adminUsersTable);
    if ((adminCount?.value ?? 0) === 0) {
      const adminUser = process.env["ADMIN_USERNAME"] || "admin";
      let adminPass   = process.env["ADMIN_PASSWORD"] ?? "";

      if (!adminPass) {
        adminPass = "admin123";
      }

      const hash = await bcrypt.hash(adminPass, 10);
      await db.insert(adminUsersTable).values({ username: adminUser, passwordHash: hash });
    }

    const [configCount] = await db.select({ value: count() }).from(aiConfigTable);
    if ((configCount?.value ?? 0) === 0) {
      await db.insert(aiConfigTable).values({
        botName: "مساعد المتجر",
        personality: "أنا مساعد ذكي ومفيد لخدمة عملاء المتجر. أتحدث بلغة ودية واحترافية.",
        greetingMessage: "مرحباً! كيف يمكنني مساعدتك اليوم؟ 😊",
        language: "auto",
        respondToOrders: 1,
        replyToComments: 1,
        sendDmOnComment: 1,
        businessCountry: "Algeria",
        businessCity: "",
        businessDomain: "general",
        targetAudience: "all",
        businessHoursStart: "09:00",
        businessHoursEnd: "22:00",
        outsideHoursMessage: "مرحباً! نحن حالياً خارج ساعات العمل (9:00 - 22:00). يرجى التواصل معنا خلال ساعات العمل.",
        currency: "DZD",
        currentPlan: "free",
        leadCaptureEnabled: 0,
        leadCaptureFields: '["phone"]',
        leadCaptureMessage: "يسعدنا خدمتك! هل يمكنك مشاركتنا رقم هاتفك للتواصل؟",
        useQuickReplies: 1,
        updatedAt: new Date(),
      });
      console.log("[seed] Default ai_config inserted");
    }

    const [providerCount] = await db.select({ value: count() }).from(aiProvidersTable);
    if ((providerCount?.value ?? 0) === 0) {
      await db.insert(aiProvidersTable).values(PROVIDERS);
      console.log("[seed] Default providers inserted");
    }

    const [productCount] = await db.select({ value: count() }).from(productsTable);
    if ((productCount?.value ?? 0) === 0) {
      const imgUrl = await ensurePlaceholderImage();
      await db.insert(productsTable).values({
        name: "منتج تجريبي / Test Product",
        description: "هذا منتج تجريبي للعرض. يمكنك تعديله أو حذفه وإضافة منتجاتك الخاصة.",
        originalPrice: 1000,
        discountPrice: 850,
        stockQuantity: 10,
        lowStockThreshold: 3,
        status: "available",
        images: JSON.stringify([imgUrl]),
        mainImageIndex: 0,
      });
      console.log("[seed] Test product inserted");
    }

    const [fbCount] = await db.select({ value: count() }).from(fbSettingsTable);
    if ((fbCount?.value ?? 0) === 0) {
      await db.insert(fbSettingsTable).values({
        pageAccessToken: null,
        verifyToken: null,
        pageId: null,
      });
    }

    const [faqCount] = await db.select({ value: count() }).from(faqsTable);
    if ((faqCount?.value ?? 0) === 0) {
      await db.insert(faqsTable).values(DEFAULT_FAQS);
      console.log("[seed] Default FAQs inserted");
    }

    const [slotCount] = await db.select({ value: count() }).from(availableSlotsTable);
    if ((slotCount?.value ?? 0) === 0) {
      await db.insert(availableSlotsTable).values(DEFAULT_SLOTS);
      console.log("[seed] Default appointment slots inserted");
    }

    const [planCount] = await db.select({ value: count() }).from(subscriptionPlansTable);
    if ((planCount?.value ?? 0) === 0) {
      await db.insert(subscriptionPlansTable).values(SUBSCRIPTION_PLANS);
      console.log("[seed] Subscription plans inserted");
    }

    const now = new Date();
    const monthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const existingUsage = await db
      .select({ value: count() })
      .from(subscriptionUsageTable)
      .where(eq(subscriptionUsageTable.monthYear, monthYear));
    if ((existingUsage[0]?.value ?? 0) === 0) {
      await db.insert(subscriptionUsageTable).values({
        monthYear,
        aiConversationsUsed: 0,
        broadcastSent: 0,
        messagesLimitWarningSent: 0,
        updatedAt: now.toISOString(),
      });
      console.log(`[seed] Subscription usage row inserted for ${monthYear}`);
    }

    const [templateCount] = await db.select({ value: count() }).from(domainTemplatesTable);
    if ((templateCount?.value ?? 0) === 0) {
      await db.insert(domainTemplatesTable).values(DOMAIN_TEMPLATES);
      console.log("[seed] Domain templates inserted");
    }

    const [leadCount] = await db.select({ value: count() }).from(leadsTable);
    if ((leadCount?.value ?? 0) === 0) {
      await db.insert(leadsTable).values(SAMPLE_LEADS);
      console.log("[seed] Sample leads inserted");
    }

    const [btCount] = await db.select({ value: count() }).from(broadcastTemplatesTable);
    if ((btCount?.value ?? 0) === 0) {
      await db.insert(broadcastTemplatesTable).values(DEFAULT_BROADCAST_TEMPLATES);
      console.log("[seed] Default broadcast templates inserted");
    }

    let pricesSeeded = 0;
    for (const [wilayaIdStr, prices] of Object.entries(DEFAULT_DELIVERY_PRICES)) {
      const wilayaId = Number(wilayaIdStr);
      const result = await db
        .update(deliveryPricesTable)
        .set({ officePrice: prices.officePrice, homePrice: prices.homePrice })
        .where(
          and(
            eq(deliveryPricesTable.wilayaId, wilayaId),
            eq(deliveryPricesTable.homePrice, 0),
            eq(deliveryPricesTable.officePrice, 0)
          )
        );
      if ((result.rowCount ?? 0) > 0) pricesSeeded++;
    }
    if (pricesSeeded > 0) console.log(`[seed] Default delivery prices applied to ${pricesSeeded} wilayas`);
  } catch (err) {
    console.error("[seed] Error during seeding:", err);
  }
}
