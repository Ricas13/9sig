import "next-auth";

declare module "next-auth" {
  interface User {
    role?: string;
    authVersion?: number;
  }
  interface Session {
    user: {
      id: string;
      role: string;
      authVersion: number;
      email?: string | null;
      name?: string | null;
      image?: string | null;
    };
  }
}
