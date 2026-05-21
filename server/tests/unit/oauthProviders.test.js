import { describe, expect, it } from 'vitest';
import {
  normalizeDiscordIdentity,
  normalizeGithubIdentity,
  normalizeGoogleIdentity,
} from '../../src/modules/auth/oauth.providers.js';

describe('OAuth provider identity normalization', () => {
  it('normalizes verified Google identity safely', () => {
    const identity = normalizeGoogleIdentity({
      sub: 'google-123',
      email: 'USER@Example.COM',
      email_verified: true,
      name: 'Google User',
      picture: 'https://lh3.googleusercontent.com/avatar',
    });

    expect(identity).toMatchObject({
      provider: 'google',
      providerAccountId: 'google-123',
      email: 'user@example.com',
      emailVerified: true,
      displayName: 'Google User',
      avatarUrl: 'https://lh3.googleusercontent.com/avatar',
    });
  });

  it('normalizes GitHub identity using primary verified email only', () => {
    const identity = normalizeGithubIdentity({
      profile: {
        id: 12345,
        login: 'octo',
        name: '',
        avatar_url: 'https://avatars.githubusercontent.com/u/12345',
      },
      emails: [
        { email: 'unverified@example.com', primary: true, verified: false },
        { email: 'primary@example.com', primary: true, verified: true },
      ],
    });

    expect(identity).toMatchObject({
      provider: 'github',
      providerAccountId: '12345',
      email: 'primary@example.com',
      emailVerified: true,
      displayName: 'octo',
    });
  });

  it('normalizes Discord identity and rejects missing avatar safely', () => {
    const identity = normalizeDiscordIdentity({
      id: 'discord-123',
      email: 'DISCORD@Example.COM',
      verified: true,
      global_name: 'Discord User',
      username: 'discorduser',
      avatar: null,
    });

    expect(identity).toMatchObject({
      provider: 'discord',
      providerAccountId: 'discord-123',
      email: 'discord@example.com',
      emailVerified: true,
      displayName: 'Discord User',
      avatarUrl: null,
    });
  });
});
