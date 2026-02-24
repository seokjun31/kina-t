// src/utils/constants.js
export const ADMIN_CODE = "KINA2026";

export const CLASSES = ["검성","궁성","살성","치유성","호법성","마도성","수호성","정령성"];

export const CLASS_COLORS = {
  "검성":"#ef4444","궁성":"#f97316","살성":"#a855f7","치유성":"#22c55e",
  "호법성":"#3b82f6","마도성":"#ec4899","수호성":"#eab308","정령성":"#06b6d4"
};

export const CLASS_ICONS = {
  "검성":"⚔️","궁성":"🏹","살성":"🗡️","치유성":"💚","호법성":"🛡️","마도성":"🔮","수호성":"🏰","정령성":"🌊"
};

export const SLOTS = Array.from({length:48},(_,i)=>{
  const h = String(Math.floor(i/2)).padStart(2,"0");
  const m = i%2===0 ? "00" : "30";
  return `${h}:${m}`;
});

export const WEEK_DAYS = ["일","월","화","수","목","금","토"];

export const maxOf = (type) => type === "성역" ? 8 : 16;
