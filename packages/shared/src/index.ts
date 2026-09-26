/** A user record as returned by the API (timestamps serialised to ISO strings). */
export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

/** A post record as returned by the API. */
export interface Post {
  id: string;
  authorId: string;
  title: string;
  content: string;
  createdAt: string;
}

/** A post together with the public fields of its author. */
export interface PostWithAuthor extends Post {
  author: Pick<User, "id" | "name">;
}

/** Error shape returned by every non-2xx API response. */
export interface ApiError {
  error: string;
  details?: unknown;
}

/** Envelope used for list responses. */
export interface ListResponse<T> {
  data: T[];
  count: number;
}

/** Envelope used for single-resource responses. */
export interface ItemResponse<T> {
  data: T;
}

/** Canonical API route paths (and small helpers for parameterised ones). */
export const apiRoutes = {
  health: "/api/health",
  hello: "/api/hello",
  helloName: (name: string) => `/api/hello/${encodeURIComponent(name)}`,
  users: "/api/users",
  user: (id: string) => `/api/users/${encodeURIComponent(id)}`,
  posts: "/api/posts",
  post: (id: string) => `/api/posts/${encodeURIComponent(id)}`,
} as const;
