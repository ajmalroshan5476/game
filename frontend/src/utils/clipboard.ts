/**
 * Safely retrieves clipboard text on any platform.
 * Gracefully handles older native APKs where expo-clipboard native module was not yet compiled,
 * avoiding fatal requireNativeModule startup crashes.
 */
export async function getClipboardStringSafe(): Promise<string> {
  try {
    // Dynamic require so the bundle does not crash on startup if native module is absent
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Clipboard = require('expo-clipboard');
    if (Clipboard && typeof Clipboard.getStringAsync === 'function') {
      const text = await Clipboard.getStringAsync();
      if (typeof text === 'string') return text;
    }
  } catch {
    // Native module not linked in older APK build
  }

  // Web fallback (navigator.clipboard)
  if (typeof navigator !== 'undefined' && (navigator as any).clipboard?.readText) {
    try {
      const text = await (navigator as any).clipboard.readText();
      if (typeof text === 'string') return text;
    } catch {}
  }

  return '';
}
