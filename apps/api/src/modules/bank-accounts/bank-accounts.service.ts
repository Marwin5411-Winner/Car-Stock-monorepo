import { db } from '../../lib/db';
import { NotFoundError } from '../../lib/errors';
import type { BankAccountDTO } from './types';

export class BankAccountsService {
  private static instance: BankAccountsService;
  private constructor() {}

  public static getInstance(): BankAccountsService {
    if (!BankAccountsService.instance) {
      BankAccountsService.instance = new BankAccountsService();
    }
    return BankAccountsService.instance;
  }

  async list(includeInactive = false) {
    return db.bankAccount.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(data: BankAccountDTO) {
    return db.bankAccount.create({ data });
  }

  async update(id: string, data: BankAccountDTO) {
    const existing = await db.bankAccount.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('BankAccount');
    return db.bankAccount.update({ where: { id }, data });
  }

  async remove(id: string) {
    const existing = await db.bankAccount.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('BankAccount');
    return db.bankAccount.delete({ where: { id } });
  }
}

export const bankAccountsService = BankAccountsService.getInstance();
