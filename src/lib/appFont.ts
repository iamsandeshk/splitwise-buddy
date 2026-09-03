export type AppFont = 'system' | 'samsung' | 'google' | 'nothing';

const KEY = 'splitmate_app_font';

export function getStoredAppFont(): AppFont {
  const v = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
  return (v as AppFont) || 'system';
}

export function applyAppFont(font: AppFont): void {
  const root = document.documentElement;
  const fonts: AppFont[] = ['system', 'samsung', 'google', 'nothing'];
  fonts.forEach(f => root.classList.remove(`font-${f}`));
  root.classList.add(`font-${font}`);
}

export function setStoredAppFont(font: AppFont): void {
  localStorage.setItem(KEY, font);
  applyAppFont(font);
  window.dispatchEvent(new CustomEvent('splitmate_app_font_changed', { detail: font }));
}

export function initAppFont(): void {
  applyAppFont(getStoredAppFont());
}
