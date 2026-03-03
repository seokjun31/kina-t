import React, { useState, useEffect, useCallback, useRef } from "react";
// ─── 유틸리티 (src/utils/, src/hooks/ 로 분리됨) ────────────────────────────
import { ADMIN_CODE, CLASSES, CLASS_COLORS, CLASS_ICONS, SLOTS, WEEK_DAYS, maxOf } from './utils/constants';
import { CLASS_IMAGES } from './utils/classIcons';
import { getDateRange, fmtDate, fmtLabel, genCode, isSlotPast, getSlotData } from './utils/dateUtils';
import { loadData, saveData } from './hooks/useFirestore';
import LoginView from './views/LoginView.jsx';
import MainLayout from './views/MainLayout.jsx';

import { AION_LOGO } from './utils/logo';

// ─── Storage (Firebase Firestore로 완벽 교체) ──────────────────────────────────────────────────────────────────
const load = async (k) => {
  try { return await loadData(k); } catch (e) { console.error("Firebase 로드 실패:", e); return null; }
};
const save = async (k, v) => {
  try { await saveData(k, v); } catch (e) { console.error("Firebase 저장 실패:", e); }
};

// ─── 메인 앱 ─────────────────────────────────────────────────────────────────
export default function App() {
  const DATE_RANGE = getDateRange();
  const TODAY_STR = fmtDate(new Date());

  const initialScreen = (() => {
    if (typeof window === "undefined") return "login";
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get("view") === "share" ? "share" : "login";
    } catch {
      return "login";
    }
  })();

  const savedSession = (() => {
    if (initialScreen === "share") return null;
    try {
      const raw = localStorage.getItem('kina_session');
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (Date.now() - s.loginAt < 3 * 60 * 60 * 1000) return s;
      localStorage.removeItem('kina_session');
      return null;
    } catch { return null; }
  })();

  const [screen, setScreen] = useState(savedSession ? "main" : initialScreen);
  const [user, setUser] = useState(savedSession || null);
  const [codeInput, setCodeInput] = useState("");
  const [loginError, setLoginError] = useState("");

  const [users, setUsers] = useState([]);
  const [initError, setInitError] = useState(null); 
  const [isLoading, setIsLoading] = useState(true); 

  const [schedules, setSchedules] = useState({"성역":{},"성역2":{},"추가":{}});

  const [tab, setTab] = useState(savedSession?.isAdmin ? "admin" : "schedule");
  const [selectedDate, setSelectedDate] = useState(fmtDate(DATE_RANGE[0]));
  const [slotModal, setSlotModal] = useState(null);
  const [moveModal, setMoveModal] = useState(null);
  const [kickConfirm, setKickConfirm] = useState(null);
  const [toast, setToast] = useState(null);
  const [adminView, setAdminView] = useState("users");
  const [adminSearchQuery, setAdminSearchQuery] = useState("");
  const [adminAddTarget, setAdminAddTarget] = useState(null); 
  const [noticeEdit, setNoticeEdit] = useState("");
  const [editingNotice, setEditingNotice] = useState(false);
  const [classEditing, setClassEditing] = useState(false);
  const [namedGroupModal, setNamedGroupModal] = useState(null);
  const [joinRequestModal, setJoinRequestModal] = useState(null); // {type, date, slot, applicant?}
  const [shareJoinSearch, setShareJoinSearch] = useState("");
  const [extraDraft, setExtraDraft] = useState(null);
  const [externalForm, setExternalForm] = useState(null); // null or {nick:"", job:""}
  const [slotAddSearch, setSlotAddSearch] = useState("");
  const [adminCode, setAdminCode] = useState(ADMIN_CODE);
  const [raidNames, setRaidNames] = useState({ primary:"성역", secondary:"성역2" });

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const touchDraggedNick = useRef(null); // 모바일 드래그앤드롭 추적용 ref

  const classIconSize = 22;
  const renderClassIcon = (job, size = classIconSize) => {
    if (!job) return "👤";
    if (CLASS_IMAGES[job]) return (
      <span style={{width:size,height:size,display:"inline-flex",alignItems:"center",justifyContent:"center",overflow:"hidden",borderRadius:"50%",background:"transparent"}}>
        <img
          src={CLASS_IMAGES[job]}
          alt={job}
          style={{width:"110%",height:"110%",objectFit:"cover",display:"block"}}
        />
      </span>
    );
    return CLASS_ICONS[job] || "👤";
  };

  const showToast = (msg, color="#6d4aff") => {
    setToast({msg, color});
    setTimeout(() => setToast(null), 2800);
  };

  // 슬롯 키에서 베이스 시간 추출: "20:00#2" → "20:00"
  const getBaseSlot = (slot) => slot.includes('#') ? slot.split('#')[0] : slot;

  // 해당 시간대에서 다음 생성 가능한 슬롯 키 반환 (최대 10개)
  const getNextAvailableSlot = (sd, type, date, baseSlot) => {
    if (!sd[type]?.[date]?.[baseSlot]?.members?.length) return baseSlot;
    for (let i = 2; i <= 10; i++) {
      const key = `${baseSlot}#${i}`;
      if (!sd[type]?.[date]?.[key]?.members?.length) return key;
    }
    return null;
  };

  const DEFAULT_USERS = [
    {nick:"테스트유저A", job:"검성", atul:"92000", ilv:"1830", code:"TEST"},
    {nick:"테스트유저B", job:"치유성", atul:"88500", ilv:"1810", code:"TES2"},
  ];

  useEffect(() => {
    const fallbackTimer = setTimeout(() => {
      setIsLoading(false);
      setInitError("데이터 동기화 시간이 초과되었습니다. 네트워크를 확인하고 새로고침 해주세요.");
    }, 15000);

    (async () => {
      let hasError = false;
      try {
        let savedUsers = await load("kina:users") || [];
        const nowMs = Date.now();
        const cleanedSavedUsers = savedUsers.map(u => {
          if (!u.accessCode || !u.codeExpiresAt) return { ...u, accessCode:null, codeExpiresAt:null };
          const expMs = new Date(u.codeExpiresAt).getTime();
          if (!expMs || expMs <= nowMs) {
            return { ...u, accessCode:null, codeExpiresAt:null };
          }
          return u;
        });

        try {
          const res = await fetch('/aion2_legion_data.json');
          if (!res.ok) throw new Error(`JSON 로드 실패: ${res.status}`);
          const crawledData = await res.json();

          if (crawledData && crawledData.length > 0) {
            const mergedUsers = crawledData.map(crawledUser => {
              const existingUser = cleanedSavedUsers.find(u => u.nick === crawledUser.nick);
              return {
                ...crawledUser,
                accessCode: existingUser?.accessCode || null,
                codeExpiresAt: existingUser?.codeExpiresAt || null,
              };
            }).map(u => {
              if (!u.accessCode || !u.codeExpiresAt) return { ...u, accessCode:null, codeExpiresAt:null };
              const expMs = new Date(u.codeExpiresAt).getTime();
              if (!expMs || expMs <= nowMs) return { ...u, accessCode:null, codeExpiresAt:null };
              return u;
            });

            setUsers(mergedUsers);
            await save("kina:users", mergedUsers); 
          } else {
            setUsers(cleanedSavedUsers.length > 0 ? cleanedSavedUsers : DEFAULT_USERS);
          }
        } catch (error) {
          console.error("크롤링 데이터 불러오기 실패:", error);
          setUsers(cleanedSavedUsers.length > 0 ? cleanedSavedUsers : DEFAULT_USERS);
        }

        const s = await load("kina:schedules");
        if (s) setSchedules(s);

        try {
          const cfg = await load("kina:config");
          if (cfg?.adminCode) setAdminCode(cfg.adminCode);
          if (cfg?.raidNames) {
            setRaidNames({
              primary: cfg.raidNames.primary || "성역",
              secondary: cfg.raidNames.secondary || "성역2",
            });
          }
        } catch (e) {
          console.error("설정 데이터 불러오기 실패:", e);
        }
      } catch (fatalError) {
        hasError = true;
        console.error("앱 초기화 실패:", fatalError);
        setInitError("데이터를 불러오는 중 오류가 발생했습니다. 네트워크 연결을 확인하고 새로고침 해주세요.");
      } finally {
        clearTimeout(fallbackTimer); 
        setIsLoading(false);
        if (!hasError) setInitError(null); 
      }
    })();
  }, []);

  const persist = useCallback(async (u, s) => {
    await save("kina:users", u);
    await save("kina:schedules", s);
  }, []);

  const isSlotClosed = (type, dateStr, slot) => {
    const sd = getSlotData(schedules, type, dateStr, slot);
    if (sd.members.length >= maxOf(type)) return true;
    return isSlotPast(dateStr, getBaseSlot(slot));
  };

  const handleLogin = async () => {
    const v = codeInput.trim().toUpperCase();
    if (v === adminCode) {
      const adminSess = {isAdmin:true, nick:"관리자", loginAt:Date.now()};
      localStorage.setItem('kina_session', JSON.stringify(adminSess));
      setUser({isAdmin:true, nick:"관리자"});
      setScreen("main"); setTab("admin"); setLoginError(""); return;
    }

    let currentUsers = users;
    try {
      const freshUsers = await load("kina:users");
      if (freshUsers) {
        currentUsers = freshUsers;
        setUsers(freshUsers); 
      }
    } catch(e) {
      console.error("최신 유저 정보 조회 실패", e);
    }

    const nowMs = Date.now();
    const found = currentUsers.find(u => 
      u.accessCode?.toUpperCase() === v && 
      u.codeExpiresAt && 
      new Date(u.codeExpiresAt).getTime() > nowMs
    );
    
    if (found) {
      localStorage.setItem('kina_session', JSON.stringify({...found, loginAt:Date.now()}));
      setUser(found); setScreen("main"); setTab("schedule"); setLoginError("");
    }
    else setLoginError("암호가 올바르지 않습니다.");
  };

  const handleRequestJoin = (type, date, slot) => {
    if (!user) return;
    const isPartySlot = slot.startsWith("party-");
    if (!isPartySlot && isSlotPast(date, getBaseSlot(slot))) { showToast("이미 지난 시간대입니다.", "#ef4444"); return; }

    const sd = JSON.parse(JSON.stringify(schedules));
    if (!sd[type]) sd[type] = {};
    if (!sd[type][date]) sd[type][date] = {};

    const baseSlot = getBaseSlot(slot);
    const targetSlot = getNextAvailableSlot(sd, type, date, baseSlot);
    if (!targetSlot) { showToast("더 이상 방을 만들 수 없습니다. (최대 10개)", "#ef4444"); return; }

    if (!sd[type][date][targetSlot]) sd[type][date][targetSlot] = {members:[], requiredClasses:[], pendingRequests:[], notice:""};
    const slotData = sd[type][date][targetSlot];

    if (slotData.members.find(m => m.nick === user.nick)) { showToast("이미 참석 중입니다.", "#eab308"); return; }

    if (!user.isAdmin) {
      const otherEntry = findMyOtherSlot(sd, type, date, targetSlot);
      if (otherEntry) { setMoveModal({fromType:otherEntry.fromType, type, fromDate:otherEntry.d, fromSlot:otherEntry.sl, toDate:date, toSlot:targetSlot}); setSlotModal(null); return; }
    }

    slotData.members.push({nick:user.nick, job:user.job, isLeader:true, classes:[]});
    setSchedules({...sd}); persist(users, sd);
    setSlotModal({type, date, slot:targetSlot});
    setEditingNotice(false); setClassEditing(false); setNoticeEdit("");
    showToast("방 생성 완료! 방장이 되었습니다 👑", "#fbbf24");
  };

  const findMyOtherSlot = (sd, type, date, slot) => {
    for (const [t, dates] of Object.entries(sd)) {
      if (t !== type) continue;
      for (const [d, slots] of Object.entries(dates || {})) {
        for (const [sl, sdata] of Object.entries(slots)) {
          if (d === date && sl === slot) continue;
          if (sdata.members?.find(m => m.nick === user.nick)) return {fromType:t, d, sl};
        }
      }
    }
    return null;
  };

  const handleApprove = (type, date, slot, nick) => {
    const sd = JSON.parse(JSON.stringify(schedules));
    const slotData = sd[type]?.[date]?.[slot];
    if (!slotData) return;
    const max = maxOf(type);
    if (slotData.members.length >= max) { showToast("인원이 가득 찼습니다.", "#ef4444"); return; }
    const pendIdx = slotData.pendingRequests?.findIndex(m => m.nick === nick);
    if (pendIdx === -1 || pendIdx === undefined) return;
    const [applicant] = slotData.pendingRequests.splice(pendIdx, 1);
    slotData.members.push({nick:applicant.nick, job:applicant.job, isLeader:false, classes:[]});
    setSchedules({...sd}); persist(users, sd);
    showToast(`${nick} 입장 승인!`, "#22c55e");
  };

  const handleReject = (type, date, slot, nick) => {
    const sd = JSON.parse(JSON.stringify(schedules));
    const slotData = sd[type]?.[date]?.[slot];
    if (!slotData) return;
    slotData.pendingRequests = slotData.pendingRequests?.filter(m => m.nick !== nick) || [];
    setSchedules({...sd}); persist(users, sd);
    showToast(`${nick} 신청 거절`, "#f97316");
  };

  const handleSubmitJoinRequest = (type, date, slot, applicant) => {
    // applicant: share view에서 검색으로 선택한 유저. 로그인 상태면 user 사용
    const requester = applicant || (user ? { nick: user.nick, job: user.job || "" } : null);
    if (!requester) return;
    const sd = JSON.parse(JSON.stringify(schedules));
    if (!sd[type]?.[date]?.[slot]) return;
    const slotData = sd[type][date][slot];
    if (slotData.members.find(m => m.nick === requester.nick)) { showToast("이미 참석 중입니다.", "#eab308"); return; }
    if (slotData.pendingRequests?.find(m => m.nick === requester.nick)) { showToast("이미 신청 중입니다.", "#eab308"); return; }
    if (slotData.members.length >= maxOf(type)) { showToast("인원이 마감된 방입니다.", "#ef4444"); return; }
    if (!slotData.pendingRequests) slotData.pendingRequests = [];
    slotData.pendingRequests.push({ nick: requester.nick, job: requester.job || "" });
    setSchedules({...sd}); persist(users, sd);
    setJoinRequestModal(null); setShareJoinSearch("");
    showToast("✋ 참가 신청 완료! 방장의 승인을 기다려주세요.", "#a78bfa");
  };

  const handleCancelJoinRequest = (type, date, slot) => {
    if (!user) return;
    const sd = JSON.parse(JSON.stringify(schedules));
    if (!sd[type]?.[date]?.[slot]) return;
    sd[type][date][slot].pendingRequests =
      sd[type][date][slot].pendingRequests?.filter(m => m.nick !== user.nick) || [];
    setSchedules({...sd}); persist(users, sd);
    showToast("신청을 취소했습니다.", "#f97316");
  };

  const handleLeave = (type, date, slot) => {
    if (!user) return;
    const sd = JSON.parse(JSON.stringify(schedules));
    const slotData = sd[type]?.[date]?.[slot];
    if (!slotData) return;
    const idx = slotData.members.findIndex(m => m.nick === user.nick);
    if (idx === -1) { setSlotModal(null); return; }
    const wasLeader = slotData.members[idx].isLeader;
    const upd = slotData.members.filter(m => m.nick !== user.nick);
    if (wasLeader && upd.length > 0) upd[0].isLeader = true;
    slotData.members = upd;
    if (upd.length === 0) {
      slotData.notice = "";
      slotData.requiredClasses = [];
      slotData.namedGroups = {group1:[], group2:[]};
    } else if (wasLeader) {
      slotData.notice = ""; 
    }
    setSchedules({...sd}); persist(users, sd); setSlotModal(null);
    showToast("참석 취소되었습니다.", "#f97316");
  };

  const confirmMove = () => {
    if (!moveModal) return;
    const {fromType, type, fromDate, fromSlot, toDate, toSlot} = moveModal;
    const effectiveFromType = fromType || type;
    const sd = JSON.parse(JSON.stringify(schedules));
    const fromData = sd[effectiveFromType]?.[fromDate]?.[fromSlot];
    if (fromData) {
      const fi = fromData.members.findIndex(m => m.nick === user.nick);
      if (fi !== -1) {
        const wasLeader = fromData.members[fi].isLeader;
        const upd = fromData.members.filter(m => m.nick !== user.nick);
        if (wasLeader && upd.length > 0) upd[0].isLeader = true;
        if (wasLeader) fromData.notice = "";
        fromData.members = upd;
      }
    }
    if (!sd[type]) sd[type] = {};
    if (!sd[type][toDate]) sd[type][toDate] = {};
    if (!sd[type][toDate][toSlot]) sd[type][toDate][toSlot] = {members:[], requiredClasses:[], pendingRequests:[], notice:""};
    const toData = sd[type][toDate][toSlot];
    if (toData.members.length >= maxOf(type)) { showToast("이동할 슬롯이 마감되었습니다.", "#ef4444"); setMoveModal(null); return; }
    const isFirst = toData.members.length === 0;
    toData.members.push({nick:user.nick, job:user.job, isLeader:isFirst, classes:[]});
    setSchedules({...sd}); persist(users, sd); setMoveModal(null);
    setSlotModal({type, date:toDate, slot:toSlot});
    setEditingNotice(false); setClassEditing(false); setNoticeEdit(toData.notice||"");
    showToast("이동 완료!", "#22c55e");
  };

  const handleKick = (type, date, slot, nick) => {
    const sd = JSON.parse(JSON.stringify(schedules));
    const slotData = sd[type]?.[date]?.[slot];
    if (!slotData) return;
    const idx = slotData.members.findIndex(m => m.nick === nick);
    if (idx !== -1) {
      const upd = slotData.members.filter(m => m.nick !== nick);
      if (slotData.members[idx].isLeader && upd.length > 0) upd[0].isLeader = true;
      slotData.members = upd;
      if (upd.length === 0) {
        slotData.notice = "";
        slotData.requiredClasses = [];
        slotData.namedGroups = {group1:[], group2:[]};
      }
    }
    slotData.pendingRequests = slotData.pendingRequests?.filter(m => m.nick !== nick) || [];
    setSchedules({...sd}); persist(users, sd); setKickConfirm(null);
    showToast(`${nick} 퇴출 완료`, "#ef4444");
  };

  const handleAddExternal = (type, date, slot) => {
    if (!externalForm || !externalForm.nick.trim()) { showToast("이름을 입력하세요.", "#eab308"); return; }
    const sd2 = JSON.parse(JSON.stringify(schedules));
    if (!sd2[type]) sd2[type] = {};
    if (!sd2[type][date]) sd2[type][date] = {};
    if (!sd2[type][date][slot]) sd2[type][date][slot] = {members:[], requiredClasses:[], pendingRequests:[], notice:""};
    const slotData2 = sd2[type][date][slot];
    const max = maxOf(type);
    if (slotData2.members.length >= max) { showToast("인원이 마감되었습니다.", "#ef4444"); return; }
    if (slotData2.members.find(m => m.nick === externalForm.nick.trim())) { showToast("동일한 이름이 이미 있습니다.", "#eab308"); return; }
    slotData2.members.push({nick:externalForm.nick.trim(), job:externalForm.job.trim() || "미등록", isExternal:true, isLeader:false, classes:[]});
    setSchedules({...sd2}); persist(users, sd2);
    setExternalForm(null);
    showToast(`${externalForm.nick.trim()} (외부) 추가 완료!`, "#22c55e");
  };

  const handleAdminClearSlot = (type, date, slot) => {
    const sd = JSON.parse(JSON.stringify(schedules));
    if (sd[type]?.[date]?.[slot]) {
      sd[type][date][slot].members = [];
      sd[type][date][slot].pendingRequests = [];
    }
    setSchedules({...sd}); persist(users, sd);
    showToast("전체 강퇴 완료", "#ef4444");
  };

  const handleGenerateAccessCode = (nick) => {
    const now = new Date();
    const expires = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000);
    const newCode = genCode().toUpperCase(); 
    const nextUsers = users.map(u => u.nick === nick ? {
      ...u,
      accessCode: newCode,
      codeExpiresAt: expires.toISOString(),
    } : u);
    setUsers(nextUsers);
    persist(nextUsers, schedules);
    showToast("코드가 생성되었습니다.", "#22c55e");
  };

  const handleDeleteAccessCode = (nick) => {
    const nextUsers = users.map(u => u.nick === nick ? {
      ...u,
      accessCode: null,
      codeExpiresAt: null,
    } : u);
    setUsers(nextUsers);
    persist(nextUsers, schedules);
    showToast("코드가 삭제되었습니다.", "#f97316");
  };

  const handleSaveAdminSettings = async () => {
    const nextConfig = {
      adminCode,
      raidNames,
    };
    try {
      await save("kina:config", nextConfig);
      showToast("관리자 설정이 저장되었습니다.", "#22c55e");
    } catch (e) {
      console.error("관리자 설정 저장 실패:", e);
      showToast("설정 저장에 실패했습니다.", "#ef4444");
    }
  };

  const handleAdminAdd = (type, date, slot, nick) => {
    const targetUser = users.find(u => u.nick === nick);
    if (!targetUser) { showToast("유저를 찾을 수 없습니다.", "#ef4444"); return; }
    const sd = JSON.parse(JSON.stringify(schedules));
    if (!sd[type]) sd[type] = {};
    if (!sd[type][date]) sd[type][date] = {};
    if (!sd[type][date][slot]) sd[type][date][slot] = {members:[], requiredClasses:[], pendingRequests:[], notice:""};
    const slotData = sd[type][date][slot];
    if (slotData.members.find(m => m.nick === nick)) { showToast("이미 참석 중인 유저입니다.", "#eab308"); return; }
    if (slotData.members.length >= maxOf(type)) { showToast("인원이 마감되었습니다.", "#ef4444"); return; }
    const isFirst = slotData.members.length === 0;
    slotData.members.push({nick:targetUser.nick, job:targetUser.job, isLeader:isFirst, classes:[]});
    setSchedules({...sd}); persist(users, sd);
    showToast(`${nick} 추가 완료!`, "#22c55e"); setAdminSearchQuery(""); setAdminAddTarget(null);
  };

  const handleCreateExtraParty = () => {
    if (!user) return;
    setExtraDraft({notice:""});
  };

  const confirmCreateExtraParty = () => {
    if (!user || !extraDraft) return;
    const type = "추가";
    const sd = JSON.parse(JSON.stringify(schedules));
    if (!sd[type]) sd[type] = {};
    const today = TODAY_STR;
    if (!sd[type][today]) sd[type][today] = {};
    let partySlot = null;
    for (let i = 1; i <= 16; i++) {
      const key = `party-${i}`;
      if (!sd[type][today][key] || sd[type][today][key].members?.length === 0) {
        partySlot = key; break;
      }
    }
    if (!partySlot) { showToast("더 이상 파티를 생성할 수 없습니다.", "#ef4444"); return; }
    sd[type][today][partySlot] = {
      members:[{nick:user.nick, job:user.job, isLeader:true, classes:[]}],
      requiredClasses: [],
      pendingRequests:[],
      notice: extraDraft.notice
    };
    setSchedules({...sd}); persist(users, sd);
    setExtraDraft(null);
    setSlotModal({type, date:today, slot:partySlot});
    setEditingNotice(false); setClassEditing(false); setNoticeEdit(extraDraft.notice||"");
    showToast("파티 생성 완료! 방장이 되었습니다 👑", "#fbbf24");
  };


  const handleSetRequiredClass = (type, date, slot, cls) => {
    const sd = JSON.parse(JSON.stringify(schedules));
    if (!sd[type]?.[date]?.[slot]) return;
    const req = sd[type][date][slot].requiredClasses || [];
    if (req.includes(cls)) {
      sd[type][date][slot].requiredClasses = req.filter(c => c !== cls);
    } else if (req.length < 7) {
      sd[type][date][slot].requiredClasses = [...req, cls];
    } else {
      showToast("최대 7개까지 지정 가능합니다.", "#eab308"); return;
    }
    setSchedules({...sd}); persist(users, sd);
  };

  const saveNotice = (type, date, slot) => {
    const sd = JSON.parse(JSON.stringify(schedules));
    if (!sd[type]) sd[type] = {};
    if (!sd[type][date]) sd[type][date] = {};
    if (!sd[type][date][slot]) sd[type][date][slot] = {members:[], requiredClasses:[], pendingRequests:[], notice:""};
    sd[type][date][slot].notice = noticeEdit;
    setSchedules({...sd}); persist(users, sd); setEditingNotice(false);
    showToast("공지 저장 완료!", "#22c55e");
  };

  const amILeader = (type, date, slot) =>
    !!(user && getSlotData(schedules, type, date, slot).members?.find(m => m.nick === user.nick && m.isLeader));

  const amIIn = (type, date, slot) =>
    !!(user && getSlotData(schedules, type, date, slot).members?.find(m => m.nick === user.nick));

  const amIPending = (type, date, slot) =>
    !!(user && getSlotData(schedules, type, date, slot).pendingRequests?.find(m => m.nick === user.nick));

  const downloadUsersTxt = () => {
    const lines = users
      .filter(u => u.accessCode)
      .map(u => `${u.nick}|${u.accessCode}`)
      .join("\n");
    const blob = new Blob([lines], {type:"text/plain;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "kina_users.txt"; a.click();
    URL.revokeObjectURL(url);
    showToast("TXT 다운로드 완료!", "#22c55e");
  };

  // 내가 방장인 슬롯 전체 수집
  const myRooms = React.useMemo(() => {
    if (!user || user.isAdmin) return [];
    const rooms = [];
    for (const [type, dates] of Object.entries(schedules)) {
      for (const [date, slots] of Object.entries(dates || {})) {
        for (const [slot, slotData] of Object.entries(slots || {})) {
          if (slotData.members?.find(m => m.nick === user.nick && m.isLeader)) {
            rooms.push({ type, date, slot, slotData });
          }
        }
      }
    }
    rooms.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return getBaseSlot(a.slot).localeCompare(getBaseSlot(b.slot));
    });
    return rooms;
  }, [schedules, user]);

  const renderMyRooms = () => {
    if (!user || user.isAdmin || myRooms.length === 0) return null;
    return (
      <div style={{marginBottom:24,background:"#0a0a14",border:"1px solid #2d2a4a",borderRadius:16,padding:16}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
          <span style={{fontSize:15}}>🏠</span>
          <h3 style={{fontSize:14,fontWeight:700,color:"#c4b5fd"}}>내가 만든 방</h3>
          <span style={{fontSize:11,color:"#555"}}>({myRooms.length}개)</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(155px,1fr))",gap:8}}>
          {myRooms.map(({type, date, slot, slotData}) => {
            const max = maxOf(type);
            const pendingCount = slotData.pendingRequests?.length || 0;
            const past = !slot.startsWith("party-") && isSlotPast(date, getBaseSlot(slot));
            const isPartySlot = slot.startsWith("party-");
            const slotLabel = isPartySlot ? slot.replace("party-","")+"포스" : getBaseSlot(slot);
            const dObj = DATE_RANGE.find(d => fmtDate(d) === date);
            const dateLabel = dObj ? fmtLabel(dObj).short : date;
            const typeLabel = type === "성역" ? raidNames.primary : type === "성역2" ? raidNames.secondary : "추가";
            return (
              <div key={`${type}-${date}-${slot}`}
                onClick={() => {
                  setSlotModal({type, date, slot});
                  setEditingNotice(false); setClassEditing(false);
                  setNoticeEdit(slotData.notice || "");
                  setSelectedDate(date);
                }}
                style={{
                  background: past ? "#0a0a0a" : "rgba(109,74,255,.1)",
                  border: `1px solid ${past ? "#1a1a1a" : pendingCount > 0 ? "#a78bfa" : "#2d2a4a"}`,
                  borderRadius:12, padding:"10px 12px", cursor:"pointer", transition:"all .15s",
                  opacity: past ? 0.6 : 1, position:"relative"
                }}
                onMouseEnter={e=>{if(!past){e.currentTarget.style.transform="translateY(-1px)";e.currentTarget.style.boxShadow="0 4px 12px rgba(109,74,255,.3)";}}}
                onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow="none";}}>
                {pendingCount > 0 && (
                  <div style={{position:"absolute",top:-6,right:-6,background:"#ef4444",color:"#fff",borderRadius:"50%",
                    width:18,height:18,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700}}>
                    {pendingCount}
                  </div>
                )}
                <div style={{fontSize:10,color:"#6d4aff",fontWeight:700,marginBottom:3}}>{typeLabel}</div>
                <div style={{fontSize:14,fontWeight:700,color:"#e2d9f3",marginBottom:2}}>{slotLabel}</div>
                <div style={{fontSize:11,color:"#555",marginBottom:6}}>{dateLabel}</div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:11,color:slotData.members.length>=max?"#ef4444":"#22c55e",fontWeight:600}}>
                    {slotData.members.length}/{max}명
                  </span>
                  {past && <span style={{fontSize:9,color:"#444"}}>⏱종료</span>}
                  {!past && pendingCount > 0 && (
                    <span style={{fontSize:10,color:"#a78bfa",fontWeight:700}}>✋{pendingCount}명 대기</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderExtraParties = () => {
    const type = "추가";
    const max = maxOf(type);
    const date = TODAY_STR;
    const daySlots = Object.entries(schedules[type]?.[date] || {})
      .filter(([, sd]) => sd.members?.length > 0)
      .sort(([a], [b]) => {
        const aNum = parseInt(a.replace("party-", "")) || 0;
        const bNum = parseInt(b.replace("party-", "")) || 0;
        return aNum - bNum;
      });
    return (
      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:12}}>
          <div>
            <h2 style={{fontSize:17,fontWeight:700,color:"#c4b5fd",marginBottom:4}}>➕ 성역 외 추가모집</h2>
            <p style={{fontSize:12,color:"#444"}}>최대 {max}명 · 자유 파티 운영 (방 생성 후 클릭하여 관리)</p>
          </div>
          <button onClick={handleCreateExtraParty} style={{padding:"10px 20px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#6d4aff,#a78bfa)",color:"#fff",cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:700,boxShadow:"0 4px 16px rgba(109,74,255,.4)",whiteSpace:"nowrap"}}>
            🏠 방 생성
          </button>
        </div>
        {daySlots.length === 0 ? (
          <div style={{textAlign:"center",padding:60,color:"#2a2a3a",fontSize:14}}>
            아직 생성된 파티가 없습니다.<br/>
            <span style={{fontSize:12,color:"#1e1e30"}}>위의 [방 생성] 버튼으로 파티를 만드세요.</span>
          </div>
        ) : (
          <div className="mobile-grid-1" style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(340px,1fr))",gap:14}}>
            {daySlots.map(([slot, sd]) => {
              const members = sd.members || [];
              const isFull = members.length >= max;
              const isMine = amIIn(type, date, slot);
              const leader = members.find(m => m.isLeader);
              const partyNum = slot.replace("party-", "");
              return (
                <div key={slot} onClick={() => {
                  setSlotModal({type, date, slot});
                  setEditingNotice(false); setClassEditing(false);
                  setNoticeEdit(sd.notice || "");
                }} style={{
                  background: isMine?"rgba(109,74,255,.12)":isFull?"rgba(239,68,68,.06)":"#111120",
                  border:`1px solid ${isMine?"#6d4aff":isFull?"#5a1515":"#1e1e30"}`,
                  borderRadius:16, padding:18, cursor:"pointer", transition:"all .2s"
                }}
                onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow="0 8px 24px rgba(0,0,0,.5)";}}
                onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow="none";}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                    <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                      <span style={{background:"rgba(109,74,255,.25)",border:"1px solid #6d4aff",color:"#c4b5fd",fontSize:14,padding:"3px 14px",borderRadius:20,fontWeight:900}}>{partyNum}포스</span>
                      <span style={{background:isFull?"rgba(239,68,68,.15)":"rgba(34,197,94,.1)",border:`1px solid ${isFull?"#ef4444":"#22c55e"}`,color:isFull?"#ef4444":"#22c55e",fontSize:11,padding:"2px 8px",borderRadius:20,fontWeight:700}}>
                        {isFull?"🔴 마감":"🟢 모집중"}
                      </span>
                      {isMine && <span style={{fontSize:10,color:"#a78bfa",fontWeight:700}}>✓ 참석중</span>}
                    </div>
                    <span style={{fontSize:12,color:"#444",fontWeight:600}}>{members.length}/{max}</span>
                  </div>
                  {leader ? (
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                      <span style={{fontSize:14}}>👑</span>
                      <div>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <span style={{fontWeight:700,color:"#fbbf24",fontSize:13}}>{leader.nick}</span>
                          {leader.job && <span style={{fontSize:11,color:"#555"}}>{leader.job}</span>}
                        </div>
                        {(() => { const u=users.find(u=>u.nick===leader.nick); return (!leader.isExternal && u?.atul)?<span style={{fontSize:10,color:"#a78bfa"}}>아툴 {u.atul}</span>:null; })()}
                      </div>
                    </div>
                  ) : (
                    <div style={{color:"#2a2a3a",fontSize:12,fontStyle:"italic",marginBottom:10}}>방장 없음</div>
                  )}
                  {sd.notice && <div style={{background:"rgba(251,191,36,.06)",border:"1px solid rgba(251,191,36,.2)",borderRadius:8,padding:"6px 10px",marginBottom:10,fontSize:12,color:"#e2d9f3"}}>📌 {sd.notice}</div>}
                  <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                    {members.map(m => {
                      const u=users.find(u=>u.nick===m.nick);
                      return (
                        <div key={m.nick} style={{background:m.isLeader?"rgba(251,191,36,.1)":"#0a0a14",border:`1px solid ${m.isLeader?"rgba(251,191,36,.3)":"#1e1e30"}`,borderRadius:12,padding:"6px 10px",display:"flex",flexDirection:"column",alignItems:"center",gap:2,minWidth:80}}>
                          <span style={{color:m.isLeader?"#fbbf24":"#e2d9f3",fontSize:13,fontWeight:700}}>{m.nick}</span>
                          {m.job && <span style={{color:CLASS_COLORS[m.job]||"#555",fontSize:11}}>{m.job}</span>}
                          {!m.isExternal && u?.atul && <span style={{color:"#a78bfa",fontSize:11,fontWeight:600}}>아툴 {u.atul}</span>}
                          {m.isExternal && <span style={{fontSize:9,color:"#888",fontWeight:600}}>(외부)</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderGrid = (type) => {
    const max = maxOf(type);
    return (
      <div>
        <div style={{display:"flex", gap:6, marginBottom:20, overflowX:"auto", paddingBottom:6}}>
          {DATE_RANGE.map(d => {
            const ds = fmtDate(d);
            const {short, wd} = fmtLabel(d);
            const active = selectedDate === ds;
            const today = ds === TODAY_STR;
            const isWed = d.getDay() === 3;
            const myCount = Object.values(schedules[type]?.[ds] || {})
              .filter(sd => sd.members?.find(m => m.nick === user?.nick)).length;
            return (
              <button key={ds} onClick={() => setSelectedDate(ds)} style={{
                flexShrink:0, minWidth:62, padding:"10px 10px", borderRadius:12, border:"none", cursor:"pointer",
                background: active ? "linear-gradient(135deg,#6d4aff,#8b68ff)" : "#13131f",
                color: active ? "#fff" : today ? "#c4b5fd" : "#555",
                fontFamily:"inherit", transition:"all .2s",
                boxShadow: active ? "0 4px 16px rgba(109,74,255,.5)" : "none",
                outline: today && !active ? "1px solid #3d2a6e" : "none", position:"relative"
              }}>
                <div style={{fontSize:10, marginBottom:3, color: active?"rgba(255,255,255,.7)":isWed?"#f97316":"inherit", fontWeight:isWed?700:400}}>
                  {wd}{isWed?" 🌙":""}
                </div>
                <div style={{fontSize:14, fontWeight:700}}>{short}</div>
                {myCount > 0 && <div style={{position:"absolute",top:4,right:6,fontSize:9,color:active?"#fff":"#a78bfa",fontWeight:700}}>{myCount}</div>}
                {today && <div style={{position:"absolute",bottom:5,left:"50%",transform:"translateX(-50%)",width:4,height:4,borderRadius:"50%",background:active?"#fff":"#a78bfa"}}/>}
              </button>
            );
          })}
        </div>

        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))", gap:8}}>
          {SLOTS.map(slot => {
            const past = isSlotPast(selectedDate, slot);
            // 해당 시간대의 모든 파티 키 수집
            const partiesAtTime = Object.entries(schedules[type]?.[selectedDate] || {})
              .filter(([k, sd]) => getBaseSlot(k) === slot && sd.members?.length > 0)
              .sort(([a], [b]) => a.localeCompare(b));
            const iAmInAny = partiesAtTime.some(([k]) => amIIn(type, selectedDate, k));
            const hasParties = partiesAtTime.length > 0;

            let borderColor = "#1a1a28", bg = "#0d0d18";
            if (past) { bg = "#0a0a0a"; borderColor = "#1a1a1a"; }
            else if (iAmInAny) { bg = "rgba(109,74,255,.12)"; borderColor = "#6d4aff"; }
            else if (hasParties) { bg = "rgba(109,74,255,.06)"; borderColor = "#2d2a4a"; }

            return (
              <div key={slot} style={{
                padding:"8px 8px 8px", borderRadius:12, border:`1px solid ${borderColor}`, background:bg,
                transition:"all .15s", position:"relative", opacity: past ? 0.5 : 1,
                display:"flex", flexDirection:"column", gap:5
              }}>
                {/* 시간 헤더 */}
                <div style={{fontSize:13, fontWeight:700, color: past?"#2a2a2a":iAmInAny?"#a78bfa":hasParties?"#6d4aff":"#3a3a5a", letterSpacing:.5, textAlign:"center", paddingBottom:3, borderBottom:"1px solid #1a1a28"}}>
                  {slot}
                </div>

                {/* 파티 카드들 */}
                {partiesAtTime.map(([partyKey, sd], idx) => {
                  const leader = sd.members.find(m => m.isLeader);
                  const isMine = amIIn(type, selectedDate, partyKey);
                  const isFull = sd.members.length >= max;
                  return (
                    <div key={partyKey} onClick={() => {
                      setSlotModal({type, date:selectedDate, slot:partyKey});
                      setEditingNotice(false); setClassEditing(false);
                      setNoticeEdit(sd.notice || "");
                    }} style={{
                      background: isMine?"rgba(109,74,255,.22)":isFull?"rgba(239,68,68,.1)":"rgba(255,255,255,.04)",
                      border:`1px solid ${isMine?"#6d4aff":isFull?"#5a1515":"#2a2a3a"}`,
                      borderRadius:8, padding:"5px 7px", cursor:"pointer", transition:"all .15s"
                    }}
                    onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-1px)";e.currentTarget.style.boxShadow="0 4px 12px rgba(0,0,0,.4)";}}
                    onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow="none";}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{fontSize:9,color:"#666",fontWeight:700}}>
                          {partiesAtTime.length > 1 ? `${idx+1}번` : "1번"}
                        </span>
                        <span style={{fontSize:9,color:isFull?"#ef4444":"#22c55e",fontWeight:700}}>
                          {sd.members.length}/{max}
                        </span>
                      </div>
                      {leader && (
                        <div style={{fontSize:10,fontWeight:700,color:isMine?"#c4b5fd":"#888",marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          👑 {leader.nick}
                        </div>
                      )}
                      {isMine && <div style={{fontSize:9,color:"#a78bfa",fontWeight:600}}>✓ 참석예정</div>}
                    </div>
                  );
                })}

                {/* 방 생성 버튼 */}
                {!past && (
                  <button onClick={() => handleRequestJoin(type, selectedDate, slot)}
                    style={{width:"100%",padding:"5px 0",borderRadius:8,border:"1px dashed #2a2a3a",background:"transparent",color:"#3a3a5a",cursor:"pointer",fontFamily:"inherit",fontSize:10,fontWeight:600,transition:"all .2s"}}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor="#6d4aff";e.currentTarget.style.color="#a78bfa";e.currentTarget.style.background="rgba(109,74,255,.08)";}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor="#2a2a3a";e.currentTarget.style.color="#3a3a5a";e.currentTarget.style.background="transparent";}}>
                    🏠 방 생성
                  </button>
                )}
                {past && partiesAtTime.length === 0 && (
                  <div style={{fontSize:9,color:"#2a2a2a",textAlign:"center",paddingBottom:2}}>⏱ 종료</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderSlotModal = () => {
    if (!slotModal) return null;
    const {type, date, slot} = slotModal;
    const sd = getSlotData(schedules, type, date, slot);
    const members = sd.members || [];
    const pending = sd.pendingRequests || [];
    const required = sd.requiredClasses || [];
    const max = maxOf(type);
    const isFull = members.length >= max;
    const past = !slot?.startsWith("party-") && isSlotPast(date, getBaseSlot(slot));
    const isMine = amIIn(type, date, slot);
    const isPending = amIPending(type, date, slot);
    const isLeader = amILeader(type, date, slot) || !!(user?.isAdmin);
    const dObj = DATE_RANGE.find(d => fmtDate(d) === date);
    const {short, wd} = dObj ? fmtLabel(dObj) : {short:date, wd:""};
    const isPartySlot = slot?.startsWith("party-");
    const slotLabel = isPartySlot
      ? `${slot.replace("party-","")}포스`
      : slot.includes('#')
        ? `${getBaseSlot(slot)} · ${slot.split('#')[1]}번 파티`
        : slot;

    return (
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.9)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:16}}
        onClick={e => { if(e.target===e.currentTarget){setSlotModal(null);setEditingNotice(false);setClassEditing(false);setExternalForm(null);} }}>
        <div className="mobile-modal" style={{background:"#111120",border:"1px solid #2a2a3a",borderRadius:20,padding:24,maxWidth:540,width:"100%",maxHeight:"88vh",overflowY:"auto"}}>

          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                <div style={{background: past?"#1a1a1a":"linear-gradient(135deg,#6d4aff,#a78bfa)",borderRadius:10,padding:"6px 14px",fontSize:16,fontWeight:900,color:"#fff",letterSpacing:1}}>{slotLabel}</div>
                <span style={{color:"#666",fontSize:13}}>{`${short} (${wd})`}</span>
                {past && <span style={{background:"#1a1a1a",border:"1px solid #333",color:"#555",fontSize:10,padding:"2px 8px",borderRadius:20}}>종료됨</span>}
              </div>
              <div style={{marginTop:6,display:"flex",gap:10,alignItems:"center"}}>
                <span style={{fontSize:12,color:"#555"}}>{members.length}/{max}명</span>
                <span style={{fontSize:11,fontWeight:700,color: past?"#333":isFull?"#ef4444":members.length>0?"#22c55e":"#444"}}>
                  {past ? "⏱ 종료" : members.length===0?"대기중":isFull?"🔴 마감":"🟢 모집중"}
                </span>
              </div>
            </div>
            <button onClick={()=>{setSlotModal(null);setEditingNotice(false);setClassEditing(false);setExternalForm(null);}}
              style={{background:"transparent",border:"1px solid #2a2a3a",color:"#666",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontFamily:"inherit",fontSize:12}}>✕</button>
          </div>

          <div style={{background:"#0a0a14",borderRadius:12,padding:14,marginBottom:14,border:"1px solid #1e1e30"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <span style={{fontSize:12,color:"#fbbf24",fontWeight:700}}>📌 방 공지</span>
              {isLeader && !editingNotice && (
                <button onClick={()=>setEditingNotice(true)} style={{background:"transparent",border:"1px solid #2a2a3a",color:"#6d4aff",cursor:"pointer",fontSize:11,borderRadius:6,padding:"3px 8px",fontFamily:"inherit"}}>✏️ 편집</button>
              )}
            </div>
            {editingNotice ? (
              <div>
                <textarea value={noticeEdit} onChange={e=>setNoticeEdit(e.target.value)} rows={3}
                  placeholder="예: 치유성 필수! 아이템레벨 1800 이상"
                  style={{width:"100%",background:"#13131f",border:"1px solid #6d4aff",borderRadius:8,color:"#e2d9f3",fontFamily:"inherit",fontSize:13,padding:10,resize:"none",outline:"none"}}/>
                <div style={{display:"flex",gap:6,marginTop:8}}>
                  <button onClick={()=>setEditingNotice(false)} style={{flex:1,background:"transparent",border:"1px solid #2a2a3a",color:"#666",borderRadius:8,padding:8,cursor:"pointer",fontFamily:"inherit",fontSize:12}}>취소</button>
                  <button onClick={()=>saveNotice(type,date,slot)} style={{flex:1,background:"#6d4aff",border:"none",color:"#fff",borderRadius:8,padding:8,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:700}}>저장</button>
                </div>
              </div>
            ) : (
              <p style={{fontSize:13,color:sd.notice?"#e2d9f3":"#333",fontStyle:sd.notice?"normal":"italic"}}>{sd.notice || "공지 없음"}</p>
            )}
          </div>

          <div style={{display:"flex",gap:4,marginBottom:6}}>
            {Array.from({length:max}).map((_,i) => (
              <div key={i} style={{flex:1,height:5,borderRadius:3,background:i<members.length?(isFull?"#ef4444":"#6d4aff"):"#1e1e30",transition:"background .3s"}}/>
            ))}
          </div>
          <div style={{fontSize:11,color:"#444",marginBottom:16,textAlign:"right"}}>남은 자리 <span style={{color:isFull?"#ef4444":"#a78bfa",fontWeight:700}}>{max-members.length}자리</span></div>

          <div style={{marginBottom:16}}>
            {(() => {
              const leader = members.find(m => m.isLeader);
              return (
                <div style={{marginBottom:12}}>
                  <p style={{fontSize:13,color:"#fbbf24",fontWeight:800,marginBottom:8,letterSpacing:2}}>👑 방장</p>
                  <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",borderRadius:12,
                    background:"rgba(251,191,36,.08)",border:"1px solid rgba(251,191,36,.3)"}}>
                    {leader ? (
                      <>
                        <div style={{width:36,height:36,borderRadius:10,background:"rgba(251,191,36,.15)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>👑</div>
                        <div style={{flex:1}}>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <span style={{fontWeight:800,color:"#fbbf24",fontSize:17}}>{leader.nick}</span>
                            {leader.job && <span style={{fontSize:13,color:"#e5e7eb",fontWeight:600}}>{leader.job}</span>}
                            {leader.nick===user?.nick && <span style={{background:"rgba(109,74,255,.2)",border:"1px solid #6d4aff",color:"#a78bfa",fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:20}}>나</span>}
                          </div>
                          {(() => { const uInfo = users.find(u => u.nick === leader.nick); return uInfo?.atul ? <div style={{fontSize:13,color:"#a78bfa",marginTop:4,fontWeight:600}}>아툴 {uInfo.atul}</div> : null; })()}
                        </div>
                      </>
                    ) : (
                      <span style={{color:"#333",fontSize:13,fontStyle:"italic"}}>아직 방장이 없습니다</span>
                    )}
                  </div>
                </div>
              );
            })()}

            {(() => {
              const partyCount = isPartySlot ? max - 1 : 7;
              const colMin = isPartySlot ? 90 : 130;
              return (
                <>
                  <p style={{fontSize:11,color:"#555",fontWeight:600,marginBottom:8,letterSpacing:1}}>
                    ⚔ 파티원 ({partyCount}자리){isPartySlot ? " · 직업 자유" : ""}
                  </p>
                  <div style={{display:"grid",gridTemplateColumns:`repeat(auto-fill,minmax(${colMin}px,1fr))`,gap:isPartySlot?6:8}}>
                    {Array.from({length:partyCount}).map((_,idx) => {
                      const nonLeaders = members.filter(m => !m.isLeader);
                      const m = nonLeaders[idx];
                      return (
                        <div key={idx} style={{
                          borderRadius:12,border:`1px solid ${m ? "#2a2a3a" : "#1a1a24"}`,
                          background: m ? "#0d0d18" : "#0a0a10",
                          padding:isPartySlot?"8px 6px":"12px 10px",position:"relative",minHeight:isPartySlot?68:88,
                          display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4
                        }}>
                          <span style={{position:"absolute",top:5,left:8,fontSize:9,color:"#333",fontWeight:700}}>#{idx+1}</span>
                          {m ? (
                            <>
                              <div style={{fontSize:isPartySlot?16:22}}>{renderClassIcon(m.job, isPartySlot?20:28)}</div>
                              <div style={{fontSize:isPartySlot?10:12,fontWeight:700,color:"#e2d9f3",textAlign:"center",lineHeight:1.3}}>{m.nick}</div>
                              {m.job && <div style={{fontSize:9,color:CLASS_COLORS[m.job]||"#555",fontWeight:600}}>{m.isExternal?`${m.job} (외)`:m.job}</div>}
                              {!m.isExternal && (() => { const uInfo = users.find(u => u.nick === m.nick); return uInfo?.atul ? <div style={{fontSize:9,color:"#a78bfa",fontWeight:600}}>아툴 {uInfo.atul}</div> : null; })()}
                              {m.nick===user?.nick && (
                                <span style={{fontSize:9,background:"rgba(109,74,255,.2)",border:"1px solid #6d4aff",color:"#a78bfa",padding:"1px 5px",borderRadius:10}}>나</span>
                              )}
                              {isLeader && m.nick!==user?.nick && (
                                <button onClick={e=>{e.stopPropagation();setKickConfirm({type,date,slot,nick:m.nick});}}
                                  style={{marginTop:2,background:"rgba(127,29,29,.4)",border:"1px solid #7f1d1d",color:"#fca5a5",borderRadius:6,padding:"2px 8px",cursor:"pointer",fontFamily:"inherit",fontSize:9,fontWeight:600}}>퇴출</button>
                              )}
                            </>
                          ) : (
                            <>
                              <div style={{fontSize:isPartySlot?16:20,opacity:0.15}}>＋</div>
                              <div style={{fontSize:isPartySlot?9:10,color:"#2a2a3a"}}>빈 자리</div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}

            {isLeader && !past && (
              <div style={{background:"#0a0a14",border:"1px solid #1e1e30",borderRadius:12,padding:12,marginTop:14}}>
                <p style={{fontSize:11,color:"#a78bfa",fontWeight:700,marginBottom:6}}>🔍 인원 검색 후 추가</p>
                <div style={{position:"relative",marginBottom:8}}>
                  <input
                    value={slotAddSearch}
                    onChange={e=>setSlotAddSearch(e.target.value)}
                    placeholder="닉네임 또는 직업으로 검색..."
                    style={{width:"100%",padding:"8px 10px 8px 30px",background:"#111120",border:"1px solid #1e1e30",borderRadius:8,color:"#e2d9f3",fontFamily:"inherit",fontSize:12,outline:"none"}}
                    onFocus={e=>e.target.style.borderColor="#6d4aff"}
                    onBlur={e=>e.target.style.borderColor="#1e1e30"}
                  />
                  <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:12}}>🔍</span>
                </div>
                {slotAddSearch && (
                  <div style={{maxHeight:160,overflowY:"auto",display:"grid",gap:4}}>
                    {users
                      .filter(u =>
                        (u.nick && u.nick.includes(slotAddSearch)) ||
                        (u.job && u.job.includes(slotAddSearch))
                      )
                      .slice(0,20)
                      .map(u => {
                        const alreadyIn = members.find(m => m.nick === u.nick);
                        return (
                          <div key={u.nick} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 8px",borderRadius:8,background:"#111120",border:"1px solid #1e1e30"}}>
                            <div style={{fontSize:12,color:"#e2d9f3"}}>
                              <span style={{fontWeight:600}}>{u.nick}</span>
                              {u.job && <span style={{marginLeft:6,fontSize:11,color:"#888"}}>{u.job}</span>}
                            </div>
                            <button
                              disabled={alreadyIn}
                              onClick={() => {
                                const max = maxOf(type);
                                if (members.length >= max) { showToast("인원이 마감되었습니다.", "#ef4444"); return; }
                                const sd2 = JSON.parse(JSON.stringify(schedules));
                                if (!sd2[type]) sd2[type] = {};
                                if (!sd2[type][date]) sd2[type][date] = {};
                                if (!sd2[type][date][slot]) sd2[type][date][slot] = {members:[], requiredClasses:[], pendingRequests:[], notice:""};
                                const slotData2 = sd2[type][date][slot];
                                if (slotData2.members.find(m => m.nick === u.nick)) {
                                  showToast("이미 참석 중인 유저입니다.", "#eab308"); return;
                                }
                                if (slotData2.members.length >= max) {
                                  showToast("인원이 마감되었습니다.", "#ef4444"); return;
                                }
                                slotData2.members.push({nick:u.nick, job:u.job, isLeader:false, classes:[]});
                                setSchedules({...sd2});
                                persist(users, sd2);
                                showToast(`${u.nick} 추가 완료!`, "#22c55e");
                              }}
                              style={{
                                padding:"4px 10px",
                                borderRadius:6,
                                border:"1px solid " + (alreadyIn ? "#1f2933" : "#22c55e"),
                                background: alreadyIn ? "transparent" : "rgba(34,197,94,.12)",
                                color: alreadyIn ? "#555" : "#22c55e",
                                cursor: alreadyIn ? "default" : "pointer",
                                fontFamily:"inherit",
                                fontSize:11,
                                fontWeight:700
                              }}
                            >
                              {alreadyIn ? "참석중" : "추가"}
                            </button>
                          </div>
                        );
                      })}
                    {users.filter(u =>
                      (u.nick && u.nick.includes(slotAddSearch)) ||
                      (u.job && u.job.includes(slotAddSearch))
                    ).length === 0 && (
                      <div style={{fontSize:11,color:"#444",padding:"6px 2px"}}>검색 결과가 없습니다.</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 레기온외 인원 추가 폼 */}
          {isLeader && !past && (
            <div style={{marginBottom:12}}>
              {externalForm ? (
                <div style={{background:"#0a0a14",border:"1px solid #2a2a3a",borderRadius:12,padding:12}}>
                  <p style={{fontSize:11,color:"#a78bfa",fontWeight:700,marginBottom:8}}>➕ 레기온외 인원 추가</p>
                  <div style={{display:"flex",gap:8,marginBottom:8}}>
                    <input value={externalForm.nick} onChange={e=>setExternalForm({...externalForm,nick:e.target.value})}
                      placeholder="이름" style={{flex:2,padding:"8px 10px",background:"#111120",border:"1px solid #2a2a3a",borderRadius:8,color:"#e2d9f3",fontFamily:"inherit",fontSize:12,outline:"none"}}
                      onFocus={e=>e.target.style.borderColor="#6d4aff"} onBlur={e=>e.target.style.borderColor="#2a2a3a"}/>
                    <input value={externalForm.job} onChange={e=>setExternalForm({...externalForm,job:e.target.value})}
                      placeholder="클래스" style={{flex:1,padding:"8px 10px",background:"#111120",border:"1px solid #2a2a3a",borderRadius:8,color:"#e2d9f3",fontFamily:"inherit",fontSize:12,outline:"none"}}
                      onFocus={e=>e.target.style.borderColor="#6d4aff"} onBlur={e=>e.target.style.borderColor="#2a2a3a"}/>
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>setExternalForm(null)} style={{flex:1,padding:"8px",borderRadius:8,border:"1px solid #2a2a3a",background:"transparent",color:"#666",cursor:"pointer",fontFamily:"inherit",fontSize:12}}>취소</button>
                    <button onClick={()=>handleAddExternal(type,date,slot)} style={{flex:1,padding:"8px",borderRadius:8,border:"none",background:"#6d4aff",color:"#fff",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:700}}>추가</button>
                  </div>
                </div>
              ) : (
                <button onClick={()=>setExternalForm({nick:"",job:""})} style={{width:"100%",padding:"10px",borderRadius:10,border:"1px dashed #2a2a3a",background:"transparent",color:"#555",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:600,transition:"all .2s"}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor="#6d4aff";e.currentTarget.style.color="#a78bfa";}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor="#2a2a3a";e.currentTarget.style.color="#555";}}>
                  ➕ 레기온외 인원 추가
                </button>
              )}
            </div>
          )}

          {/* 방장 전용: 대기자 승인/거절 */}
          {isLeader && pending.length > 0 && (
            <div style={{background:"#0a0a14",border:"1px solid #4a1a7a",borderRadius:12,padding:12,marginBottom:14}}>
              <p style={{fontSize:12,color:"#a78bfa",fontWeight:700,marginBottom:8}}>✋ 참가 대기중 ({pending.length}명)</p>
              <div style={{display:"grid",gap:6}}>
                {pending.map(p => (
                  <div key={p.nick} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 10px",borderRadius:8,background:"#111120",border:"1px solid #2a2a3a"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{fontSize:20}}>{renderClassIcon(p.job, 24)}</div>
                      <div>
                        <div style={{fontSize:12,fontWeight:700,color:"#e2d9f3"}}>{p.nick}</div>
                        {p.job && <div style={{fontSize:10,color:CLASS_COLORS[p.job]||"#555"}}>{p.job}</div>}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={()=>handleApprove(type,date,slot,p.nick)}
                        style={{padding:"5px 10px",borderRadius:6,border:"none",background:"rgba(34,197,94,.15)",color:"#22c55e",cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:700}}>승인</button>
                      <button onClick={()=>handleReject(type,date,slot,p.nick)}
                        style={{padding:"5px 10px",borderRadius:6,border:"none",background:"rgba(239,68,68,.1)",color:"#ef4444",cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:700}}>거절</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mobile-col" style={{display:"flex",gap:8}}>
            {!isMine && !isFull && !past && (
              <button onClick={()=>handleRequestJoin(type,date,slot)} style={{flex:1,padding:"13px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#6d4aff,#a78bfa)",color:"#fff",fontFamily:"inherit",fontSize:14,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 16px rgba(109,74,255,.4)"}}>
                🏠 방 생성
              </button>
            )}
            {isMine && (
              <>
                <button onClick={()=>handleLeave(type,date,slot)} style={{flex:1,padding:"13px",borderRadius:12,border:"1px solid #7f1d1d",background:"rgba(127,29,29,.3)",color:"#fca5a5",fontFamily:"inherit",fontSize:14,fontWeight:700,cursor:"pointer"}}>
                  ✕ 참석 취소
                </button>
                <button onClick={()=>setNamedGroupModal({type,date,slot})} style={{flex:1,padding:"13px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#15803d,#22c55e)",color:"#fff",fontFamily:"inherit",fontSize:14,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 16px rgba(34,197,94,.35)"}}>
                  🎯 파티분배
                </button>
              </>
            )}
            {!isMine && user?.isAdmin && members.length > 0 && (
              <button onClick={()=>setNamedGroupModal({type,date,slot})} style={{flex:1,padding:"13px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#15803d,#22c55e)",color:"#fff",fontFamily:"inherit",fontSize:14,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 16px rgba(34,197,94,.35)"}}>
                🎯 파티분배
              </button>
            )}
            {isFull && !isMine && (
              <div style={{flex:1,padding:"13px",borderRadius:12,background:"rgba(239,68,68,.08)",border:"1px solid #7f1d1d",color:"#ef4444",textAlign:"center",fontSize:13,fontWeight:700}}>🔴 마감된 시간대입니다</div>
            )}
          </div>
          {past && (
            <div style={{padding:"13px",borderRadius:12,background:"#0a0a0a",border:"1px solid #1a1a1a",color:"#333",textAlign:"center",fontSize:13}}>⏱ 종료된 시간대입니다</div>
          )}
        </div>
      </div>
    );
  };

  const renderAdmin = () => {
    const filteredUsers = adminSearchQuery
      ? users.filter(u => u.nick.includes(adminSearchQuery) || u.job?.includes(adminSearchQuery))
      : users;

    return (
      <div>
        <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap",alignItems:"center"}}>
          {["users","schedule"].map(v => (
            <button key={v} onClick={()=>setAdminView(v)} style={{padding:"8px 18px",borderRadius:8,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:600,background:adminView===v?"#6d4aff":"#13131f",color:adminView===v?"#fff":"#666",transition:"all .2s"}}>
              {v==="users"?"👥 유저 목록":"📅 스케줄 현황"}
            </button>
          ))}
        </div>

        {adminView==="users" && (
          <div>
            <div style={{background:"#111120",border:"1px solid #1e1e30",borderRadius:14,padding:14,marginBottom:16,display:"flex",flexWrap:"wrap",gap:12,alignItems:"flex-end"}}>
              <div style={{flex:1,minWidth:180}}>
                <label style={{display:"block",fontSize:11,color:"#555",marginBottom:4}}>레이드 이름 1</label>
                <input
                  value={raidNames.primary}
                  onChange={e=>setRaidNames(r=>({...r, primary:e.target.value}))}
                  style={{width:"100%",padding:"8px 10px",background:"#0a0a14",border:"1px solid #1e1e30",borderRadius:8,color:"#e2d9f3",fontFamily:"inherit",fontSize:12}}
                />
              </div>
              <div style={{flex:1,minWidth:180}}>
                <label style={{display:"block",fontSize:11,color:"#555",marginBottom:4}}>레이드 이름 2</label>
                <input
                  value={raidNames.secondary}
                  onChange={e=>setRaidNames(r=>({...r, secondary:e.target.value}))}
                  style={{width:"100%",padding:"8px 10px",background:"#0a0a14",border:"1px solid #1e1e30",borderRadius:8,color:"#e2d9f3",fontFamily:"inherit",fontSize:12}}
                />
              </div>
              <div style={{flexBasis:180}}>
                <label style={{display:"block",fontSize:11,color:"#555",marginBottom:4}}>관리자 패스코드</label>
                <input
                  value={adminCode}
                  onChange={e=>setAdminCode(e.target.value.toUpperCase())}
                  style={{width:"100%",padding:"8px 10px",background:"#0a0a14",border:"1px solid #1e1e30",borderRadius:8,color:"#e2d9f3",fontFamily:"inherit",fontSize:12,letterSpacing:4}}
                />
              </div>
              <button
                onClick={handleSaveAdminSettings}
                className="mobile-btn"
                style={{padding:"9px 16px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#6d4aff,#a78bfa)",color:"#fff",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:700,whiteSpace:"nowrap"}}
              >
                설정 저장
              </button>
            </div>

            <div style={{display:"flex",gap:8,marginBottom:12,alignItems:"center"}}>
              <div style={{position:"relative",flex:1}}>
                <input value={adminSearchQuery} onChange={e=>setAdminSearchQuery(e.target.value)} placeholder="닉네임 또는 직업으로 검색..."
                  style={{width:"100%",padding:"10px 14px 10px 38px",background:"#111120",border:"1px solid #1e1e30",borderRadius:10,color:"#e2d9f3",fontFamily:"inherit",fontSize:13,outline:"none"}}
                  onFocus={e=>e.target.style.borderColor="#6d4aff"} onBlur={e=>e.target.style.borderColor="#1e1e30"}/>
                <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:14}}>🔍</span>
              </div>
              <button onClick={downloadUsersTxt} style={{
                padding:"10px 16px",borderRadius:10,border:"1px solid #22c55e",background:"rgba(34,197,94,.1)",
                color:"#22c55e",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:700,whiteSpace:"nowrap",flexShrink:0
              }}>📄 TXT 저장</button>
            </div>
            <p style={{color:"#444",fontSize:12,marginBottom:12}}>총 {users.length}명 ({filteredUsers.length}명 표시)</p>
            {filteredUsers.length===0 && <div style={{textAlign:"center",padding:40,color:"#2a2a3a"}}>검색 결과 없음</div>}
            <div style={{display:"grid",gap:8}}>
              {(() => {
                const nowMs = Date.now();
                const sorted = [...filteredUsers].sort((a,b) => {
                  const aExp = a.codeExpiresAt ? new Date(a.codeExpiresAt).getTime() : 0;
                  const bExp = b.codeExpiresAt ? new Date(b.codeExpiresAt).getTime() : 0;
                  const aActive = a.accessCode && aExp > nowMs;
                  const bActive = b.accessCode && bExp > nowMs;
                  if (aActive && bActive) return aExp - bExp;
                  if (aActive && !bActive) return -1;
                  if (!aActive && bActive) return 1;
                  return (a.nick || "").localeCompare(b.nick || "");
                });
                return sorted.map(u => {
                const nowMs = Date.now();
                const expMs = u.codeExpiresAt ? new Date(u.codeExpiresAt).getTime() : 0;
                const hasActiveCode = !!(u.accessCode && expMs && expMs > nowMs);
                const expLabel = hasActiveCode ? new Date(u.codeExpiresAt).toLocaleDateString("ko-KR", { month:"2-digit", day:"2-digit"}) : null;
                return (
                  <div key={u.nick} style={{background:"#111120",border:"1px solid #1e1e30",borderRadius:14,padding:"14px 16px",display:"flex",alignItems:"center",flexWrap:"wrap",gap:12}}>
                    <div style={{flex:1,display:"flex",alignItems:"center",gap:12}}>
                      <div style={{width:38,height:38,borderRadius:10,background:"linear-gradient(135deg,#1a1f2e,#2a2a3a)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>👤</div>
                      <div>
                        <div style={{fontWeight:700,color:"#c4b5fd",fontSize:14}}>{u.nick}</div>
                        <div style={{fontSize:12,color:"#555",marginTop:1}}>{u.job||"직업 미등록"}</div>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
                      <div style={{fontSize:12,color:"#555"}}>아툴 <span style={{color:"#a78bfa",fontWeight:600}}>{u.atul||"-"}</span></div>
                      <div style={{fontSize:12,color:"#555"}}>아이템Lv <span style={{color:"#a78bfa",fontWeight:600}}>{u.ilv||"-"}</span></div>
                      <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                        <div style={{fontSize:11,color:hasActiveCode?"#22c55e":"#555",fontWeight:700}}>
                          {hasActiveCode ? `ON · ${u.accessCode}` : "OFF"}
                        </div>
                        {hasActiveCode && expLabel && (
                          <div style={{fontSize:10,color:"#888"}}>만료: {expLabel}</div>
                        )}
                        <button
                          onClick={() => hasActiveCode ? handleDeleteAccessCode(u.nick) : handleGenerateAccessCode(u.nick)}
                          style={{
                            marginTop:2,
                            padding:"5px 10px",
                            borderRadius:8,
                            border:"1px solid " + (hasActiveCode ? "#7f1d1d" : "#22c55e"),
                            background: hasActiveCode ? "rgba(127,29,29,.4)" : "rgba(34,197,94,.12)",
                            color: hasActiveCode ? "#fca5a5" : "#22c55e",
                            cursor:"pointer",
                            fontFamily:"inherit",
                            fontSize:11,
                            fontWeight:700,
                            whiteSpace:"nowrap"
                          }}
                        >
                          {hasActiveCode ? "코드삭제" : "코드생성"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              });
              })()}
            </div>
          </div>
        )}

        {adminView==="schedule" && (
          <div>
            {adminAddTarget && (
              <div style={{background:"rgba(109,74,255,.08)",border:"1px solid #6d4aff",borderRadius:14,padding:16,marginBottom:16}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <span style={{fontSize:13,color:"#a78bfa",fontWeight:700}}>
                    📥 {adminAddTarget.slot.startsWith("party-") ? `${adminAddTarget.slot.replace("party-","")}포스` : adminAddTarget.slot.includes('#') ? `${getBaseSlot(adminAddTarget.slot)} · ${adminAddTarget.slot.split('#')[1]}번` : adminAddTarget.slot} 에 유저 추가
                  </span>
                  <button onClick={()=>{setAdminAddTarget(null);setAdminSearchQuery("");}} style={{background:"transparent",border:"none",color:"#555",cursor:"pointer",fontSize:14}}>✕</button>
                </div>
                <div style={{position:"relative",marginBottom:10}}>
                  <input value={adminSearchQuery} onChange={e=>setAdminSearchQuery(e.target.value)} placeholder="닉네임으로 검색..."
                    style={{width:"100%",padding:"9px 14px 9px 36px",background:"#0a0a14",border:"1px solid #2a2a3a",borderRadius:8,color:"#e2d9f3",fontFamily:"inherit",fontSize:13,outline:"none"}}
                    onFocus={e=>e.target.style.borderColor="#6d4aff"} onBlur={e=>e.target.style.borderColor="#2a2a3a"}/>
                  <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:13}}>🔍</span>
                </div>
                {adminSearchQuery && (
                  <div style={{maxHeight:180,overflowY:"auto",display:"grid",gap:4}}>
                    {users.filter(u=>u.nick.includes(adminSearchQuery)||u.job?.includes(adminSearchQuery)).map(u=>(
                      <div key={u.nick} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",background:"#111120",borderRadius:8,border:"1px solid #1e1e30"}}>
                        <div>
                          <span style={{fontWeight:600,color:"#c4b5fd",fontSize:13}}>{u.nick}</span>
                          {u.job&&<span style={{fontSize:11,color:"#555",marginLeft:6}}>{u.job}</span>}
                        </div>
                        <button onClick={()=>handleAdminAdd(adminAddTarget.type,adminAddTarget.date,adminAddTarget.slot,u.nick)}
                          style={{background:"#6d4aff",border:"none",color:"#fff",borderRadius:6,padding:"4px 12px",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:700}}>추가</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {["성역","성역2","추가"].map(type => (
              <div key={type} style={{marginBottom:28}}>
                <h3 style={{color:"#a78bfa",marginBottom:14,fontSize:15,fontWeight:700,paddingBottom:8,borderBottom:"1px solid #1e1e30"}}>
                  {type==="추가"
                    ? "➕ 추가모집 스케줄"
                    : `⚔️ ${(type==="성역" ? raidNames.primary : raidNames.secondary)||type} 스케줄`}
                </h3>
                {DATE_RANGE.map(d => {
                  const ds = fmtDate(d);
                  const {short, wd} = fmtLabel(d);
                  const dayData = Object.entries(schedules[type]?.[ds]||{}).filter(([slot,sd])=>{
                    if(!sd.members?.length) return false;
                    if(type==="추가") return ds>=TODAY_STR; // 추가모집: 오늘 이전 날짜 숨김
                    return !isSlotPast(ds, getBaseSlot(slot)); // 성역/성역2: 지난 시간 슬롯 숨김
                  }).sort();
                  if (dayData.length===0) return null;
                  return (
                    <div key={ds} style={{marginBottom:14}}>
                      <div style={{fontSize:12,color:"#444",marginBottom:8,display:"flex",alignItems:"center",gap:8}}>
                        <span style={{color:"#555",fontWeight:600}}>{short} {wd}요일</span>
                        {ds===TODAY_STR&&<span style={{background:"rgba(109,74,255,.2)",color:"#a78bfa",fontSize:10,padding:"1px 6px",borderRadius:20}}>오늘</span>}
                      </div>
                      {dayData.map(([slot, sd]) => {
                        const displaySlot = slot.startsWith("party-")
                          ? `${slot.replace("party-","")}포스`
                          : slot.includes('#')
                            ? `${getBaseSlot(slot)} · ${slot.split('#')[1]}번`
                            : slot;
                        return (
                        <div key={slot} style={{background:"#0d0d18",border:"1px solid #1e1e30",borderRadius:12,padding:"12px 16px",marginBottom:8}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                            <div style={{display:"flex",alignItems:"center",gap:10}}>
                              <span style={{fontWeight:700,color:"#c4b5fd",fontSize:14}}>{displaySlot}</span>
                              <span style={{fontSize:12,color:sd.members.length>=maxOf(type)?"#ef4444":"#22c55e",fontWeight:600}}>
                                {sd.members.length}/{maxOf(type)} {sd.members.length>=maxOf(type)?"마감":"모집중"}
                              </span>
                            </div>
                            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                              <button onClick={()=>{setAdminAddTarget({type,date:ds,slot});setAdminSearchQuery("");setAdminView("schedule");}}
                                style={{background:"rgba(109,74,255,.2)",border:"1px solid #6d4aff",color:"#a78bfa",borderRadius:8,padding:"4px 10px",cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:600}}>+ 추가</button>
                              <button onClick={()=>setNamedGroupModal({type,date:ds,slot})}
                                style={{background:"rgba(34,197,94,.12)",border:"1px solid rgba(34,197,94,.4)",color:"#4ade80",borderRadius:8,padding:"4px 10px",cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:600}}>🏠 파티분배</button>
                              <button onClick={()=>{ if(window.confirm(`${displaySlot} 전체 강퇴?`)) handleAdminClearSlot(type,ds,slot); }}
                                style={{background:"rgba(127,29,29,.3)",border:"1px solid #7f1d1d",color:"#fca5a5",borderRadius:8,padding:"4px 10px",cursor:"pointer",fontFamily:"inherit",fontSize:11}}>전체강퇴</button>
                            </div>
                          </div>
                          {sd.notice&&<p style={{fontSize:11,color:"#fbbf24",marginBottom:8}}>📌 {sd.notice}</p>}
                          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                            {sd.members.map(m=>{
                              const uInfo = users.find(u => u.nick === m.nick);
                              return (
                                <div key={m.nick} style={{position:"relative",background:"#13131f",border:`1px solid ${m.isLeader?"rgba(251,191,36,.4)":"#2a2a3a"}`,borderRadius:10,padding:"6px 10px 4px",fontSize:12,display:"flex",flexDirection:"column",alignItems:"center",gap:1}}>
                                  {/* 개별 강퇴 버튼 */}
                                  <button
                                    onClick={()=>setKickConfirm({type,date:ds,slot,nick:m.nick})}
                                    title={`${m.nick} 강퇴`}
                                    style={{position:"absolute",top:-6,right:-6,width:16,height:16,borderRadius:"50%",background:"#7f1d1d",border:"1px solid #ef4444",color:"#fca5a5",cursor:"pointer",fontFamily:"inherit",fontSize:9,display:"flex",alignItems:"center",justifyContent:"center",padding:0,lineHeight:1,zIndex:1}}
                                  >✕</button>
                                  <div style={{display:"flex",alignItems:"center",gap:4}}>
                                    {m.isLeader&&<span style={{color:"#fbbf24"}}>👑</span>}
                                    <span style={{color:m.isLeader?"#fbbf24":"#c4b5fd",fontWeight:m.isLeader?700:500}}>{m.nick}</span>
                                    {m.job&&<span style={{color:"#555",fontSize:10}}>{m.job}</span>}
                                  </div>
                                  {uInfo?.atul&&<span style={{color:"#a78bfa",fontSize:9}}>아툴 {uInfo.atul}</span>}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                      })}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderShareView = () => {
    const raidTypes = ["성역","성역2","추가"];

    const formatDisplayDate = (d) => {
      const ds = fmtDate(d);
      const { short, wd } = fmtLabel(d);
      return { ds, label: `${short} (${wd})` };
    };

    const getUserInfo = (nick) => users.find(u => u.nick === nick);

    const calcAvgAtul = (group) => {
      const nums = group
        .map(m => {
          const info = getUserInfo(m.nick);
          if (!info?.atul) return null;
          const v = parseInt(String(info.atul).replace(/,/g,""), 10);
          return Number.isFinite(v) && v > 0 ? v : null;
        })
        .filter(v => v !== null);
      if (nums.length === 0) return null;
      const avg = Math.round(nums.reduce((a,b) => a + b, 0) / nums.length);
      return avg.toLocaleString("ko-KR");
    };

    return (
      <div style={{maxWidth:1160,margin:"0 auto",padding:"20px 12px 40px"}} className="share-container">
        <div style={{textAlign:"center",marginBottom:24}}>
          <h1 className="share-title" style={{fontWeight:900,color:"#c4b5fd",letterSpacing:2,marginBottom:8}}>KINA일정 대시보드</h1>
          <p style={{fontSize:13,color:"#6b7280"}}>접속 코드 없이 이번 주 공대 구성을 한눈에 보는 공유용 화면입니다.</p>
        </div>

        {DATE_RANGE.map(d => {
          const { ds, label } = formatDisplayDate(d);
          const hasAny = raidTypes.some(t => {
            const dayEntries = Object.values(schedules[t]?.[ds] || {});
            return dayEntries.some(sd => sd.members?.length > 0);
          });
          if (!hasAny || ds < TODAY_STR) return null;

          return (
            <div key={ds} className="share-day-card" style={{marginBottom:24,borderRadius:20,background:"radial-gradient(circle at 0 0,rgba(88,28,135,.3),transparent 55%) #050816",border:"1px solid #111827",padding:20,boxShadow:"0 18px 60px rgba(0,0,0,.65)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div>
                  <div style={{fontSize:12,color:"#6b7280",marginBottom:2}}>레이드 날짜</div>
                  <div className="share-date-label" style={{fontSize:18,fontWeight:700,color:"#e5e7eb"}}>{label}</div>
                </div>
                {ds === TODAY_STR && (
                  <div style={{fontSize:11,color:"#facc15",background:"rgba(250,204,21,.08)",border:"1px solid rgba(250,204,21,.4)",padding:"4px 10px",borderRadius:999}}>
                    오늘 진행
                  </div>
                )}
              </div>

              <div style={{display:"grid",gridTemplateColumns:"1fr",gap:18}}>
                {raidTypes.map(type => {
                  const isExtra = type === "추가";
                  const rawEntries = Object.entries(schedules[type]?.[ds] || {})
                    .filter(([, sd]) => sd.members?.length > 0);
                  const dayData = isExtra
                    ? rawEntries.sort() 
                    : rawEntries.sort(([aSlot],[bSlot]) => aSlot.localeCompare(bSlot));
                  if (dayData.length === 0) return null;

                  const title = type === "성역"
                    ? (raidNames.primary || "성역")
                    : type === "성역2"
                      ? (raidNames.secondary || "성역2")
                      : "추가모집";

                  return (
                    <div key={type} className="share-type-card" style={{borderRadius:20,background:"#020617",border:"1px solid #111827",padding:18}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                        <div style={{fontSize:15,fontWeight:800,color:"#a5b4fc"}}>⚔️ {title}</div>
                        <div style={{fontSize:12,color:"#6b7280"}}>{dayData.length}개 {isExtra ? "파티" : "시간대"}</div>
                      </div>

                      <div style={{display:"grid",gap:12}}>
                        {dayData.map(([slot, sd]) => {
                          const members = sd.members || [];
                          const leader = members.find(m => m.isLeader);
                          // party-N → N포스, "20:00#2" → "20:00 (2번)" 변환
                          const dispSlot = slot.startsWith("party-")
                            ? `${slot.replace("party-","")}포스`
                            : slot.includes('#')
                              ? `${getBaseSlot(slot)} (${slot.split('#')[1]}번)`
                              : slot;
                          const rawGroups = sd.namedGroups || {};
                          // 추가모집: party1~4 키, 성역류: group1~2 키
                          const displayGroups = isExtra
                            ? [
                                { label:"1파티", nicks: rawGroups.party1 || [] },
                                { label:"2파티", nicks: rawGroups.party2 || [] },
                                { label:"3파티", nicks: rawGroups.party3 || [] },
                                { label:"4파티", nicks: rawGroups.party4 || [] },
                              ]
                            : [
                                { label:"1파티", nicks: rawGroups.group1 || [] },
                                { label:"2파티", nicks: rawGroups.group2 || [] },
                              ];
                          const byNick = Object.fromEntries(members.map(m => [m.nick, m]));
                          const grouped = new Set(displayGroups.flatMap(g => g.nicks));
                          const unassigned = members.filter(m => !grouped.has(m.nick));
                          const isPast = !isExtra && !slot.startsWith("party-") ? isSlotPast(ds, getBaseSlot(slot)) : false;

                          // 대시보드 사용자 목록: 아이디 / 직업만 렌더링 (외부 인원은 이름+클래스만 표시)
                          const renderPerson = (m) => {
                            if (!m) return null;
                            return (
                              <div key={m.nick} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0"}}>
                                <div style={{display:"flex",alignItems:"center",gap:6}}>
                                  {m.isLeader && <span style={{color:"#fbbf24",fontSize:12}}>👑</span>}
                                  <span className="share-nick" style={{color:m.isExternal?"#9ca3af":m.isLeader?"#fef9c3":"#e5e7eb",fontWeight:m.isLeader?700:500,fontSize:13}}>{m.nick}{m.isExternal?" (외)":""}</span>
                                </div>
                                {m.job && <span style={{color:CLASS_COLORS[m.job]||"#9ca3af",fontSize:11,borderLeft:"1px solid #374151",paddingLeft:8}}>{m.job}</span>}
                              </div>
                            );
                          };

                          return (
                            <div key={slot} className="share-slot-card" style={{
                              borderRadius:18,
                              background:"radial-gradient(circle at 0 0,rgba(79,70,229,.25),transparent 55%) #020617",
                              border:"1px solid #111827",
                              padding:14,
                              opacity:isPast?0.45:1
                            }}>
                              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:sd.notice?6:10}}>
                                <div>
                                  <div style={{fontSize:12,color:"#64748b"}}>{isExtra ? "파티명" : "시작 시간"}</div>
                                  <div className="share-slot-time" style={{fontSize:18,fontWeight:800,color:"#e5e7eb"}}>{dispSlot}</div>
                                </div>
                                <div style={{textAlign:"right"}}>
                                  <div style={{fontSize:12,color:"#64748b"}}>인원</div>
                                  <div style={{fontSize:13,fontWeight:700,color:isPast?"#9ca3af":members.length>=maxOf(type)?"#f97373":"#4ade80"}}>
                                    {members.length}/{maxOf(type)} {isPast || members.length>=maxOf(type)?"마감":"모집중"}
                                  </div>
                                </div>
                              </div>
                              {sd.notice && (
                                <div style={{display:"flex",alignItems:"flex-start",gap:6,background:"rgba(251,191,36,.06)",border:"1px solid rgba(251,191,36,.25)",borderRadius:8,padding:"6px 10px",marginBottom:10,fontSize:12,color:"#fde68a",lineHeight:1.5}}>
                                  <span style={{flexShrink:0}}>📌</span>
                                  <span>{sd.notice}</span>
                                </div>
                              )}

                              <div className="mobile-grid-1" style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:10,marginTop:4}}>
                                {displayGroups.map(party => {
                                  const group = party.nicks.map(n => byNick[n]).filter(Boolean);
                                  const avg = calcAvgAtul(group);
                                  return (
                                    <div key={party.label} className="share-party-card" style={{borderRadius:14,background:"#020617",border:"1px solid #111827",padding:10}}>
                                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:4,marginBottom:6}}>
                                        <div style={{fontSize:12,color:"#e5e7eb",fontWeight:700}}>{party.label}</div>
                                        <div style={{fontSize:11,color:avg?"#38bdf8":"#4b5563"}}>
                                          {avg ? `아툴 평균 ${avg}` : "아툴 정보 없음"}
                                        </div>
                                      </div>
                                      {group.length > 0 ? group.map(renderPerson) : (
                                        <div style={{fontSize:11,color:"#374151"}}>배정 없음</div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>

                              {unassigned.length > 0 && (
                                <div style={{marginTop:8,paddingTop:8,borderTop:"1px dashed #111827"}}>
                                  <div style={{fontSize:11,color:"#6b7280",marginBottom:2}}>미배치</div>
                                  {unassigned.map(renderPerson)}
                                </div>
                              )}

                              {/* 신청하기 버튼 (마감·종료 아닌 경우에만) */}
                              {!isPast && members.length < maxOf(type) && (
                                <button
                                  onClick={()=>setJoinRequestModal({type, date:ds, slot, applicant:null})}
                                  style={{
                                    width:"100%", marginTop:10, padding:"9px 0",
                                    borderRadius:10, border:"1px solid #4a2a7a",
                                    background:"rgba(124,58,237,.12)", color:"#a78bfa",
                                    cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:700,
                                    transition:"all .2s"
                                  }}
                                  onMouseEnter={e=>{e.currentTarget.style.background="rgba(124,58,237,.25)";e.currentTarget.style.borderColor="#7c3aed";}}
                                  onMouseLeave={e=>{e.currentTarget.style.background="rgba(124,58,237,.12)";e.currentTarget.style.borderColor="#4a2a7a";}}>
                                  ✋ 참가 신청
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderJoinRequestModal = () => {
    if (!joinRequestModal) return null;
    const {type, date, slot, applicant: selectedApplicant} = joinRequestModal;
    const sd = getSlotData(schedules, type, date, slot);
    const members = sd.members || [];
    const leader = members.find(m => m.isLeader);
    const max = maxOf(type);
    const dObj = DATE_RANGE.find(d => fmtDate(d) === date);
    const {short, wd} = dObj ? fmtLabel(dObj) : {short:date, wd:""};
    const isPartySlot = slot?.startsWith("party-");
    const slotLabel = isPartySlot
      ? slot.replace("party-","")+"포스"
      : slot.includes('#') ? `${getBaseSlot(slot)} · ${slot.split('#')[1]}번 파티` : slot;

    // 로그인 상태면 user 사용, share view(비로그인)면 검색으로 선택
    const confirmedApplicant = user ? { nick: user.nick, job: user.job || "" } : selectedApplicant;

    const closeModal = () => { setJoinRequestModal(null); setShareJoinSearch(""); };

    return (
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.92)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:16}}
        onClick={e=>{if(e.target===e.currentTarget)closeModal();}}>
        <div className="mobile-modal" style={{background:"#111120",border:"1px solid #7c3aed55",borderRadius:20,padding:24,maxWidth:420,width:"100%"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <h3 style={{fontSize:16,fontWeight:700,color:"#a78bfa"}}>✋ 참가 신청</h3>
            <button onClick={closeModal} style={{background:"transparent",border:"1px solid #2a2a3a",color:"#666",borderRadius:8,padding:"5px 11px",cursor:"pointer",fontFamily:"inherit"}}>✕</button>
          </div>

          {/* 신청 대상 방 정보 */}
          <div style={{background:"#0a0a14",borderRadius:12,padding:12,marginBottom:12,border:"1px solid #1e1e30"}}>
            <div style={{fontSize:11,color:"#555",marginBottom:4}}>신청할 방</div>
            <div style={{fontSize:15,fontWeight:700,color:"#e2d9f3"}}>{slotLabel}</div>
            <div style={{fontSize:12,color:"#666",marginTop:2}}>{short} ({wd}) · {members.length}/{max}명</div>
            {leader && <div style={{fontSize:12,color:"#fbbf24",marginTop:4}}>👑 방장: {leader.nick}</div>}
            {sd.notice && (
              <div style={{fontSize:11,color:"#fde68a",marginTop:6,padding:"5px 8px",background:"rgba(251,191,36,.06)",borderRadius:6,border:"1px solid rgba(251,191,36,.15)"}}>
                📌 {sd.notice}
              </div>
            )}
          </div>

          {/* share view: 캐릭터 검색 단계 */}
          {!user && !confirmedApplicant && (
            <div style={{background:"#0a0a14",borderRadius:12,padding:12,marginBottom:14,border:"1px solid #1e1e30"}}>
              <div style={{fontSize:11,color:"#a78bfa",fontWeight:700,marginBottom:8}}>🔍 내 캐릭터 검색</div>
              <div style={{position:"relative",marginBottom:8}}>
                <input
                  value={shareJoinSearch}
                  onChange={e=>setShareJoinSearch(e.target.value)}
                  placeholder="닉네임 또는 직업으로 검색..."
                  autoFocus
                  style={{width:"100%",padding:"8px 10px 8px 30px",background:"#111120",border:"1px solid #2a2a3a",borderRadius:8,color:"#e2d9f3",fontFamily:"inherit",fontSize:12,outline:"none"}}
                  onFocus={e=>e.target.style.borderColor="#7c3aed"}
                  onBlur={e=>e.target.style.borderColor="#2a2a3a"}
                />
                <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:12}}>🔍</span>
              </div>
              {shareJoinSearch && (
                <div style={{maxHeight:180,overflowY:"auto",display:"grid",gap:4}}>
                  {users.filter(u =>
                    (u.nick?.includes(shareJoinSearch)) || (u.job?.includes(shareJoinSearch))
                  ).slice(0,15).map(u => {
                    const alreadyIn = members.find(m => m.nick === u.nick);
                    const alreadyPending = sd.pendingRequests?.find(m => m.nick === u.nick);
                    return (
                      <div key={u.nick} onClick={() => {
                        if (alreadyIn || alreadyPending) return;
                        setJoinRequestModal({...joinRequestModal, applicant: {nick:u.nick, job:u.job||""}});
                        setShareJoinSearch("");
                      }} style={{
                        display:"flex",alignItems:"center",justifyContent:"space-between",
                        padding:"7px 10px",borderRadius:8,border:"1px solid #1e1e30",
                        background: alreadyIn || alreadyPending ? "#0a0a0a" : "#111120",
                        cursor: alreadyIn || alreadyPending ? "default" : "pointer",
                        opacity: alreadyIn || alreadyPending ? 0.5 : 1
                      }}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <div style={{fontSize:16}}>{renderClassIcon(u.job, 20)}</div>
                          <div>
                            <div style={{fontSize:12,fontWeight:700,color:"#e2d9f3"}}>{u.nick}</div>
                            {u.job && <div style={{fontSize:10,color:CLASS_COLORS[u.job]||"#555"}}>{u.job}</div>}
                          </div>
                        </div>
                        <span style={{fontSize:10,color:alreadyIn?"#22c55e":alreadyPending?"#a78bfa":"#555"}}>
                          {alreadyIn ? "참석중" : alreadyPending ? "대기중" : "선택"}
                        </span>
                      </div>
                    );
                  })}
                  {users.filter(u=>(u.nick?.includes(shareJoinSearch))||(u.job?.includes(shareJoinSearch))).length===0 && (
                    <div style={{fontSize:11,color:"#444",padding:"6px 2px"}}>검색 결과가 없습니다.</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 캐릭터 확인 (로그인 상태 or 검색으로 선택 완료) */}
          {confirmedApplicant && (
            <div style={{background:"#0a0a14",borderRadius:12,padding:12,marginBottom:16,border:"1px solid #1e1e30"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                <div style={{fontSize:11,color:"#555"}}>신청 캐릭터</div>
                {!user && (
                  <button onClick={()=>{setJoinRequestModal({...joinRequestModal,applicant:null});setShareJoinSearch("");}}
                    style={{fontSize:10,color:"#6d4aff",background:"transparent",border:"none",cursor:"pointer",padding:0}}>
                    다시 선택
                  </button>
                )}
              </div>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:40,height:40,borderRadius:10,background:"rgba(109,74,255,.15)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>
                  {renderClassIcon(confirmedApplicant.job, 28)}
                </div>
                <div>
                  <div style={{fontSize:14,fontWeight:700,color:"#e2d9f3"}}>{confirmedApplicant.nick}</div>
                  <div style={{fontSize:12,color:CLASS_COLORS[confirmedApplicant.job]||"#888",marginTop:1}}>{confirmedApplicant.job || "직업 미설정"}</div>
                </div>
              </div>
            </div>
          )}

          <p style={{fontSize:11,color:"#555",marginBottom:14,textAlign:"center"}}>신청 후 방장의 승인이 필요합니다</p>
          <div className="mobile-col" style={{display:"flex",gap:8}}>
            <button onClick={closeModal}
              style={{flex:1,padding:"12px",borderRadius:12,border:"1px solid #2a2a3a",background:"transparent",color:"#666",cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:600}}>취소</button>
            <button
              disabled={!confirmedApplicant}
              onClick={()=>handleSubmitJoinRequest(type, date, slot, user ? null : confirmedApplicant)}
              style={{flex:2,padding:"12px",borderRadius:12,border:"none",
                background: confirmedApplicant ? "linear-gradient(135deg,#7c3aed,#a78bfa)" : "#1a1a2a",
                color: confirmedApplicant ? "#fff" : "#444",
                cursor: confirmedApplicant ? "pointer" : "default",
                fontFamily:"inherit",fontSize:13,fontWeight:700,
                boxShadow: confirmedApplicant ? "0 4px 16px rgba(124,58,237,.4)" : "none"}}>
              ✋ 신청하기
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderNamedGroupModal = () => {
    if (!namedGroupModal) return null;
    const {type, date, slot} = namedGroupModal;
    const sd = getSlotData(schedules, type, date, slot);
    const members = sd.members || [];
    const isExtra = type === "추가";
    const rawGroups = sd.namedGroups || {};
    const namedGroups = isExtra
      ? {
          party1: rawGroups.party1 || rawGroups.group1 || [],
          party2: rawGroups.party2 || rawGroups.group2 || [],
          party3: rawGroups.party3 || [],
          party4: rawGroups.party4 || [],
        }
      : {
          group1: rawGroups.group1 || [],
          group2: rawGroups.group2 || [],
        };
    const allNicks = members.map(m => m.nick);
    // allNicks 기준으로 필터링: 탈퇴/제거된 멤버의 유령 닉네임을 namedGroups에서 제거
    if (isExtra) {
      namedGroups.party1 = namedGroups.party1.filter(n => allNicks.includes(n));
      namedGroups.party2 = namedGroups.party2.filter(n => allNicks.includes(n));
      namedGroups.party3 = namedGroups.party3.filter(n => allNicks.includes(n));
      namedGroups.party4 = namedGroups.party4.filter(n => allNicks.includes(n));
    } else {
      namedGroups.group1 = namedGroups.group1.filter(n => allNicks.includes(n));
      namedGroups.group2 = namedGroups.group2.filter(n => allNicks.includes(n));
    }
    const assigned = isExtra
      ? [...namedGroups.party1, ...namedGroups.party2, ...namedGroups.party3, ...namedGroups.party4]
      : [...namedGroups.group1, ...namedGroups.group2];
    const unassigned = allNicks.filter(n => !assigned.includes(n));
    const isLeaderHere = user?.isAdmin || !!members.find(m => m.nick === user?.nick && m.isLeader);

    const saveGroups = (newGroups) => {
      const newSd = JSON.parse(JSON.stringify(schedules));
      if (!newSd[type]?.[date]?.[slot]) return;
      newSd[type][date][slot].namedGroups = isExtra
        ? {
            party1: newGroups.party1 || [],
            party2: newGroups.party2 || [],
            party3: newGroups.party3 || [],
            party4: newGroups.party4 || [],
          }
        : {
            group1: newGroups.group1 || [],
            group2: newGroups.group2 || [],
          };
      setSchedules({...newSd}); persist(users, newSd);
    };

    // 공통 드롭 로직 (PC, 모바일 공유)
    const handleDropLogic = (nick, targetGroup) => {
      // 드래그 전 소속 그룹 감지 (그룹 간 switch 이동 판단용)
      const groupKeys = isExtra
        ? ["party1","party2","party3","party4"]
        : ["group1","group2"];
      const sourceGroup = groupKeys.find(k => namedGroups[k].includes(nick)) || "unassigned";

      const newGroups = isExtra
        ? {
            party1: namedGroups.party1.filter(n => n !== nick),
            party2: namedGroups.party2.filter(n => n !== nick),
            party3: namedGroups.party3.filter(n => n !== nick),
            party4: namedGroups.party4.filter(n => n !== nick),
          }
        : {
            group1: namedGroups.group1.filter(n => n !== nick),
            group2: namedGroups.group2.filter(n => n !== nick),
          };

      if (targetGroup !== "unassigned") {
        // 미배치 → 그룹 이동만 4인 제한 적용
        // 그룹 간 이동(switch)은 총 인원이 변하지 않으므로 제한 없음
        if (sourceGroup === "unassigned" && newGroups[targetGroup].length >= 4) {
          showToast("각 그룹은 최대 4명입니다.", "#eab308");
          return;
        }
        newGroups[targetGroup] = [...newGroups[targetGroup], nick];
      }
      saveGroups(newGroups);
    };

    // PC용 드래그 이벤트
    const handleDrop = (e, targetGroup) => {
      if (!isLeaderHere) return; 
      e.preventDefault();
      const nick = e.dataTransfer.getData("nick");
      if (!nick) return;
      handleDropLogic(nick, targetGroup);
    };

    // 모바일용 터치 이벤트
    const handleTouchStart = (e, nick) => {
      if (!isLeaderHere) return;
      touchDraggedNick.current = nick;
    };

    const handleTouchMove = (e) => {
      if (!isLeaderHere || !touchDraggedNick.current) return;
      // 터치스크롤 방지 (css touchAction 속성과 함께 동작)
      if (e.cancelable) e.preventDefault();
    };

    const handleTouchEnd = (e) => {
      if (!isLeaderHere || !touchDraggedNick.current) return;
      const touch = e.changedTouches[0];
      const elem = document.elementFromPoint(touch.clientX, touch.clientY);
      const zone = elem?.closest('[data-droppable="true"]');

      if (zone) {
        const targetGroup = zone.getAttribute('data-group');
        handleDropLogic(touchDraggedNick.current, targetGroup);
      }
      touchDraggedNick.current = null;
    };

    const renderCard = (nick) => {
      const member = members.find(m => m.nick === nick);
      const uInfo = users.find(u => u.nick === nick);
      if (!member) return null;
      return (
        <div key={nick}
          draggable={isLeaderHere}
          onDragStart={isLeaderHere ? (e => { e.dataTransfer.setData("nick", nick); }) : undefined}
          onTouchStart={isLeaderHere ? (e => handleTouchStart(e, nick)) : undefined}
          onTouchMove={isLeaderHere ? handleTouchMove : undefined}
          onTouchEnd={isLeaderHere ? handleTouchEnd : undefined}
          style={{
            background:"#0d0d18",
            border:`1px solid ${CLASS_COLORS[member.job]||"#2a2a3a"}`,
            borderRadius:10,
            padding:"8px 10px",
            cursor:isLeaderHere?"grab":"default",
            userSelect:"none",
            touchAction: isLeaderHere ? "none" : "auto", // 모바일 드래그 시 화면 스크롤 방지
            display:"flex",
            alignItems:"center",
            gap:8,
            marginBottom:6
          }}>
          <div style={{fontSize:20}}>{renderClassIcon(member.job,24)}</div>
          <div style={{flex:1}}>
            <div style={{fontSize:12,fontWeight:700,color:member.isLeader?"#fbbf24":"#e2d9f3"}}>{member.isLeader?"👑 ":""}{nick}</div>
            <div style={{fontSize:10,color:CLASS_COLORS[member.job]||"#555"}}>{member.job}</div>
            {uInfo?.atul && <div style={{fontSize:9,color:"#a78bfa"}}>아툴 {uInfo.atul}</div>}
          </div>
        </div>
      );
    };

    const renderZone = (groupKey, title, color) => (
      <div style={{flex:1,minWidth:150}}
        data-droppable="true"
        data-group={groupKey}
        onDragOver={isLeaderHere ? (e=>e.preventDefault()) : undefined}
        onDrop={isLeaderHere ? (e=>handleDrop(e,groupKey)) : undefined}>
        <div style={{background:`${color}0d`,border:`1px dashed ${color}66`,borderRadius:12,padding:12,minHeight:200}}>
          <div style={{fontSize:12,fontWeight:700,color,marginBottom:10,textAlign:"center"}}>
            {title} ({namedGroups[groupKey].length}/4)
          </div>
          {namedGroups[groupKey].map(nick => renderCard(nick))}
          {isLeaderHere && (
            <div style={{border:"1px dashed #1a1a28",borderRadius:8,padding:"8px 0",textAlign:"center",fontSize:11,marginTop:4,
              color: namedGroups[groupKey].length >= 4 ? "#3a3a5a" : "#2a2a3a"}}>
              {namedGroups[groupKey].length >= 4 ? "⇄ 드래그로 파티 이동" : "여기에 드롭"}
            </div>
          )}
        </div>
      </div>
    );

    return (
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.92)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:150,padding:16}}
        onClick={e=>{if(e.target===e.currentTarget)setNamedGroupModal(null);}}>
        <div className="mobile-modal" style={{background:"#111120",border:"1px solid #22c55e55",borderRadius:20,padding:24,maxWidth:620,width:"100%",maxHeight:"90vh",overflowY:"auto"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <h3 style={{fontSize:16,fontWeight:700,color:"#22c55e"}}>
              {isExtra ? "🏠 방 구성 — 1파티 / 4파티" : "🏠 방 구성 — 1네임드 / 2네임드"}
            </h3>
            <button onClick={()=>setNamedGroupModal(null)} style={{background:"transparent",border:"1px solid #2a2a3a",color:"#666",borderRadius:8,padding:"5px 11px",cursor:"pointer",fontFamily:"inherit"}}>✕</button>
          </div>
          <p style={{fontSize:11,color:isLeaderHere?"#555":"#eab308",marginBottom:16}}>
            {isLeaderHere
              ? (user?.isAdmin
                  ? "👑 관리자 권한으로 모든 슬롯의 파티를 배치할 수 있습니다."
                  : "멤버를 드래그앤드롭으로 각 네임드 그룹에 배치하세요.")
              : "⚠️ 배치는 방장만 가능합니다. 현재 보기 전용입니다."}
          </p>
          <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
            {isExtra ? (
              <>
                {renderZone("party1","1파티","#a78bfa")}
                {renderZone("party2","2파티","#22c55e")}
                {renderZone("party3","3파티","#f97316")}
                {renderZone("party4","4파티","#38bdf8")}
              </>
            ) : (
              <>
                {renderZone("group1","⚔️ 1네임드","#a78bfa")}
                {renderZone("group2","⚔️ 2네임드","#22c55e")}
              </>
            )}
          </div>
          {unassigned.length > 0 && (
            <div style={{background:"#0a0a10",border:"1px dashed #2a2a3a",borderRadius:12,padding:12}}
              data-droppable="true"
              data-group="unassigned"
              onDragOver={isLeaderHere ? (e=>e.preventDefault()) : undefined}
              onDrop={isLeaderHere ? (e=>handleDrop(e,"unassigned")) : undefined}>
              <div style={{fontSize:11,color:"#555",fontWeight:700,marginBottom:8}}>⏳ 미배치 ({unassigned.length}명){isLeaderHere?" — 드래그하여 그룹에 배치하세요":""}</div>
              {unassigned.map(nick => renderCard(nick))}
            </div>
          )}
          <div className="mobile-col" style={{display:"flex",gap:8,marginTop:16}}>
            <button onClick={()=>setNamedGroupModal(null)} style={{flex:1,padding:"12px",borderRadius:12,border:"1px solid #2a2a3a",background:"transparent",color:"#666",cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:600}}>닫기</button>
            <button onClick={()=>{setNamedGroupModal(null);setSlotModal({type,date,slot});setEditingNotice(false);setClassEditing(false);setNoticeEdit(sd.notice||"");}} style={{flex:2,padding:"12px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#15803d,#22c55e)",color:"#fff",cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:700}}>✅ 저장 완료 — 파티모집으로 돌아가기</button>
          </div>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div style={{minHeight:"100vh",background:"#08080f",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:24,fontFamily:"'Noto Sans KR',sans-serif"}}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;600;700;900&display=swap');
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:1} }
        `}</style>
        <div style={{width:56,height:56,border:"4px solid #1e1e30",borderTop:"4px solid #a78bfa",borderRadius:"50%",animation:"spin 1s linear infinite"}}/>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:15,fontWeight:700,color:"#a78bfa",marginBottom:8,animation:"pulse 1.5s ease-in-out infinite"}}>데이터를 동기화 중입니다</div>
          <div style={{fontSize:12,color:"#3a3a5a"}}>잠시만 기다려주세요...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{minHeight:"100vh", background:"#08080f", color:"#e2d9f3", fontFamily:"'Noto Sans KR',sans-serif"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;600;700;900&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        ::-webkit-scrollbar { width:4px; height:4px; }
        ::-webkit-scrollbar-track { background:#0a0a14; }
        ::-webkit-scrollbar-thumb { background:#4a3aaa; border-radius:2px; }
        textarea, input { outline:none; }

        @media (max-width: 600px) {
          .mobile-col { flex-direction: column !important; }
          .mobile-grid-1 { grid-template-columns: 1fr !important; }
          .mobile-modal { padding: 18px !important; }
          .mobile-btn { width: 100% !important; justify-content: center !important; }
        }
      `}</style>

      {toast && (
        <div style={{position:"fixed",top:20,right:20,background:toast.color,color:"#fff",padding:"12px 20px",borderRadius:12,fontWeight:700,fontSize:13,zIndex:999,boxShadow:"0 4px 24px rgba(0,0,0,.5)"}}>
          {toast.msg}
        </div>
      )}

      {initError && (
        <div style={{position:"fixed",top:0,left:0,right:0,zIndex:9999,background:"rgba(239,68,68,.95)",color:"#fff",padding:"14px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,backdropFilter:"blur(10px)"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:18}}>⚠️</span>
            <span style={{fontSize:13,fontWeight:600}}>{initError}</span>
          </div>
          <button onClick={()=>window.location.reload()} style={{padding:"6px 14px",borderRadius:8,border:"1px solid rgba(255,255,255,.4)",background:"rgba(255,255,255,.15)",color:"#fff",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:700,whiteSpace:"nowrap"}}>새로고침</button>
        </div>
      )}

      {screen === "share" && renderShareView()}

      {screen === "login" && (
        <LoginView
          codeInput={codeInput}
          setCodeInput={setCodeInput}
          loginError={loginError}
          onLogin={handleLogin}
          AION_LOGO={AION_LOGO}
        />
      )}

      {screen === "main" && (
        <MainLayout
          user={user}
          tab={tab}
          setTab={setTab}
          AION_LOGO={AION_LOGO}
          raidNames={raidNames}
          onLogout={() => {
            localStorage.removeItem('kina_session');
            setScreen("login");
            setUser(null);
            setCodeInput("");
            setLoginError("");
          }}
        >
          {tab==="schedule" && <>{renderMyRooms()}{renderGrid("성역")}</>}
          {tab==="schedule2" && <>{renderMyRooms()}{renderGrid("성역2")}</>}
          {tab==="extra" && <>{renderMyRooms()}{renderExtraParties()}</>}
          {tab==="admin" && user?.isAdmin && renderAdmin()}
        </MainLayout>
      )}

      {renderJoinRequestModal()}

      {extraDraft && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.9)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:150,padding:16}}
          onClick={e=>{if(e.target===e.currentTarget)setExtraDraft(null);}}>
          <div className="mobile-modal" style={{background:"#111120",border:"1px solid #2a2a3a",borderRadius:20,padding:26,maxWidth:480,width:"100%"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <h3 style={{fontSize:16,fontWeight:700,color:"#c4b5fd"}}>🏠 파티 생성</h3>
              <button onClick={()=>setExtraDraft(null)} style={{background:"transparent",border:"1px solid #2a2a3a",color:"#666",borderRadius:8,padding:"5px 11px",cursor:"pointer",fontFamily:"inherit"}}>✕</button>
            </div>

            <div style={{marginBottom:18}}>
              <p style={{fontSize:12,color:"#fbbf24",fontWeight:700,marginBottom:6}}>📌 방 공지 (선택사항)</p>
              <textarea
                value={extraDraft.notice||""}
                onChange={e=>setExtraDraft({...extraDraft,notice:e.target.value})}
                placeholder="예: 아이템레벨 1800 이상 / 치유성 우선"
                rows={2}
                style={{width:"100%",background:"#0a0a14",border:"1px solid #2a2a3a",borderRadius:8,color:"#e2d9f3",fontFamily:"inherit",fontSize:13,padding:10,resize:"none",outline:"none"}}
                onFocus={e=>e.target.style.borderColor="#6d4aff"}
                onBlur={e=>e.target.style.borderColor="#2a2a3a"}
              />
            </div>

            <div className="mobile-col" style={{display:"flex",gap:8}}>
              <button onClick={()=>setExtraDraft(null)} style={{flex:1,padding:"12px",borderRadius:12,border:"1px solid #2a2a3a",background:"transparent",color:"#666",cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:600}}>취소</button>
              <button onClick={confirmCreateExtraParty} style={{flex:2,padding:"12px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#6d4aff,#a78bfa)",color:"#fff",cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:700,boxShadow:"0 4px 16px rgba(109,74,255,.4)"}}>
                🏠 방 생성하기
              </button>
            </div>
          </div>
        </div>
      )}

      {renderSlotModal()}

      {renderNamedGroupModal()}

      {moveModal && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.9)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:16}}>
          <div className="mobile-modal" style={{background:"#111120",border:"1px solid rgba(251,191,36,.3)",borderRadius:20,padding:30,maxWidth:360,width:"100%",textAlign:"center"}}>
            <div style={{fontSize:44,marginBottom:16}}>⚠️</div>
            <h3 style={{color:"#fbbf24",fontSize:18,fontWeight:700,marginBottom:12}}>시간대 변경</h3>
            <p style={{color:"#888",fontSize:14,lineHeight:1.7,marginBottom:24}}>
              이미 <strong style={{color:"#c4b5fd"}}>{moveModal.fromType&&moveModal.fromType!==moveModal.type?`[${moveModal.fromType}] `:""}{moveModal.fromDate!==selectedDate?moveModal.fromDate+" ":""}{getBaseSlot(moveModal.fromSlot)}</strong>에<br/>등록되어 있습니다.<br/>
              <strong style={{color:"#a78bfa"}}>{moveModal.toDate!==selectedDate?moveModal.toDate+" ":""}{getBaseSlot(moveModal.toSlot)}</strong>으로 이동할까요?
            </p>
            <div className="mobile-col" style={{display:"flex",gap:8}}>
              <button onClick={()=>setMoveModal(null)} style={{flex:1,padding:"12px",borderRadius:12,border:"1px solid #2a2a3a",background:"transparent",color:"#666",cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:600}}>취소</button>
              <button onClick={confirmMove} style={{flex:1,padding:"12px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#6d4aff,#a78bfa)",color:"#fff",cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:700,boxShadow:"0 4px 16px rgba(109,74,255,.4)"}}>이동하기</button>
            </div>
          </div>
        </div>
      )}

      {kickConfirm && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.9)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,padding:16}}>
          <div className="mobile-modal" style={{background:"#111120",border:"1px solid rgba(239,68,68,.3)",borderRadius:20,padding:28,maxWidth:330,width:"100%",textAlign:"center"}}>
            <div style={{fontSize:38,marginBottom:14}}>🚫</div>
            <h3 style={{color:"#ef4444",fontSize:17,fontWeight:700,marginBottom:10}}>참석자 퇴출</h3>
            <p style={{color:"#888",fontSize:13,lineHeight:1.6,marginBottom:22}}><strong style={{color:"#fca5a5",fontSize:15}}>{kickConfirm.nick}</strong>님을<br/>이 시간대에서 퇴출하시겠습니까?</p>
            <div className="mobile-col" style={{display:"flex",gap:8}}>
              <button onClick={()=>setKickConfirm(null)} style={{flex:1,padding:"11px",borderRadius:12,border:"1px solid #2a2a3a",background:"transparent",color:"#666",cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:600}}>취소</button>
              <button onClick={()=>handleKick(kickConfirm.type,kickConfirm.date,kickConfirm.slot,kickConfirm.nick)} style={{flex:1,padding:"11px",borderRadius:12,border:"none",background:"rgba(127,29,29,.8)",color:"#fca5a5",cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:700}}>퇴출하기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}