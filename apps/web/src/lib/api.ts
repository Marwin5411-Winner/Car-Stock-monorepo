const API_BASE_URL = import.meta.env.VITE_API_URL || '';

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    // Try to get token from localStorage on init
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('auth_token');
    }
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('auth_token', token);
    } else {
      localStorage.removeItem('auth_token');
    }
  }

  getToken() {
    return this.token;
  }

  private async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { params, ...fetchOptions } = options;

    // Build URL with query params
    let url = `${this.baseUrl}${endpoint}`;
    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, String(value));
        }
      });
      const queryString = searchParams.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    // Set default headers
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    // Add auth token if available
    if (this.token) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      ...fetchOptions,
      headers,
    });

    const data = await response.json();

    // Handle unauthorized - clear token but don't redirect (let React handle it)
    if (response.status === 401) {
      this.setToken(null);
      // Throw error with response data for proper handling
      const error = new Error(data.message || 'Unauthorized') as Error & { status: number };
      error.status = 401;
      throw error;
    }

    if (!response.ok) {
      throw new Error(data.message || data.error || 'Request failed');
    }

    return data;
  }

  async get<T>(endpoint: string, params?: RequestOptions['params']): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET', params });
  }

  async post<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async put<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async patch<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  /**
   * Fetch a blob (binary data) from the API - useful for PDF downloads
   */
  async getBlob(endpoint: string): Promise<Blob> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const headers: HeadersInit = {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    if (response.status === 401) {
      this.setToken(null);
      const error = new Error('Unauthorized') as Error & { status: number };
      error.status = 401;
      throw error;
    }

    if (!response.ok) {
      // Try to parse error message
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        const data = await response.json();
        throw new Error(data.message || data.error || 'Request failed');
      }
      throw new Error(`Request failed with status ${response.status}`);
    }

    return response.blob();
  }

  /**
   * Get the full URL for a blob endpoint (for opening in new tab)
   */
  getBlobUrl(endpoint: string): string {
    return `${this.baseUrl}${endpoint}`;
  }

  // Auth methods
  async login(username: string, password: string): Promise<any> {
    const response = await this.post<any>('/api/auth/login', {
      username,
      password,
    });

    if (response.success && response.data) {
      this.setToken(response.data.token);
    }

    return response;
  }

  async register(data: any): Promise<any> {
    return this.post<any>('/api/auth/register', data);
  }

  async getProfile(): Promise<any> {
    return this.get<any>('/api/auth/profile');
  }

  async logout(): Promise<void> {
    try {
      await this.post<any>('/api/auth/logout');
    } finally {
      this.setToken(null);
    }
  }
}

export const api = new ApiClient(API_BASE_URL);
