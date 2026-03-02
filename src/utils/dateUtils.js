// src/utils/dateUtils.js
import { WEEK_DAYS } from "./constants";

/**
 * 이번 주 수요일(또는 직전 수요일)부터 8일치 날짜 배열 반환
 * 수요일 기준 주간 스케줄 (수~화)
 *
 * [버그 수정] 기존 코드는 미래의 수요일 기준으로 계산하여
 * 오늘 날짜(TODAY_STR)가 DATE_RANGE에 포함되지 않아
 * 추가모집 파티방이 생성 후 보이지 않는 문제가 있었음.
 * → 과거 수요일(직전 or 오늘)을 기준으로 수정.
 */
export const getDateRange = () => {
  const today = new Date();
  const day = today.getDay(); // 0=일, 1=월, ..., 3=수, ..., 6=토
  // 오늘이 수요일이면 0, 목=1, 금=2, 토=3, 일=4, 월=5, 화=6
  const diffToWed = (day - 3 + 7) % 7;
  const thisWed = new Date(today);
  thisWed.setDate(today.getDate() - diffToWed); // 과거 방향으로 이동
  thisWed.setHours(0, 0, 0, 0);
  return Array.from({length: 15}, (_, i) => {
    const d = new Date(thisWed);
    d.setDate(thisWed.getDate() + i);
    return d;
  });
};

export const fmtDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

export const fmtLabel = (d) => ({
  short: `${d.getMonth()+1}/${d.getDate()}`,
  wd: WEEK_DAYS[d.getDay()]
});

export const genCode = () => Math.random().toString(36).substring(2, 6).toUpperCase();

/** 슬롯 시간이 현재 시각보다 이전인지 확인 */
export const isSlotPast = (dateStr, slot) => {
  const now = new Date();
  const [h, m] = slot.split(":").map(Number);
  const slotDate = new Date(dateStr);
  slotDate.setHours(h, m, 0, 0);
  return slotDate < now;
};

/** schedules 객체에서 특정 슬롯 데이터 반환 (없으면 빈 구조 반환) */
export const getSlotData = (schedules, type, date, slot) =>
  schedules?.[type]?.[date]?.[slot] || {
    members: [],
    requiredClasses: [],
    pendingRequests: [],
    notice: ""
  };
