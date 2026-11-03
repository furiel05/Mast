import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { checkpointPlayback, frameKey, updateFramePlaying } from '../background/playback';
import { REEVALUATE_ALARM, reevaluate, SAFETY_ALARM } from '../background/reevaluate';
import { isPlaybackMessage } from '../messages';
import { SCHEDULE_KEY } from '../storage/schedule-store';
import { pruneUsage } from '../storage/usage-store';

export default defineBackground(() => {
  const start = async () => {
    await browser.alarms.create(SAFETY_ALARM, { periodInMinutes: 1 });
    await reevaluate(() => pruneUsage(new Date()));
  };
  browser.runtime.onInstalled.addListener(() => void start());
  browser.runtime.onStartup.addListener(() => void start());

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === SAFETY_ALARM) {
      void reevaluate(async () => {
        await checkpointPlayback();
        await pruneUsage(new Date());
      });
    } else if (alarm.name === REEVALUATE_ALARM) {
      void reevaluate();
    }
  });

  // YouTubeのフレームで再生が始まった・止まった。予算を使い切る時刻が変わるので判定し直す
  browser.runtime.onMessage.addListener((message, sender) => {
    const tabId = sender.tab?.id;
    if (isPlaybackMessage(message) && tabId !== undefined && sender.frameId !== undefined) {
      const frame = frameKey(tabId, sender.frameId);
      void reevaluate(() => updateFramePlaying(frame, message.playing));
    }
  });

  browser.action.onClicked.addListener(() => void browser.runtime.openOptionsPage());

  // 予約枠が変わったら、すぐに判定し直す
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync' && SCHEDULE_KEY in changes) {
      void reevaluate();
    }
  });
});
