import 'elysia';

declare module 'elysia' {
  interface Context {
    requester?: {
      id: string;
      username: string;
      role: string;
    };
  }
}
