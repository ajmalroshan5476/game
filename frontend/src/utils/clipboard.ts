import { requireOptionalNativeModule } from 'expo';

/**
 * Safely retrieves clipboard text on any platform.
 * NEVER calls require('expo-clipboard') or requireNativeModule unless
 * the native module is verified to exist in the compiled APK binary.
 * This guarantees zero crashes on older APK builds.
 */
export async function getClipboardStringSafe(): Promise<string> {
  // 1. Native Expo module check - completely safe, does not throw if absent!
  try {
    const ExpoClipboard = requireOptionalNativeModule('ExpoClipboard');
    if (ExpoClipboard && typeof ExpoClipboard.getStringAsync === 'function') {
      const text = await ExpoClipboard.getStringAsync({});
      if (typeof text === 'string') return text;
    }
  } catch {
    // Native module missing or security restriction - safe fallback
  }

  // 2. Web fallback (navigator.clipboard)
  if (typeof navigator !== 'undefined' && (navigator as any).clipboard?.readText) {
    try {
      const text = await (navigator as any).clipboard.readText();
      if (typeof text === 'string') return text;
    } catch {}
  }

  return '';
}

/**
 * Checks whether native OS clipboard auto-read is supported on this device.
 */
export function isNativeClipboardAvailable(): boolean {
  try {
    const ExpoClipboard = requireOptionalNativeModule('ExpoClipboard');
    return !!(ExpoClipboard && typeof ExpoClipboard.getStringAsync === 'function');
  } catch {
    return false;
  }
}
