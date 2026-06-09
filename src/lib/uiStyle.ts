export type UiStyle = 'crafted' | 'classic';

const KEY = 'splitmate_ui_style';

export function getStoredUiStyle(): UiStyle {
  const v = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
  return v === 'classic' ? 'classic' : 'crafted';
}

export function applyUiStyle(style: UiStyle): void {
  const root = document.documentElement;
  root.classList.toggle('classic-ui', style === 'classic');
  root.classList.toggle('crafted-ui', style === 'crafted');
}

export function setStoredUiStyle(style: UiStyle): void {
  localStorage.setItem(KEY, style);
  applyUiStyle(style);
  window.dispatchEvent(new CustomEvent('splitmate_ui_style_changed', { detail: style }));
}

export function initUiStyle(): void {
  applyUiStyle(getStoredUiStyle());
}
