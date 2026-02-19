export interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  cookies?: Record<string, string | undefined>;
  body?: unknown;
}

export interface ResponseLike {
  cookie: (name: string, value: string, options: Record<string, unknown>) => void;
  clearCookie: (name: string, options?: Record<string, unknown>) => void;
  setHeader: (name: string, value: string) => void;
}
