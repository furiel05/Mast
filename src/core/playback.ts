/**
 * この端末での再生状態。コンテンツスクリプトから届く「再生が始まった・止まった」の知らせをまとめ、
 * どれか1つでもフレームが再生中だった時間を視聴時間として確定させる（docs/spec.md「視聴時間の数え方」）。
 */

export type PlaybackState = {
  /** 再生中のフレーム（"タブID:フレームID"） */
  frames: readonly string[];
  /** まだ記録していない視聴時間の始まり（ミリ秒のタイムスタンプ）。どのフレームも再生していなければ null */
  since: number | null;
};

export const IDLE: PlaybackState = { frames: [], since: null };

/** 状態の変化と、それによって確定した視聴時間（from〜to のミリ秒のタイムスタンプ） */
export type Transition = {
  state: PlaybackState;
  watched: { from: number; to: number } | null;
};

/** 再生中のフレームを frames に置き換える。最後のフレームが止まったら、そこまでの視聴時間を確定させる */
export function withFrames(
  state: PlaybackState,
  frames: readonly string[],
  now: number,
): Transition {
  if (frames.length > 0) {
    return { state: { frames, since: state.since ?? now }, watched: null };
  }
  return {
    state: IDLE,
    watched: state.since === null ? null : { from: state.since, to: now },
  };
}

/** 1つのフレームの再生が始まった・止まった */
export function setFramePlaying(
  state: PlaybackState,
  frame: string,
  playing: boolean,
  now: number,
): Transition {
  const others = state.frames.filter((f) => f !== frame);
  return withFrames(state, playing ? [...others, frame] : others, now);
}

/** 再生中なら、ここまでの視聴時間を確定させる。再生が長く続いても、途中経過を記録に書き込むため */
export function checkpoint(state: PlaybackState, now: number): Transition {
  if (state.since === null) {
    return { state, watched: null };
  }
  return { state: { ...state, since: now }, watched: { from: state.since, to: now } };
}

/** 保存されていた値を再生状態として読む。形が違えば何も再生していないとみなす */
export function parsePlayback(value: unknown): PlaybackState {
  if (typeof value !== 'object' || value === null) {
    return IDLE;
  }
  const { frames, since } = value as Record<string, unknown>;
  if (
    !Array.isArray(frames) ||
    !frames.every((f) => typeof f === 'string') ||
    !(since === null || typeof since === 'number') ||
    frames.length > 0 !== (since !== null)
  ) {
    return IDLE;
  }
  return { frames, since };
}
