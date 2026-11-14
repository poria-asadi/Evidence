import { clearSessionCookie, deleteSession, isSameOriginPost } from '@/lib/auth';

export async function POST(request: Request) {
  if (!isSameOriginPost(request)) return Response.json({ error: 'Invalid request origin.' }, { status: 403 });
  await deleteSession(request);
  return new Response(null, { status: 303, headers: { Location: '/', 'Set-Cookie': clearSessionCookie(request), 'Cache-Control': 'no-store' } });
}
