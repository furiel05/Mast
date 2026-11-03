import { describe, expect, it } from 'vitest';
import { isBlockedYouTubeUrl } from './youtube';

describe('isBlockedYouTubeUrl', () => {
  it.each([
    'https://www.youtube.com/watch?v=abc',
    'https://youtube.com/',
    'https://m.youtube.com/shorts/abc',
    'https://www.youtube-nocookie.com/embed/abc',
    'https://youtu.be/abc',
    'http://www.youtube.com/',
  ])('%s はブロックの対象', (url) => {
    expect(isBlockedYouTubeUrl(url)).toBe(true);
  });

  it.each([
    'https://music.youtube.com/watch?v=abc',
    'https://accounts.youtube.com/accounts/SetSID',
    'https://example.com/',
    'https://notyoutube.com/',
    'https://youtube.com.example.com/',
    'javascript:alert(1)',
    'chrome-extension://abc/blocked.html',
    'not a url',
  ])('%s はブロックの対象外', (url) => {
    expect(isBlockedYouTubeUrl(url)).toBe(false);
  });
});
