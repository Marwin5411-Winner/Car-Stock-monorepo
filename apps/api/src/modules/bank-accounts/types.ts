import { z } from 'zod';

export const BankAccountSchema = z.object({
  bankName: z.string().min(1, 'Bank name is required'),
  accountNumber: z.string().min(1, 'Account number is required'),
  accountName: z.string().min(1, 'Account name is required'),
  branch: z.string().optional().nullable(),
  accountType: z.string().optional().nullable(),
  isActive: z.boolean().optional().default(true),
  displayOrder: z.number().int().optional().default(0),
});

export type BankAccountDTO = z.infer<typeof BankAccountSchema>;
