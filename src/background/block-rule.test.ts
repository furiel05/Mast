import { describe, expect, it } from 'vitest';
import { buildBlockRule } from './block-rule';

describe('buildBlockRule', () => {
  const rule = buildBlockRule('chrome-extension://abc/blocked.html');

  it('元のURLを # 以降に付けて、ブロック画面に転送する', () => {
    expect(rule.action).toEqual({
      type: 'redirect',
      redirect: { regexSubstitution: 'chrome-extension://abc/blocked.html#\\0' },
    });
  });

  it('ページ本体と埋め込み（iframe）だけを対象にする', () => {
    expect(rule.condition.resourceTypes).toEqual(['main_frame', 'sub_frame']);
  });

  it('YouTube Music とログイン用のドメインは対象外にする', () => {
    expect(rule.condition.excludedRequestDomains).toEqual([
      'music.youtube.com',
      'accounts.youtube.com',
    ]);
  });
});
