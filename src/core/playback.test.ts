import { describe, expect, it } from 'vitest';
import { checkpoint, IDLE, parsePlayback, setFramePlaying, withFrames } from './playback';

describe('setFramePlaying', () => {
  it('最初のフレームの再生が始まったら、その時刻から数え始める', () => {
    expect(setFramePlaying(IDLE, '1:0', true, 1000)).toEqual({
      state: { frames: ['1:0'], since: 1000 },
      watched: null,
    });
  });

  it('ほかのフレームも再生を始めても、数え始めの時刻は変えない（重ねて数えない）', () => {
    const state = { frames: ['1:0'], since: 1000 };
    expect(setFramePlaying(state, '2:0', true, 3000)).toEqual({
      state: { frames: ['1:0', '2:0'], since: 1000 },
      watched: null,
    });
  });

  it('同じフレームから再生の知らせが続いても、1つとして扱う', () => {
    const state = { frames: ['1:0'], since: 1000 };
    expect(setFramePlaying(state, '1:0', true, 3000)).toEqual({ state, watched: null });
  });

  it('まだ再生中のフレームがあれば、止まっても数え続ける', () => {
    const state = { frames: ['1:0', '2:0'], since: 1000 };
    expect(setFramePlaying(state, '1:0', false, 3000)).toEqual({
      state: { frames: ['2:0'], since: 1000 },
      watched: null,
    });
  });

  it('最後のフレームが止まったら、そこまでの視聴時間を確定させる', () => {
    const state = { frames: ['1:0'], since: 1000 };
    expect(setFramePlaying(state, '1:0', false, 5000)).toEqual({
      state: IDLE,
      watched: { from: 1000, to: 5000 },
    });
  });

  it('再生していないときに止まった知らせが来ても、何も確定させない', () => {
    expect(setFramePlaying(IDLE, '1:0', false, 5000)).toEqual({ state: IDLE, watched: null });
  });
});

describe('withFrames', () => {
  it('再生中のフレームがなくなったら、そこまでの視聴時間を確定させる', () => {
    const state = { frames: ['1:0', '2:0'], since: 1000 };
    expect(withFrames(state, [], 4000)).toEqual({ state: IDLE, watched: { from: 1000, to: 4000 } });
  });
});

describe('checkpoint', () => {
  it('再生中なら、ここまでの視聴時間を確定させ、続きをその時刻から数える', () => {
    const state = { frames: ['1:0'], since: 1000 };
    expect(checkpoint(state, 61_000)).toEqual({
      state: { frames: ['1:0'], since: 61_000 },
      watched: { from: 1000, to: 61_000 },
    });
  });

  it('再生していなければ何もしない', () => {
    expect(checkpoint(IDLE, 61_000)).toEqual({ state: IDLE, watched: null });
  });
});

describe('parsePlayback', () => {
  it('正しい形の値はそのまま返す', () => {
    const state = { frames: ['1:0'], since: 1000 };
    expect(parsePlayback(state)).toEqual(state);
    expect(parsePlayback(IDLE)).toEqual(IDLE);
  });

  it.each([
    undefined,
    null,
    'playing',
    { frames: '1:0', since: 1000 },
    { frames: [1], since: 1000 },
    { frames: ['1:0'], since: '1000' },
    // 再生中のフレームと数え始めの時刻は、両方あるか両方ないかのどちらか
    { frames: ['1:0'], since: null },
    { frames: [], since: 1000 },
  ])('形が違う値（%j）は、何も再生していないとみなす', (value) => {
    expect(parsePlayback(value)).toEqual(IDLE);
  });
});
