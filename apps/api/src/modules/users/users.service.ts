import { db } from '../../lib/db';
import { CreateUserSchema, UpdateUserSchema } from '@car-stock/shared/schemas';
import { authService } from '../auth/auth.service';
import { PERMISSIONS } from '@car-stock/shared/constants';

export class UsersService {
  /**
   * Get all users with pagination
   */
  async getAllUsers(page: number = 1, limit: number = 20, search?: string) {
    const skip = (page - 1) * limit;

    const where = search
      ? {
          OR: [
            { username: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
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
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      db.user.count({ where }),
    ]);

    return {
      data: users,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * Get user by ID
   */
  async getUserById(id: string, currentUser: any) {
    // Check permission
    if (
      currentUser.id !== id &&
      !authService.hasPermission(currentUser.role, 'USER_VIEW')
    ) {
      throw new Error('Insufficient permissions');
    }

    const user = await db.user.findUnique({
      where: { id },
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
      throw new Error('User not found');
    }

    return user;
  }

  /**
   * Create new user
   */
  async createUser(data: any, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'USER_CREATE')) {
      throw new Error('Insufficient permissions');
    }

    const validated = CreateUserSchema.parse(data);

    // Check if username exists
    const existingUser = await db.user.findUnique({
      where: { username: validated.username },
    });

    if (existingUser) {
      throw new Error('Username already exists');
    }

    // Check if email exists
    const existingEmail = await db.user.findUnique({
      where: { email: validated.email },
    });

    if (existingEmail) {
      throw new Error('Email already exists');
    }

    // Hash password
    const hashedPassword = await authService.hashPassword(validated.password);

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
   * Update user
   */
  async updateUser(id: string, data: any, currentUser: any) {
    // Check permission
    if (
      currentUser.id !== id &&
      !authService.hasPermission(currentUser.role, 'USER_UPDATE')
    ) {
      throw new Error('Insufficient permissions');
    }

    const validated = UpdateUserSchema.parse(data);

    // Check if email exists (if updating email)
    if (validated.email) {
      const existingEmail = await db.user.findUnique({
        where: { email: validated.email },
      });

      if (existingEmail && existingEmail.id !== id) {
        throw new Error('Email already exists');
      }
    }

    // Update user
    const user = await db.user.update({
      where: { id },
      data: validated,
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
        action: 'UPDATE_USER',
        entity: 'USER',
        entityId: user.id,
        details: {
          updatedUser: user.username,
          changes: validated,
        },
      },
    });

    return user;
  }

  /**
   * Delete user
   */
  async deleteUser(id: string, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'USER_DELETE')) {
      throw new Error('Insufficient permissions');
    }

    // Cannot delete yourself
    if (currentUser.id === id) {
      throw new Error('Cannot delete your own account');
    }

    // Get user before delete for logging
    const user = await db.user.findUnique({
      where: { id },
      select: { username: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Delete user (soft delete by setting status to INACTIVE)
    await db.user.update({
      where: { id },
      data: { status: 'INACTIVE' },
    });

    // Log activity
    await db.activityLog.create({
      data: {
        userId: currentUser.id,
        action: 'DELETE_USER',
        entity: 'USER',
        entityId: id,
        details: {
          deletedUser: user.username,
        },
      },
    });

    return { success: true, message: 'User deleted successfully' };
  }

  /**
   * Update password
   */
  async updatePassword(
    id: string,
    currentPassword: string,
    newPassword: string,
    currentUser: any
  ) {
    // Users can only update their own password unless admin
    if (currentUser.id !== id && currentUser.role !== 'ADMIN') {
      throw new Error('Insufficient permissions');
    }

    const user = await db.user.findUnique({
      where: { id },
      select: { password: true, username: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Verify current password (skip for admin updating others)
    if (currentUser.id === id) {
      const isValidPassword = await authService.verifyPassword(
        currentPassword,
        user.password
      );

      if (!isValidPassword) {
        throw new Error('Current password is incorrect');
      }
    }

    // Hash new password
    const hashedPassword = await authService.hashPassword(newPassword);

    // Update password
    await db.user.update({
      where: { id },
      data: { password: hashedPassword },
    });

    // Log activity
    await db.activityLog.create({
      data: {
        userId: currentUser.id,
        action: 'UPDATE_PASSWORD',
        entity: 'USER',
        entityId: id,
        details: {
          targetUser: user.username,
        },
      },
    });

    return { success: true, message: 'Password updated successfully' };
  }

  /**
   * Admin reset password (without requiring current password)
   */
  async resetPassword(id: string, newPassword: string, currentUser: any) {
    // Only admin can reset passwords
    if (!authService.hasPermission(currentUser.role, 'USER_UPDATE')) {
      throw new Error('Insufficient permissions');
    }

    const user = await db.user.findUnique({
      where: { id },
      select: { username: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Hash new password
    const hashedPassword = await authService.hashPassword(newPassword);

    // Update password
    await db.user.update({
      where: { id },
      data: { password: hashedPassword },
    });

    // Log activity
    await db.activityLog.create({
      data: {
        userId: currentUser.id,
        action: 'RESET_PASSWORD',
        entity: 'USER',
        entityId: id,
        details: {
          targetUser: user.username,
          resetBy: currentUser.username,
        },
      },
    });

    return { success: true, message: 'Password reset successfully' };
  }
}

export const usersService = new UsersService();
