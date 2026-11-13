import { OAuth2Client } from 'google-auth-library';

export interface GoogleIdentity {
  email: string;
  name: string | null;
}

export type GoogleVerifier = (idToken: string, audience: string[]) => Promise<GoogleIdentity | null>;

const client = new OAuth2Client();

/** Checks the token's signature, expiry, issuer and audience with Google's published keys. */
const verifyWithGoogle: GoogleVerifier = async (idToken, audience) => {
  try {
    const ticket = await client.verifyIdToken({ idToken, audience });
    const payload = ticket.getPayload();
    if (!payload?.email || payload.email_verified !== true) return null;
    return { email: payload.email, name: payload.name ?? null };
  } catch {
    return null;
  }
};

let verifier: GoogleVerifier = verifyWithGoogle;

export function verifyGoogleIdToken(idToken: string, audience: string[]): Promise<GoogleIdentity | null> {
  return verifier(idToken, audience);
}

/** Tests replace the network call to Google. */
export function setGoogleVerifier(next: GoogleVerifier | null): void {
  verifier = next ?? verifyWithGoogle;
}
