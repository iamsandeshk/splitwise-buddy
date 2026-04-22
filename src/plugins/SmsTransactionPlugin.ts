import { registerPlugin } from '@capacitor/core';

export interface SmsMessageTransaction {
  id: string;
  address: string;
  body: string;
  amount: number;
  dateMillis: number;
}

export interface SmsTransactionPlugin {
  requestSmsPermissions(): Promise<{ granted: boolean }>;
  checkSmsPermissions(): Promise<{ granted: boolean }>;
  initializeCapture(): Promise<{ initialized: boolean }>;
  fetchNewTransactions(options?: { limit?: number; includeHistory?: boolean }): Promise<{ messages: SmsMessageTransaction[] }>;
}

const SmsTransactions = registerPlugin<SmsTransactionPlugin>('SmsTransactions', {
  web: {
    async requestSmsPermissions() {
      return { granted: false };
    },
    async checkSmsPermissions() {
      return { granted: false };
    },
    async initializeCapture() {
      return { initialized: false };
    },
    async fetchNewTransactions() {
      return { messages: [] };
    },
  },
});

export { SmsTransactions };
