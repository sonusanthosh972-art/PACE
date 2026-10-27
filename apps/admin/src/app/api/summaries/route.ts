import { proxyAdmin } from '@/lib/adminApi';

export async function GET(request: Request) {
  const limit = new URL(request.url).searchParams.get('limit') ?? '200';
  return proxyAdmin(`summaries?limit=${encodeURIComponent(limit)}`);
}
