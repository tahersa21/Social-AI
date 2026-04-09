interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class TtlCache {
  private store = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  del(key: string): void {
    this.store.delete(key);
  }

  delByPrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  size(): number {
    return this.store.size;
  }
}

export const cache = new TtlCache();

export const TTL = {
  // بيانات ثابتة تتغير فقط من لوحة التحكم — Cache دائم عملياً (سنة كاملة)
  SETTINGS:  365 * 24 * 60 * 60 * 1000,
  CONFIG:    365 * 24 * 60 * 60 * 1000,
  FAQS:      365 * 24 * 60 * 60 * 1000,

  // منتجات: شبكة أمان 30 دقيقة + invalidation فوري عند التعديل
  PRODUCTS:  30 * 60 * 1000,

  // اسم مستخدم فيسبوك: 30 دقيقة
  FB_USER:   30 * 60 * 1000,

  // المواعيد ومزودو AI: لا cache — استعلام مباشر دائماً
  // (لا توجد قيم هنا — يُستعلم مباشرة من DB)
} as const;
