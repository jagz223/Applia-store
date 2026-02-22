import { users, type User, type UpsertUser } from "@shared/models/auth";
import { eq } from "drizzle-orm";
const getDb = async () => (await import("../../db")).db;

// Interface for auth storage operations
// (IMPORTANT) These user operations are mandatory for Replit Auth.
export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    const db = await getDb();
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const db = await getDb();
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }
}

class MemoryAuthStorage implements IAuthStorage {
  private store = new Map<string, User>();

  async getUser(id: string): Promise<User | undefined> {
    return this.store.get(id);
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const existing = this.store.get(userData.id!);
    const user: User = {
      id: userData.id!,
      email: userData.email ?? existing?.email ?? null,
      firstName: userData.firstName ?? existing?.firstName ?? null,
      lastName: userData.lastName ?? existing?.lastName ?? null,
      profileImageUrl: userData.profileImageUrl ?? existing?.profileImageUrl ?? null,
      createdAt: existing?.createdAt ?? new Date(),
      updatedAt: new Date(),
    } as User;
    this.store.set(user.id, user);
    return user;
  }
}

export const authStorage = process.env.DATABASE_URL ? new AuthStorage() : new MemoryAuthStorage();
