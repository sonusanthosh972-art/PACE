import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

WebBrowser.maybeCompleteAuthSession();

// Google OAuth configuration
const GOOGLE_CLIENT_ID =
  Platform.select({
    ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    web: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  }) || 'your-google-client-id.apps.googleusercontent.com';

let redirectUri: string | null = null;

function getRedirectUri(): string {
  if (!redirectUri) {
    redirectUri = AuthSession.makeRedirectUri({
      scheme: 'com.paisapulse',
      path: 'oauth-callback',
    });
  }
  return redirectUri;
}

const discovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://www.googleapis.com/oauth2/v4/token',
  revokeEndpoint: 'https://oauth2.googleapis.com/revoke',
};

export interface GoogleOAuthResponse {
  idToken: string;
  accessToken: string;
  email: string;
  name: string;
  picture?: string;
}

export async function signInWithGoogle(): Promise<GoogleOAuthResponse | null> {
  const uri = getRedirectUri();

  const request = new AuthSession.AuthRequest({
    clientId: GOOGLE_CLIENT_ID,
    scopes: ['openid', 'profile', 'email'],
    redirectUri: uri,
    usePKCE: true,
  });

  const result = await request.promptAsync(discovery);

  if (result.type !== 'success') {
    return null;
  }

  if (!result.params.code) {
    throw new Error('No authorization code received from Google');
  }

  // Exchange code for tokens
  const tokenResponse = await fetch(discovery.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: result.params.code,
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: uri,
      code_verifier: result.params.code_verifier || '',
    }).toString(),
  });

  if (!tokenResponse.ok) {
    throw new Error('Failed to exchange authorization code for tokens');
  }

  const tokens = (await tokenResponse.json()) as {
    id_token?: string;
    access_token?: string;
  };

  const idToken = tokens.id_token;
  if (!idToken) {
    throw new Error('No ID token received from Google');
  }

  // Parse JWT payload (basic parsing without verification)
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid ID token format');
  }

  // Decode base64url safely
  const payload = parts[1];
  if (!payload) {
    throw new Error('Invalid ID token payload');
  }

  const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
  const decoded = JSON.parse(atob(base64)) as {
    email?: string;
    name?: string;
    picture?: string;
  };

  if (!decoded.email) {
    throw new Error('No email in ID token');
  }

  const accessToken = tokens.access_token || '';

  return {
    idToken,
    accessToken,
    email: decoded.email,
    name: decoded.name || 'User',
    picture: decoded.picture,
  };
}
