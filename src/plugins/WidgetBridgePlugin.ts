import { registerPlugin } from '@capacitor/core';

export interface WidgetBridgePluginInterface {
  updateWidgetData(data: {
    spent: number;
    income: number;
    balance: number;
    currency: string;
    month: string;
  }): Promise<void>;
}

const WidgetBridge = registerPlugin<WidgetBridgePluginInterface>('WidgetBridge');

export default WidgetBridge;
