type RateLimitRouteKey =
  | 'demo-sign-in'
  | 'ai-reply'
  | 'ai-case-insights'
  | 'auth-sign-up'
  | 'auth-sign-in';

type RateLimitConfig = {
  windowMs: number;
  maxRequests: number;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

const RATE_LIMIT_CONFIGS: Record<RateLimitRouteKey, RateLimitConfig> = {
  'demo-sign-in': {
    windowMs: 15 * 60 * 1000,
    maxRequests: 5
  },
  'ai-reply': {
    windowMs: 60 * 1000,
    maxRequests: 10
  },
  'ai-case-insights': {
    windowMs: 5 * 60 * 1000,
    maxRequests: 5
  },
  'auth-sign-up': {
    windowMs: 15 * 60 * 1000,
    maxRequests: 3
  },
  'auth-sign-in': {
    windowMs: 15 * 60 * 1000,
    maxRequests: 8
  }
};

const rateLimitStore = new Map<string, RateLimitEntry>();

function makeStoreKey(routeKey: RateLimitRouteKey, clientIp: string) {
  return `${routeKey}:${clientIp}`;
}

export function getClientIp(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0]?.trim();
    if (firstIp) return firstIp;
  }

  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  return 'unknown';
}

export function checkRateLimit(routeKey: RateLimitRouteKey, clientIp: string): RateLimitResult {
  const config = RATE_LIMIT_CONFIGS[routeKey];
  const now = Date.now();
  const storeKey = makeStoreKey(routeKey, clientIp);
  const existing = rateLimitStore.get(storeKey);

  if (!existing || now >= existing.resetAt) {
    const resetAt = now + config.windowMs;
    rateLimitStore.set(storeKey, {
      count: 1,
      resetAt
    });

    return {
      allowed: true,
      limit: config.maxRequests,
      remaining: Math.max(config.maxRequests - 1, 0),
      retryAfterSeconds: Math.max(Math.ceil((resetAt - now) / 1000), 1)
    };
  }

  if (existing.count >= config.maxRequests) {
    return {
      allowed: false,
      limit: config.maxRequests,
      remaining: 0,
      retryAfterSeconds: Math.max(Math.ceil((existing.resetAt - now) / 1000), 1)
    };
  }

  existing.count += 1;
  rateLimitStore.set(storeKey, existing);

  return {
    allowed: true,
    limit: config.maxRequests,
    remaining: Math.max(config.maxRequests - existing.count, 0),
    retryAfterSeconds: Math.max(Math.ceil((existing.resetAt - now) / 1000), 1)
  };
}

export function createRateLimitExceededResponse(result: RateLimitResult) {
  return new Response(JSON.stringify({ error: 'Too many requests' }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': String(result.retryAfterSeconds),
      'X-RateLimit-Limit': String(result.limit),
      'X-RateLimit-Remaining': String(result.remaining)
    }
  });
}

export function resetRateLimitStore() {
  rateLimitStore.clear();
}
