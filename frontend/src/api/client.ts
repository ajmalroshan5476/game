import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const getBaseUrl = () => {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const { hostname, origin } = window.location;
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return origin;
    }
  }
  return 'https://game-guqn.onrender.com';
};

export const API_BASE = getBaseUrl();

let authToken: string | null = null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
  if (token) {
    AsyncStorage.setItem('auth_token', token).catch(() => {});
  } else {
    AsyncStorage.removeItem('auth_token').catch(() => {});
  }
};

export const loadStoredToken = async (): Promise<string | null> => {
  try {
    const t = await AsyncStorage.getItem('auth_token');
    authToken = t;
    return t;
  } catch {
    return null;
  }
};

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const memoryCache = new Map<string, CacheEntry<any>>();
const inFlightRequests = new Map<string, Promise<any>>();

/**
 * Clears in-memory API cache (all or matching a URL prefix/pattern).
 */
export const clearApiCache = (pattern?: string) => {
  if (!pattern) {
    memoryCache.clear();
    return;
  }
  for (const key of memoryCache.keys()) {
    if (key.includes(pattern)) {
      memoryCache.delete(key);
    }
  }
};

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error: any = new Error(data.message || data.error || `HTTP error ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data as T;
}

/**
 * Cached GET request with in-memory TTL and request deduplication.
 * Prevents multiple simultaneous calls and returns instant data for fast tab transitions.
 */
async function cachedRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  ttlMs = 60_000,
  forceRefresh = false
): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  if (method !== 'GET') {
    return request<T>(endpoint, options);
  }

  const cacheKey = `${authToken || 'anon'}:${endpoint}`;

  if (!forceRefresh) {
    const cached = memoryCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data as T;
    }

    const inFlight = inFlightRequests.get(cacheKey);
    if (inFlight) {
      return inFlight as Promise<T>;
    }
  }

  const p = request<T>(endpoint, options)
    .then((data) => {
      memoryCache.set(cacheKey, {
        data,
        expiresAt: Date.now() + ttlMs,
      });
      inFlightRequests.delete(cacheKey);
      return data;
    })
    .catch((err) => {
      inFlightRequests.delete(cacheKey);
      throw err;
    });

  inFlightRequests.set(cacheKey, p);
  return p;
}

export const api = {
  // Cache utility
  clearCache: clearApiCache,

  // Auth & Setup
  getSetupStatus: () => request<{ needsSetup: boolean }>('/api/auth/setup-status'),
  setupAdmin: (username: string, password: string) =>
    request<{ token: string; user: { id: string; orgId: string; username: string; role: 'ADMIN' | 'USER' } }>(
      '/api/auth/setup-admin',
      {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }
    ),
  login: (username: string, password: string) =>
    request<{ token: string; user: { id: string; orgId: string; username: string; role: 'ADMIN' | 'USER' } }>(
      '/api/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }
    ),
  getMe: () => cachedRequest<{ user: any }>('/api/auth/me', {}, 60_000),

  // Games & Draws (Cached for 3 mins to stop redundant queries on every screen)
  getGames: (forceRefresh = false) =>
    cachedRequest<{ serverTime: string; games: any[] }>('/api/games', {}, 180_000, forceRefresh),
  getDraws: (date?: string, forceRefresh = false) =>
    cachedRequest<{ serverTime: string; draws: any[] }>(
      `/api/draws${date ? `?date=${date}` : ''}`,
      {},
      60_000,
      forceRefresh
    ),

  // Tickets
  submitTicket: async (payload: {
    drawId: string;
    customerName?: string;
    entries: any[];
    idempotencyKey?: string;
  }) => {
    const res = await request<any>('/api/tickets', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    clearApiCache('/api/tickets');
    clearApiCache('/api/reports');
    clearApiCache('/api/settlements');
    clearApiCache('/api/ledger');
    return res;
  },
  getTickets: (
    params?: {
      targetUserId?: string;
      gameId?: string;
      drawId?: string;
      date?: string;
      fromDate?: string;
      toDate?: string;
      ticketNumber?: string;
      group?: string;
      mode?: string;
      status?: string;
      search?: string;
      limit?: number;
      offset?: number;
    },
    forceRefresh = false
  ) => {
    const qs = params ? new URLSearchParams(params as any).toString() : '';
    return cachedRequest<{ tickets: any[]; summary?: any }>(
      `/api/tickets${qs ? `?${qs}` : ''}`,
      {},
      20_000,
      forceRefresh
    );
  },
  getTicket: (ticketNumber: string) => request<any>(`/api/tickets/${encodeURIComponent(ticketNumber)}`),
  editTicket: async (
    ticketNumber: string,
    payload: { customerName?: string; entries: any[] }
  ) => {
    const res = await request<any>(`/api/tickets/${encodeURIComponent(ticketNumber)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    clearApiCache('/api/tickets');
    clearApiCache('/api/reports');
    clearApiCache('/api/settlements');
    clearApiCache('/api/ledger');
    return res;
  },
  cancelTicket: async (ticketNumber: string) => {
    const res = await request<any>(`/api/tickets/${encodeURIComponent(ticketNumber)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    clearApiCache('/api/tickets');
    clearApiCache('/api/reports');
    clearApiCache('/api/settlements');
    clearApiCache('/api/ledger');
    return res;
  },
  deleteTicket: async (ticketNumber: string) => {
    const res = await request<any>(`/api/tickets/${encodeURIComponent(ticketNumber)}`, {
      method: 'DELETE',
      body: JSON.stringify({}),
    });
    clearApiCache('/api/tickets');
    clearApiCache('/api/reports');
    clearApiCache('/api/settlements');
    clearApiCache('/api/ledger');
    return res;
  },

  // Limits
  getLimits: (drawId: string, forceRefresh = false) =>
    cachedRequest<{ limits: any[] }>(`/api/limits?drawId=${drawId}`, {}, 20_000, forceRefresh),
  setLimit: async (drawId: string, number: string, maxQuantity: number) => {
    const res = await request<any>('/api/admin/limits', {
      method: 'POST',
      body: JSON.stringify({ drawId, number, maxQuantity }),
    });
    clearApiCache('/api/limits');
    return res;
  },
  reconcileLimits: async (drawId: string) => {
    const res = await request<any>('/api/admin/limits/reconcile', {
      method: 'POST',
      body: JSON.stringify({ drawId }),
    });
    clearApiCache('/api/limits');
    return res;
  },

  // Results
  getResults: (date?: string, gameId?: string, forceRefresh = false) => {
    const params = new URLSearchParams();
    if (date) params.append('date', date);
    if (gameId) params.append('gameId', gameId);
    const qs = params.toString();
    return cachedRequest<{ results: any[] }>(`/api/results${qs ? `?${qs}` : ''}`, {}, 30_000, forceRefresh);
  },
  publishResult: async (payload: {
    drawId: string;
    firstPrize: string;
    secondPrize?: string;
    thirdPrize?: string;
    fourthPrize?: string;
    fifthPrize?: string;
    sixthPrizes?: string[];
  }) => {
    const res = await request<any>('/api/admin/results', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    clearApiCache('/api/results');
    clearApiCache('/api/reports');
    clearApiCache('/api/settlements');
    clearApiCache('/api/ledger');
    return res;
  },
  checkResult: (drawId: string, forceRefresh = false) =>
    cachedRequest<any>(`/api/results/check/${drawId}`, {}, 30_000, forceRefresh),

  // Settlements & Payments
  getSettlements: (params?: { fromDate?: string; toDate?: string; targetUserId?: string }, forceRefresh = false) => {
    const qs = new URLSearchParams(params as any).toString();
    return cachedRequest<{ settlements: any[] }>(`/api/settlements${qs ? `?${qs}` : ''}`, {}, 30_000, forceRefresh);
  },
  recordPayment: async (targetUserId: string, amount: number, direction: 'TO_USER' | 'FROM_USER', notes?: string) => {
    const res = await request<any>('/api/admin/payments', {
      method: 'POST',
      body: JSON.stringify({ targetUserId, amount, direction, notes }),
    });
    clearApiCache('/api/settlements');
    clearApiCache('/api/ledger');
    clearApiCache('/api/reports');
    return res;
  },

  // Reports (Cached for 30s so tab switches within ReportsScreen are instant 0ms)
  getSalesReport: (params?: any, forceRefresh = false) => {
    const qs = new URLSearchParams(params).toString();
    return cachedRequest<any>(`/api/reports/sales${qs ? `?${qs}` : ''}`, {}, 30_000, forceRefresh);
  },
  getWinningsReport: (params?: any, forceRefresh = false) => {
    const qs = new URLSearchParams(params).toString();
    return cachedRequest<any>(`/api/reports/winnings${qs ? `?${qs}` : ''}`, {}, 30_000, forceRefresh);
  },
  getBillWiseReport: (params?: any, forceRefresh = false) => {
    const qs = new URLSearchParams(params).toString();
    return cachedRequest<any>(`/api/reports/bill-wise${qs ? `?${qs}` : ''}`, {}, 30_000, forceRefresh);
  },
  getNumberWiseReport: (params?: any, forceRefresh = false) => {
    const qs = new URLSearchParams(params).toString();
    return cachedRequest<any[]>(`/api/reports/number-wise${qs ? `?${qs}` : ''}`, {}, 30_000, forceRefresh);
  },
  getNetPayReport: (params?: any, forceRefresh = false) => {
    const qs = new URLSearchParams(params).toString();
    return cachedRequest<any>(`/api/reports/net-pay${qs ? `?${qs}` : ''}`, {}, 30_000, forceRefresh);
  },

  // Admin Users (Cached for 3 mins)
  getUsers: (forceRefresh = false) =>
    cachedRequest<{ users: any[] }>('/api/admin/users', {}, 180_000, forceRefresh),
  createUser: async (username: string, initialPassword: string, ticketPrices?: any[]) => {
    const res = await request<any>('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({ username, initialPassword, ticketPrices }),
    });
    clearApiCache('/api/admin/users');
    return res;
  },
  updateUserStatus: async (userId: string, status: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE') => {
    const res = await request<any>(`/api/admin/users/${userId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    clearApiCache('/api/admin/users');
    return res;
  },
  resetPassword: (userId: string, newPassword: string) =>
    request<any>(`/api/admin/users/${userId}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ newPassword }),
    }),

  // User Custom Ticket Pricing
  getUserPrices: (userId: string, forceRefresh = false) =>
    cachedRequest<{ prices: any[] }>(`/api/admin/users/${userId}/prices`, {}, 180_000, forceRefresh),
  setUserPrices: async (userId: string, prices: any[]) => {
    const res = await request<any>(`/api/admin/users/${userId}/prices`, {
      method: 'POST',
      body: JSON.stringify({ prices }),
    });
    clearApiCache('/api/admin/users');
    clearApiCache('/api/users/me/prices');
    return res;
  },
  getMyPrices: (forceRefresh = false) =>
    cachedRequest<{ prices: any[] }>('/api/users/me/prices', {}, 180_000, forceRefresh),

  // Universal Game Range Limits
  getGameLimits: (gameId?: string, forceRefresh = false) => {
    const qs = gameId ? `?gameId=${encodeURIComponent(gameId)}` : '';
    return cachedRequest<{ limits: any[] }>(`/api/admin/game-limits${qs}`, {}, 30_000, forceRefresh);
  },
  setGameLimit: async (payload: {
    gameId: string;
    digitType: number;
    startRange: string;
    endRange: string;
    maxCap: number;
  }) => {
    const res = await request<any>('/api/admin/game-limits', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    clearApiCache('/api/admin/game-limits');
    return res;
  },
  deleteGameLimit: async (id: string) => {
    const res = await request<any>(`/api/admin/game-limits/${id}`, {
      method: 'DELETE',
    });
    clearApiCache('/api/admin/game-limits');
    return res;
  },

  // Edit / Update Result
  updateResult: async (drawId: string, payload: any) => {
    const res = await request<any>(`/api/admin/results/${drawId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    clearApiCache('/api/results');
    clearApiCache('/api/reports');
    clearApiCache('/api/settlements');
    clearApiCache('/api/ledger');
    return res;
  },
};
