import { db } from '../../lib/db';
import { CompanySettingsDTO } from './types';

export class SettingsService {
  private static instance: SettingsService;

  private constructor() {}

  public static getInstance(): SettingsService {
    if (!SettingsService.instance) {
      SettingsService.instance = new SettingsService();
    }
    return SettingsService.instance;
  }

  /**
   * Get company settings
   * If no settings exist, returns null or default empty structure
   */
  async getSettings() {
    // We assume there's only one settings record. We grab the first one.
    const settings = await db.companySettings.findFirst();
    return settings;
  }

  /**
   * Update or Create company settings
   * Since we only want one record, we upsert based on ID if we have it, 
   * or we check if one exists and update it, otherwise create.
   */
  async updateSettings(data: CompanySettingsDTO) {
    const existing = await db.companySettings.findFirst();

    if (existing) {
      return await db.companySettings.update({
        where: { id: existing.id },
        data,
      });
    } else {
      return await db.companySettings.create({
        data,
      });
    }
  }
}

export const settingsService = SettingsService.getInstance();
