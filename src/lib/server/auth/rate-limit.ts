/**
 * In-memory fixed-window limiter for login/sign-up attempts. Adequate for a single app instance;
 * swap for a shared store if the app is ever scaled horizontally. Key by IP *and* email so one
 * attacker can't lock a victim out by hammering their address from elsewhere.
 */
export class RateLimiter {
	/** Insertion-ordered, so the first entries are the oldest windows. */
	private hits = new Map<string, { count: number; resetAt: number }>();

	constructor(
		private readonly max: number,
		private readonly windowMs: number,
		private readonly maxKeys = 10_000
	) {}

	/** Records an attempt; returns false when the key is over its limit. */
	attempt(key: string, now = Date.now()): boolean {
		const entry = this.hits.get(key);
		if (!entry || now >= entry.resetAt) {
			this.hits.delete(key);
			if (this.hits.size >= this.maxKeys) this.evict(now);
			this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
			return true;
		}
		entry.count++;
		return entry.count <= this.max;
	}

	reset(key: string): void {
		this.hits.delete(key);
	}

	get size(): number {
		return this.hits.size;
	}

	/** Drops expired windows; if that frees nothing, drops the oldest tenth so memory stays bounded. */
	private evict(now: number): void {
		for (const [key, entry] of this.hits) if (now >= entry.resetAt) this.hits.delete(key);
		if (this.hits.size < this.maxKeys) return;
		let drop = Math.ceil(this.maxKeys / 10);
		for (const key of this.hits.keys()) {
			if (drop-- <= 0) break;
			this.hits.delete(key);
		}
	}
}

export const loginLimiter = new RateLimiter(10, 15 * 60_000);
export const signupLimiter = new RateLimiter(5, 60 * 60_000);
