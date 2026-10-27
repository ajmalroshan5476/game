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

export const api = {
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
  getMe: () => request<{ user: any }>('/api/auth/me'),

  // Games & Draws
  getGames: () => request<{ serverTime: string; games: any[] }>('/api/games'),
  getDraws: (date?: string) => request<{ serverTime: string; draws: any[] }>(`/api/draws${date ? `?date=${date}` : ''}`),

  // Tickets
  submitTicket: (payload: {
    drawId: string;
    customerName?: string;
    entries: any[];
    idempotencyKey?: string;
  }) =>
    request<any>('/api/tickets', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getTicket: (ticketNumber: string) => request<any>(`/api/tickets/${encodeURIComponent(ticketNumber)}`),
  cancelTicket: (ticketNumber: string) =>
    request<any>(`/api/tickets/${encodeURIComponent(ticketNumber)}/cancel`, { method: 'POST' }),

  // Limits
  getLimits: (drawId: string) => request<{ limits: any[] }>(`/api/limits?drawId=${drawId}`),
  setLimit: (drawId: string, number: string, maxQuantity: number) =>
    request<any>('/api/admin/limits', {
      method: 'POST',
      body: JSON.stringify({ drawId, number, maxQuantity }),
    }),
  reconcileLimits: (drawId: string) =>
    request<any>('/api/admin/limits/reconcile', {
      method: 'POST',
      body: JSON.stringify({ drawId }),
    }),

  // Results
  getResults: (date?: string, gameId?: string) => {
    const params = new URLSearchParams();
    if (date) params.append('date', date);
    if (gameId) params.append('gameId', gameId);
    const qs = params.toString();
    return request<{ results: any[] }>(`/api/results${qs ? `?${qs}` : ''}`);
  },
  publishResult: (payload: {
    drawId: string;
    firstPrize: string;
    secondPrize?: string;
    thirdPrize?: string;
    fourthPrize?: string;
    fifthPrize?: string;
    sixthPrizes?: string[];
  }) =>
    request<any>('/api/admin/results', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  checkResult: (drawId: string) => request<any>(`/api/results/check/${drawId}`),

  // Settlements & Payments
  getSettlements: (params?: { fromDate?: string; toDate?: string; targetUserId?: string }) => {
    const qs = new URLSearchParams(params as any).toString();
    return request<{ settlements: any[] }>(`/api/settlements${qs ? `?${qs}` : ''}`);
  },
  recordPayment: (targetUserId: string, amount: number, direction: 'TO_USER' | 'FROM_USER', notes?: string) =>
    request<any>('/api/admin/payments', {
      method: 'POST',
      body: JSON.stringify({ targetUserId, amount, direction, notes }),
    }),

  // Reports
  getSalesReport: (params?: any) => {
    const qs = new URLSearchParams(params).toString();
    return request<any>(`/api/reports/sales${qs ? `?${qs}` : ''}`);
  },
  getWinningsReport: (params?: any) => {
    const qs = new URLSearchParams(params).toString();
    return request<any>(`/api/reports/winnings${qs ? `?${qs}` : ''}`);
  },
  getBillWiseReport: (params?: any) => {
    const qs = new URLSearchParams(params).toString();
    return request<any>(`/api/reports/bill-wise${qs ? `?${qs}` : ''}`);
  },
  getNumberWiseReport: (params?: any) => {
    const qs = new URLSearchParams(params).toString();
    return request<any[]>(`/api/reports/number-wise${qs ? `?${qs}` : ''}`);
  },
  getNetPayReport: (params?: any) => {
    const qs = new URLSearchParams(params).toString();
    return request<any[]>(`/api/reports/net-pay${qs ? `?${qs}` : ''}`);
  },

  // Admin Users
  getUsers: () => request<{ users: any[] }>('/api/admin/users'),
  createUser: (username: string, initialPassword: string) =>
    request<any>('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({ username, initialPassword }),
    }),
  updateUserStatus: (userId: string, status: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE') =>
    request<any>(`/api/admin/users/${userId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  resetPassword: (userId: string, newPassword: string) =>
    request<any>(`/api/admin/users/${userId}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ newPassword }),
    }),
};
