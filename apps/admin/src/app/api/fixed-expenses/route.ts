import { proxyAdmin } from '@/lib/adminApi';

export async function GET() {
  return proxyAdmin('fixed-expenses');
}
