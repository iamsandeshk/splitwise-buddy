export type AccentColor = 'orange' | 'purple' | 'green' | 'blue' | 'red';

const KEY = 'splitmate_accent_color';

export function getStoredAccentColor(): AccentColor {
  const v = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
  return (v as AccentColor) || 'orange';
}

export function applyAccentColor(color: AccentColor): void {
  const root = document.documentElement;
  const colors: AccentColor[] = ['orange', 'purple', 'green', 'blue', 'red'];
  colors.forEach(c => root.classList.remove(`color-${c}`));
  root.classList.add(`color-${color}`);
}

export function setStoredAccentColor(color: AccentColor): void {
  localStorage.setItem(KEY, color);
  applyAccentColor(color);
  window.dispatchEvent(new CustomEvent('splitmate_accent_color_changed', { detail: color }));
}

export function initAccentColor(): void {
  applyAccentColor(getStoredAccentColor());
}
