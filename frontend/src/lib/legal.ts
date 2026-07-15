const CONSENT_KEY = 'drive-nav-legal-consent-v1';

export interface LegalConsent {
  acceptedAt: number;
  termsVersion: string;
  privacyVersion: string;
}

/** Bump ao alterar textos legais (força novo aceite). */
export const TERMS_VERSION = '2026-07-15';
export const PRIVACY_VERSION = '2026-07-15';

export function loadLegalConsent(): LegalConsent | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LegalConsent;
    if (
      parsed.termsVersion !== TERMS_VERSION ||
      parsed.privacyVersion !== PRIVACY_VERSION
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveLegalConsent(): LegalConsent {
  const consent: LegalConsent = {
    acceptedAt: Date.now(),
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
  };
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(consent));
  } catch {
    /* ignore */
  }
  return consent;
}

export type LegalDoc = 'terms' | 'privacy';
