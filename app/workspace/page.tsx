import { requireChatGPTUser } from '@/app/chatgpt-auth';
import WorkspaceClient from './workspace-client';

export const dynamic = 'force-dynamic';

export default async function WorkspacePage() {
  const user = await requireChatGPTUser('/workspace');
  return <WorkspaceClient user={{ name: user.displayName, email: user.email }} />;
}
