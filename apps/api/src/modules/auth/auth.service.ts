import { db } from '../../lib/db';
import { LoginSchema, RegisterSchema } from '@car-stock/shared/schemas';
import bcrypt from 'bcryptjs';
import { UnauthorizedError, ForbiddenError, ConflictError, NotFoundError } from '../../lib/errors';
import type { Context } from 'elysia';
import { PERMISSIONS, type Permission } from '@car-stock/shared/constants';

export class AuthService {
  /**
   * Generate JWT token
   */
  async generateToken(user: any, jwt: any): Promise<string> {
    return await jwt.sign({
      sub: user.id,
      username: user.username,
      role: user.role,
    });
  }

  /**
   * Hash password
   */
  async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
  }

  /**
   * Verify password
   */
  async verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword);
  }

  /**
   * Login user
   */
  async login(data: any, jwt: any) {
    const validated = LoginSchema.parse(data);

    const user = await db.user.findUnique({
      where: { username: validated.username },
      select: {
        id: true,
        username: true,
        email: true,
        password: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        status: true,
        profileImage: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedError('Invalid username or password');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedError('Account is inactive');
    }

    const isValidPassword = await this.verifyPassword(validated.password, user.password);
    if (!isValidPassword) {
      throw new UnauthorizedError('Invalid username or password');
    }

    // Remove password from response
    const { password, ...userWithoutPassword } = user;

    const token = await this.generateToken(userWithoutPassword, jwt);

    // Log activity
    await db.activityLog.create({
      data: {
        userId: user.id,
        action: 'LOGIN',
        entity: 'AUTH',
        details: {
          username: user.username,
          timestamp: new Date().toISOString(),
        },
      },
    });

    return {
      user: userWithoutPassword,
      token,
    };
  }

  /**
   * Register new user (admin only)
   */
  async register(data: any, currentUser: any) {
    // Check if current user has permission
    if (!currentUser || !PERMISSIONS.USER_CREATE.includes(currentUser.role)) {
      throw new ForbiddenError();
    }

    const validated = RegisterSchema.parse(data);

    // Check if username exists
    const existingUser = await db.user.findUnique({
      where: { username: validated.username },
    });

    if (existingUser) {
      throw new ConflictError('Username');
    }

    // Check if email exists
    const existingEmail = await db.user.findUnique({
      where: { email: validated.email },
    });

    if (existingEmail) {
      throw new ConflictError('Email');
    }

    // Hash password
    const hashedPassword = await this.hashPassword(validated.password);

    // Create user
    const user = await db.user.create({
      data: {
        username: validated.username,
        email: validated.email,
        password: hashedPassword,
        firstName: validated.firstName,
        lastName: validated.lastName,
        phone: validated.phone,
        role: validated.role,
      },
      select: {
        id: true,
        username: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        status: true,
        profileImage: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Log activity
    await db.activityLog.create({
      data: {
        userId: currentUser.id,
        action: 'CREATE_USER',
        entity: 'USER',
        entityId: user.id,
        details: {
          createdUser: user.username,
          role: user.role,
        },
      },
    });

    return user;
  }

  /**
   * Get current user profile
   */
  async getProfile(userId: string) {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        status: true,
        profileImage: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User');
    }

    return user;
  }

  /**
   * Check if user has permission
   */
  hasPermission(userRole: string, permission: Permission): boolean {
    const allowedRoles = PERMISSIONS[permission];
    return allowedRoles ? allowedRoles.includes(userRole as any) : false;
  }

  /**
   * Logout (primarily for activity logging)
   */
  async logout(userId: string) {
    await db.activityLog.create({
      data: {
        userId,
        action: 'LOGOUT',
        entity: 'AUTH',
        details: {
          timestamp: new Date().toISOString(),
        },
      },
    });

    return { success: true };
  }
}

export const authService = new AuthService();
