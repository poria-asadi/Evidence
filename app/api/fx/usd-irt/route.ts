import { currentUsdIrtRate } from '@/lib/fx-rates';
import { requireApiUser } from '@/lib/current-user';

export async function GET() {
  const user = await requireApiUser();
  if (!user) return Response.json({ error: 'Sign in required.' }, { status: 401 });
  try {
    const rate = await currentUsdIrtRate();
    return Response.json(rate, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'A current USD/IRT market rate is unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
