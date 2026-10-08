import "next-auth";

declare module "next-auth" {
  interface User { role?: string; sessionVersion?: number }
  interface Session {
    user: {
      id: string;
      role: string;
      sessionVersion: number;
      email?: string | null;
      name?: string | null;
      image?: string | null;
    };
  }
}
