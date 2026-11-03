import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { REEVALUATE_ALARM, reevaluate, SAFETY_ALARM } from '../background/reevaluate';
import { SCHEDULE_KEY } from '../storage/schedule-store';

export default defineBackground(() => {
  const start = async () => {
    await browser.alarms.create(SAFETY_ALARM, { periodInMinutes: 1 });
    await reevaluate();
  };
  browser.runtime.onInstalled.addListener(() => void start());
  browser.runtime.onStartup.addListener(() => void start());

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === REEVALUATE_ALARM || alarm.name === SAFETY_ALARM) {
      void reevaluate();
    }
  });

  // 予約枠が変わったら、すぐに判定し直す
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync' && SCHEDULE_KEY in changes) {
      void reevaluate();
    }
  });
});
