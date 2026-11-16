import type { Metadata } from 'next';
import PasswordRecovery from '../password-recovery';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <PasswordRecovery mode="reset" token={token} />;
}
