import { redirect } from 'next/navigation';
import { getSessionUser, safeReturnPath } from '@/lib/auth';
import AuthForm from '../auth-form';

export const dynamic = 'force-dynamic';

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ return_to?: string }> }) {
  if (await getSessionUser()) redirect('/workspace');
  return <AuthForm mode="sign-in" returnTo={safeReturnPath((await searchParams).return_to)} />;
}
