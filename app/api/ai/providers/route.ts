import { requireApiUser } from '@/lib/current-user';
import { getProviderReadiness } from '@/lib/llm-providers';

export async function GET() {
  const user = await requireApiUser();
  if (!user) return Response.json({ error: 'Sign in required.' }, { status: 401 });
  return Response.json({ providers: getProviderReadiness() });
}
