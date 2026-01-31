import React, { createContext, useContext, useEffect, useState } from 'react';
import { settingsService, CompanySettings } from '../services/settings.service';

interface CompanyContextType {
  companyName: string;
  settings: CompanySettings | null;
  loading: boolean;
}

const CompanyContext = createContext<CompanyContextType>({
  companyName: '',
  settings: null,
  loading: true,
});

export const useCompany = () => useContext(CompanyContext);

export const CompanyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    settingsService.getSettings().then((res) => {
      if (res.success && res.data) {
        setSettings(res.data);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // Default to Thai name, fallback to English, fallback to empty string
  const companyName = settings?.companyNameTh || settings?.companyNameEn || '';

  return (
    <CompanyContext.Provider value={{ companyName, settings, loading }}>
      {children}
    </CompanyContext.Provider>
  );
};
