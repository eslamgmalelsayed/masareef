// مفتاح الشخص في التحويلات — لازم يطابق LimitEngine.personKey في الجزء الأصلي
export const norm = (s) => String(s || '').toLowerCase().replace(/[\s,،.*\-_]/g, '')
export const personKey = (name) => norm(String(name || '').replace(/[,،]?\s*\d+\s*$/, '')).slice(0, 24)
