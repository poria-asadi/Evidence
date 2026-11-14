import { requireSessionUser } from '@/lib/auth';
import WorkspaceClient from './workspace-client';

export const dynamic = 'force-dynamic';

export default async function WorkspacePage() {
  const user = await requireSessionUser('/workspace');
  return <WorkspaceClient user={{ name: user.displayName, username: user.username }} />;
}
