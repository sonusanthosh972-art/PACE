import { proxyAdmin } from '@/lib/adminApi';

/** Lets the request wait for a sleeping API to wake (Vercel function time limit). */
export const maxDuration = 60;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = new URLSearchParams();
  for (const key of ['page', 'pageSize']) {
    const value = params.get(key);
    if (value && /^\d{1,4}$/.test(value)) query.set(key, value);
  }
  return proxyAdmin(query.size > 0 ? `users?${query}` : 'users');
}
