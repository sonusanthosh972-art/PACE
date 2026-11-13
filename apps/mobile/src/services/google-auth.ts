import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

let configured = false;

export function isGoogleSignInConfigured(): boolean {
  return Boolean(WEB_CLIENT_ID);
}

/**
 * Shows Google's account picker and returns an ID token for the server to verify,
 * or null when the user backs out.
 */
export async function getGoogleIdToken(): Promise<string | null> {
  if (!WEB_CLIENT_ID) throw new Error('Google sign-in is not set up in this build.');
  if (!configured) {
    GoogleSignin.configure({ webClientId: WEB_CLIENT_ID, iosClientId: IOS_CLIENT_ID });
    configured = true;
  }

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return null;
    if (!response.data.idToken) throw new Error('Google did not return a sign-in token.');
    return response.data.idToken;
  } catch (err) {
    if (isErrorWithCode(err)) {
      if (err.code === statusCodes.IN_PROGRESS) return null;
      if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new Error('Google Play services is unavailable on this phone.');
      }
    }
    throw err;
  }
}

/** Forgets the chosen Google account so the next sign-in shows the picker again. */
export async function signOutOfGoogle(): Promise<void> {
  if (!configured) return;
  await GoogleSignin.signOut().catch(() => undefined);
}
