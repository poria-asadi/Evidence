import { getSessionUser } from '@/lib/auth';
import { accessPlan } from '@/lib/demo-access';

export async function requireApiUser() {
  const user = await getSessionUser();
  if (!user) return null;
  return user;
}

export async function hasActiveAccess(userId: string) {
  return (await accessPlan(userId)) !== null;
}
