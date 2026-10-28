import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { env } from 'cloudflare:workers';

export type ChatGPTUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const requestHeaders = await headers();
  const userId = requestHeaders.get('oai-authenticated-user-id');
  const email = requestHeaders.get('oai-authenticated-user-email');
  if (!userId || !email) {
    if (env.LOCAL_DEV_AUTH === 'true') {
      const localEmail = env.LOCAL_DEV_USER_EMAIL || 'researcher@localhost';
      return {
        userId: env.LOCAL_DEV_USER_ID || 'local-researcher',
        email: localEmail,
        fullName: 'Local Researcher',
        displayName: 'Local Researcher',
      };
    }
    return null;
  }
  const encodedName = requestHeaders.get('oai-authenticated-user-full-name');
  const encoding = requestHeaders.get(
    'oai-authenticated-user-full-name-encoding',
  );
  let fullName: string | null = null;
  if (encodedName && encoding === 'percent-encoded-utf-8') {
    try {
      fullName = decodeURIComponent(encodedName);
    } catch {
      fullName = null;
    }
  }
  return { userId, email, fullName, displayName: fullName ?? email };
}

export async function requireChatGPTUser(
  returnTo: string,
): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;
  redirect(chatGPTSignInPath(returnTo));
}

export function chatGPTSignInPath(returnTo: string): string {
  return `/signin-with-chatgpt?return_to=${encodeURIComponent(safeReturnPath(returnTo))}`;
}

export function chatGPTSignOutPath(returnTo = '/'): string {
  return `/signout-with-chatgpt?return_to=${encodeURIComponent(safeReturnPath(returnTo))}`;
}

function safeReturnPath(value: string): string {
  if (!value.startsWith('/') || value.startsWith('//')) return '/';
  try {
    const url = new URL(value, 'https://app.local');
    if (
      url.origin !== 'https://app.local' ||
      ['/signin-with-chatgpt', '/signout-with-chatgpt', '/callback'].includes(
        url.pathname,
      )
    )
      return '/';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/';
  }
}
