export class TTLCache {
  constructor(defaultTtlMs = 300000) {
    this.defaultTtlMs = defaultTtlMs;
    this.map = new Map();
  }

  get(key) {
    const item = this.map.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      this.map.delete(key);
      return null;
    }
    return item.value;
  }

  set(key, value, ttlMs = this.defaultTtlMs) {
    this.map.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  has(key) {
    return this.get(key) !== null;
  }
}
