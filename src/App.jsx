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

  const [screen, setScreen] = useState(initialScreen);
  const [user, setUser] = useState(null);
  const [codeInput, setCodeInput] = useState("");
  const [loginError, setLoginError] = useState("");

  const [users, setUsers] = useState([]);
  const [initError, setInitError] = useState(null); 
  const [isLoading, setIsLoading] = useState(true); 

  const [schedules, setSchedules] = useState({"성역":{},"성역2":{},"추가":{}});

  const [tab, setTab] = useState("schedule");
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
  const [extraDraft, setExtraDraft] = useState(null);
  const [slotAddSearch, setSlotAddSearch] = useState("");
  const [adminCode, setAdminCode] = useState(ADMIN_CODE);
  const [raidNames, setRaidNames] = useState({ primary:"성역", secondary:"성역2" });

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

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
    return isSlotPast(dateStr, slot);
  };

  // ── 로그인 로직 (비동기로 최신 데이터 체크하도록 수정) ──────────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    const v = codeInput.trim().toUpperCase();
    if (v === adminCode) {
      setUser({isAdmin:true, nick:"관리자"});
      setScreen("main"); setTab("admin"); setLoginError(""); return;
    }

    // 다른 사용자가 발급한 최신 코드를 즉시 반영하기 위해 로그인 순간에 DB 재조회
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
    
    if (found) { setUser(found); setScreen("main"); setTab("schedule"); setLoginError(""); }
    else setLoginError("암호가 올바르지 않습니다.");
  };

  const handleRequestJoin = (type, date, slot) => {
    if (!user || user.isAdmin) return;
    const sd = JSON.parse(JSON.stringify(schedules));
    if (!sd[type]) sd[type] = {};
    if (!sd[type][date]) sd[type][date] = {};
    if (!sd[type][date][slot]) sd[type][date][slot] = {members:[], requiredClasses:[], pendingRequests:[], notice:""};

    const slotData = sd[type][date][slot];
    const max = maxOf(type);

    if (slotData.members.find(m => m.nick === user.nick)) { showToast("이미 참석 중입니다.", "#eab308"); return; }
    if (slotData.pendingRequests?.find(m => m.nick === user.nick)) { showToast("이미 신청 중입니다.", "#eab308"); return; }
    if (slotData.members.length >= max) { showToast("인원이 마감되었습니다.", "#ef4444"); return; }
    if (isSlotPast(date, slot)) { showToast("이미 지난 시간대입니다.", "#ef4444"); return; }

    const req = slotData.requiredClasses || [];
    if (req.length > 0 && user.job && !req.includes(user.job)) {
      showToast(`${user.job}은(는) 이 방에 참가할 수 없습니다.`, "#ef4444"); return;
    }

    if (slotData.members.length === 0) {
      let otherEntry = findMyOtherSlot(sd, type, date, slot);
      if (otherEntry) { setMoveModal({fromType:otherEntry.fromType, type, fromDate:otherEntry.d, fromSlot:otherEntry.sl, toDate:date, toSlot:slot, isPending:otherEntry.isPending}); setSlotModal(null); return; }
      slotData.members.push({nick:user.nick, job:user.job, isLeader:true, classes:[]});
      setSchedules({...sd}); persist(users, sd); setSlotModal(null);
      showToast("방 생성 완료! 방장이 되었습니다 👑", "#fbbf24"); return;
    }

    if (!slotData.pendingRequests) slotData.pendingRequests = [];
    let otherEntry2 = findMyOtherSlot(sd, type, date, slot);
    if (otherEntry2) { setMoveModal({fromType:otherEntry2.fromType, type, fromDate:otherEntry2.d, fromSlot:otherEntry2.sl, toDate:date, toSlot:slot, isPending:otherEntry2.isPending, joinAsPending:true}); setSlotModal(null); return; }
    slotData.pendingRequests.push({nick:user.nick, job:user.job});
    setSchedules({...sd}); persist(users, sd);
    showToast("참가 신청 완료! 방장 수락을 기다려주세요 ⏳", "#a78bfa");
  };

  const findMyOtherSlot = (sd, type, date, slot) => {
    for (const [t, dates] of Object.entries(sd)) {
      if (t !== type) continue; 
      for (const [d, slots] of Object.entries(dates || {})) {
        for (const [sl, sdata] of Object.entries(slots)) {
          if (d === date && sl === slot) continue;
          if (sdata.members?.find(m => m.nick === user.nick)) return {fromType:t, d, sl};
          if (sdata.pendingRequests?.find(m => m.nick === user.nick)) return {fromType:t, d, sl, isPending:true};
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

  const handleLeave = (type, date, slot) => {
    if (!user || user.isAdmin) return;
    const sd = JSON.parse(JSON.stringify(schedules));
    const slotData = sd[type]?.[date]?.[slot];
    if (!slotData) return;
    const idx = slotData.members.findIndex(m => m.nick === user.nick);
    if (idx === -1) {
      slotData.pendingRequests = slotData.pendingRequests?.filter(m => m.nick !== user.nick) || [];
      setSchedules({...sd}); persist(users, sd); setSlotModal(null);
      showToast("신청을 취소했습니다.", "#f97316"); return;
    }
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
    const {fromType, type, fromDate, fromSlot, toDate, toSlot, isPending, joinAsPending} = moveModal;
    const effectiveFromType = fromType || type;
    const sd = JSON.parse(JSON.stringify(schedules));
    const fromData = sd[effectiveFromType]?.[fromDate]?.[fromSlot];
    if (fromData) {
      if (isPending) {
        fromData.pendingRequests = fromData.pendingRequests?.filter(m => m.nick !== user.nick) || [];
      } else {
        const fi = fromData.members.findIndex(m => m.nick === user.nick);
        if (fi !== -1) {
          const wasLeader = fromData.members[fi].isLeader;
          const upd = fromData.members.filter(m => m.nick !== user.nick);
          if (wasLeader && upd.length > 0) upd[0].isLeader = true;
          if (wasLeader) fromData.notice = "";
          fromData.members = upd;
        }
      }
    }
    if (!sd[type]) sd[type] = {};
    if (!sd[type][toDate]) sd[type][toDate] = {};
    if (!sd[type][toDate][toSlot]) sd[type][toDate][toSlot] = {members:[], requiredClasses:[], pendingRequests:[], notice:""};
    const toData = sd[type][toDate][toSlot];
    if (joinAsPending) {
      if (!toData.pendingRequests) toData.pendingRequests = [];
      toData.pendingRequests.push({nick:user.nick, job:user.job});
      setSchedules({...sd}); persist(users, sd); setMoveModal(null);
      showToast("기존 참석 취소 후 참가 신청 완료! ⏳", "#a78bfa");
    } else {
      if (toData.members.length >= maxOf(type)) { showToast("이동할 슬롯이 마감되었습니다.", "#ef4444"); setMoveModal(null); return; }
      const isFirst = toData.members.length === 0;
      toData.members.push({nick:user.nick, job:user.job, isLeader:isFirst, classes:[]});
      setSchedules({...sd}); persist(users, sd); setMoveModal(null);
      showToast(`${effectiveFromType !== type ? effectiveFromType+"→"+type+" " : ""}이동 완료!`, "#22c55e");
    }
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

  const handleAdminClearSlot = (type, date, slot) => {
    const sd = JSON.parse(JSON.stringify(schedules));
    if (sd[type]?.[date]?.[slot]) {
      sd[type][date][slot].members = [];
      sd[type][date][slot].pendingRequests = [];
    }
    setSchedules({...sd}); persist(users, sd);
    showToast("전체 강퇴 완료", "#ef4444");
  };

  // ── 관리자: 대소문자 고정으로 코드 발급 ─────────────────────────────────────
  const handleGenerateAccessCode = (nick) => {
    const now = new Date();
    const expires = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000);
    const newCode = genCode().toUpperCase(); // 확실한 매칭을 위해 대문자 고정
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
    if (!user || user.isAdmin) return;
    setExtraDraft({requiredClasses:[], notice:""});
  };

  const confirmCreateExtraParty = () => {
    if (!user || user.isAdmin || !extraDraft) return;
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
      requiredClasses: extraDraft.requiredClasses,
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
    !!(user && !user.isAdmin && getSlotData(schedules, type, date, slot).members?.find(m => m.nick === user.nick && m.isLeader));

  const amIIn = (type, date, slot) =>
    !!(user && !user.isAdmin && getSlotData(schedules, type, date, slot).members?.find(m => m.nick === user.nick));

  const amIPending = (type, date, slot) =>
    !!(user && !user.isAdmin && getSlotData(schedules, type, date, slot).pendingRequests?.find(m => m.nick === user.nick));

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

  const renderExtraParties = () => {
    const type = "추가";
    const max = maxOf(type); 
    const date = TODAY_STR;
    const PARTY_SLOTS = ["party-1","party-2","party-3","party-4"];
    return (
      <div>
        <div style={{marginBottom:20}}>
          <h2 style={{fontSize:17,fontWeight:700,color:"#c4b5fd",marginBottom:4}}>➕ 성역 외 추가모집</h2>
          <p style={{fontSize:12,color:"#444"}}>최대 {max}명 · 4개 파티 고정 운영 (클릭하여 참가)</p>
        </div>
        {/* 모바일 반응형 클래스 적용 */}
        <div className="mobile-grid-1" style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(340px,1fr))",gap:14}}>
          {PARTY_SLOTS.map((slot, idx) => {
            const sd = getSlotData(schedules, type, date, slot);
            const members = sd.members || [];
            const pending = sd.pendingRequests || [];
            const isFull = members.length >= max;
            const isMine = !user?.isAdmin && !!members.find(m => m.nick === user?.nick);
            const isPending = !user?.isAdmin && !!pending.find(m => m.nick === user?.nick);
            const isLeader = !user?.isAdmin && !!members.find(m => m.nick === user?.nick && m.isLeader);
            const leader = members.find(m => m.isLeader);
            const partyNum = idx + 1;
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
                    <span style={{background:"rgba(109,74,255,.25)",border:"1px solid #6d4aff",color:"#c4b5fd",fontSize:14,padding:"3px 14px",borderRadius:20,fontWeight:900}}>{partyNum}파티</span>
                    <span style={{background:isFull?"rgba(239,68,68,.15)":"rgba(34,197,94,.1)",border:`1px solid ${isFull?"#ef4444":"#22c55e"}`,color:isFull?"#ef4444":"#22c55e",fontSize:11,padding:"2px 8px",borderRadius:20,fontWeight:700}}>
                      {members.length===0?"비어있음":isFull?"🔴 마감":"🟢 모집중"}
                    </span>
                    {isMine && <span style={{fontSize:10,color:"#a78bfa",fontWeight:700}}>✓ 참석중</span>}
                    {isPending && <span style={{fontSize:10,color:"#fbbf24",fontWeight:700}}>⏳ 신청중</span>}
                    {(pending.length > 0 && isLeader) && <span style={{background:"rgba(251,191,36,.15)",border:"1px solid #fbbf24",color:"#fbbf24",fontSize:10,padding:"2px 8px",borderRadius:20}}>신청 {pending.length}명</span>}
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
                      {(() => { const u=users.find(u=>u.nick===leader.nick); return u?.atul?<span style={{fontSize:10,color:"#a78bfa"}}>아툴 {u.atul}</span>:null; })()}
                    </div>
                  </div>
                ) : (
                  <div style={{color:"#2a2a3a",fontSize:12,fontStyle:"italic",marginBottom:10}}>방장 없음 — 첫 참가자가 방장</div>
                )}
                {sd.notice && <div style={{background:"rgba(251,191,36,.06)",border:"1px solid rgba(251,191,36,.2)",borderRadius:8,padding:"6px 10px",marginBottom:10,fontSize:12,color:"#e2d9f3"}}>📌 {sd.notice}</div>}
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {members.map(m => {
                    const u=users.find(u=>u.nick===m.nick);
                    return (
                      <div key={m.nick} style={{background:m.isLeader?"rgba(251,191,36,.1)":"#0a0a14",border:`1px solid ${m.isLeader?"rgba(251,191,36,.3)":"#1e1e30"}`,borderRadius:12,padding:"6px 10px",display:"flex",flexDirection:"column",alignItems:"center",gap:2,minWidth:80}}>
                        <span style={{color:m.isLeader?"#fbbf24":"#e2d9f3",fontSize:13,fontWeight:700}}>{m.nick}</span>
                        {m.job && <span style={{color:CLASS_COLORS[m.job]||"#555",fontSize:11}}>{m.job}</span>}
                        {u?.atul && <span style={{color:"#a78bfa",fontSize:11,fontWeight:600}}>아툴 {u.atul}</span>}
                      </div>
                    );
                  })}
                  {members.length===0 && <span style={{color:"#2a2a3a",fontSize:12,fontStyle:"italic"}}>아직 참가자 없음</span>}
                </div>
              </div>
            );
          })}
        </div>
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

        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(115px,1fr))", gap:8}}>
          {SLOTS.map(slot => {
            const sd = getSlotData(schedules, type, selectedDate, slot);
            const members = sd.members || [];
            const past = isSlotPast(selectedDate, slot);
            const isFull = members.length >= max || past;
            const isMine = amIIn(type, selectedDate, slot);
            const isPending = amIPending(type, selectedDate, slot);
            const hasNotice = !!sd.notice;
            const hasPending = (sd.pendingRequests?.length || 0) > 0 && amILeader(type, selectedDate, slot);

            let bg = "#0d0d18", border = "#1a1a28", timeColor = "#3a3a5a";
            if (past) { bg = "#0a0a0a"; border = "#1a1a1a"; timeColor = "#2a2a2a"; }
            else if (isMine) { bg = "rgba(109,74,255,.15)"; border = "#6d4aff"; timeColor = "#a78bfa"; }
            else if (isPending) { bg = "rgba(251,191,36,.08)"; border = "#92400e"; timeColor = "#fbbf24"; }
            else if (members.length >= max) { bg = "rgba(239,68,68,.08)"; border = "#5a1515"; timeColor = "#ef4444"; }
            else if (members.length > 0) { bg = "rgba(109,74,255,.08)"; border = "#2d2a4a"; timeColor = "#6d4aff"; }

            return (
              <div key={slot} onClick={() => {
                setSlotModal({type, date:selectedDate, slot});
                setEditingNotice(false); setClassEditing(false);
                setNoticeEdit(sd.notice || "");
              }} style={{
                padding:"10px 12px", borderRadius:12, cursor: past ? "default" : "pointer",
                border:`1px solid ${border}`, background:bg, transition:"all .15s", position:"relative",
                opacity: past ? 0.4 : 1
              }}
              onMouseEnter={e => { if(!past){e.currentTarget.style.transform="translateY(-2px)"; e.currentTarget.style.boxShadow="0 6px 20px rgba(0,0,0,.5)";} }}
              onMouseLeave={e => { e.currentTarget.style.transform=""; e.currentTarget.style.boxShadow="none"; }}>
                {hasNotice && <span style={{position:"absolute",top:5,right:8,fontSize:9}}>📌</span>}
                {hasPending && <span style={{position:"absolute",top:5,left:8,fontSize:9,color:"#fbbf24"}}>!</span>}
                <div style={{fontSize:14, fontWeight:700, color:timeColor, marginBottom:4, letterSpacing:.5}}>{slot}</div>
                <div style={{fontSize:11, color:"#444", marginBottom:3}}>{members.length}/{max}명</div>
                <div style={{fontSize:10, fontWeight:700, color: past?"#2a2a3a":isFull?"#ef4444":members.length>0?"#22c55e":"#2a2a3a"}}>
                  {past ? "⏱ 종료" : members.length===0 ? "─" : isFull ? "🔴 마감" : "🟢 모집중"}
                </div>
                {isMine && !past && <div style={{fontSize:9,color:"#a78bfa",marginTop:3,fontWeight:600}}>✓ 참석예정</div>}
                {isPending && !past && <div style={{fontSize:9,color:"#fbbf24",marginTop:3,fontWeight:600}}>⏳ 신청중</div>}
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
    const past = !slot?.startsWith("party-") && isSlotPast(date, slot);
    const isMine = amIIn(type, date, slot);
    const isPending = amIPending(type, date, slot);
    const isLeader = amILeader(type, date, slot);
    const dObj = DATE_RANGE.find(d => fmtDate(d) === date);
    const {short, wd} = dObj ? fmtLabel(dObj) : {short:date, wd:""};
    const isPartySlot = slot?.startsWith("party-");
    const slotLabel = isPartySlot ? `파티 #${slot.replace("party-","")}` : slot;

    const myJobAllowed = !user?.isAdmin && required.length > 0
      ? (user?.job ? required.includes(user.job) : true)
      : true;

    return (
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.9)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:16}}
        onClick={e => { if(e.target===e.currentTarget){setSlotModal(null);setEditingNotice(false);setClassEditing(false);} }}>
        {/* 모바일 반응형 클래스 적용 */}
        <div className="mobile-modal" style={{background:"#111120",border:"1px solid #2a2a3a",borderRadius:20,padding:24,maxWidth:540,width:"100%",maxHeight:"88vh",overflowY:"auto"}}>

          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                <div style={{background: past?"#1a1a1a":"linear-gradient(135deg,#6d4aff,#a78bfa)",borderRadius:10,padding:"6px 14px",fontSize:16,fontWeight:900,color:"#fff",letterSpacing:1}}>{slotLabel}</div>
                <span style={{color:"#666",fontSize:13}}>{isPartySlot ? "" : `${short} (${wd})`}{!isPartySlot && ""}{isPartySlot ? `${short} (${wd})` : ""}</span>
                {past && <span style={{background:"#1a1a1a",border:"1px solid #333",color:"#555",fontSize:10,padding:"2px 8px",borderRadius:20}}>종료됨</span>}
              </div>
              <div style={{marginTop:6,display:"flex",gap:10,alignItems:"center"}}>
                <span style={{fontSize:12,color:"#555"}}>{members.length}/{max}명</span>
                <span style={{fontSize:11,fontWeight:700,color: past?"#333":isFull?"#ef4444":members.length>0?"#22c55e":"#444"}}>
                  {past ? "⏱ 종료" : members.length===0?"대기중":isFull?"🔴 마감":"🟢 모집중"}
                </span>
              </div>
            </div>
            <button onClick={()=>{setSlotModal(null);setEditingNotice(false);setClassEditing(false);}}
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
                      const slotRequired = !isPartySlot ? ((sd.requiredClasses||[])[idx] || null) : null;
                      return (
                        <div key={idx} style={{
                          borderRadius:12,border:`1px solid ${m ? "#2a2a3a" : isLeader && slotRequired ? CLASS_COLORS[slotRequired]+"55" : "#1a1a24"}`,
                          background: m ? "#0d0d18" : isLeader && slotRequired ? CLASS_COLORS[slotRequired]+"0d" : "#0a0a10",
                          padding:isPartySlot?"8px 6px":"12px 10px",position:"relative",minHeight:isPartySlot?68:88,
                          display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4
                        }}>
                          <span style={{position:"absolute",top:5,left:8,fontSize:9,color:"#333",fontWeight:700}}>#{idx+1}</span>

                          {!isPartySlot && isLeader && !m && (
                            <div style={{position:"absolute",top:4,right:4}}>
                              <select
                                value={slotRequired||""}
                                onChange={e => {
                                  const sd2 = JSON.parse(JSON.stringify(schedules));
                                  if (!sd2[type]?.[date]?.[slot]) return;
                                  const req = [...(sd2[type][date][slot].requiredClasses||[])];
                                  while(req.length < 7) req.push(null);
                                  req[idx] = e.target.value || null;
                                  sd2[type][date][slot].requiredClasses = req.filter((_,i)=>i<=idx||req[i]);
                                  sd2[type][date][slot].requiredClasses = Array.from({length:7},(_,i)=>req[i]||null);
                                  setSchedules({...sd2}); persist(users, sd2);
                                }}
                                style={{fontSize:9,background:"#0a0a14",border:"1px solid #2a2a3a",borderRadius:6,color:"#666",cursor:"pointer",padding:"1px 2px",maxWidth:56}}
                                onClick={e=>e.stopPropagation()}
                              >
                                <option value="">자유</option>
                                {CLASSES.map(c=><option key={c} value={c}>{renderClassIcon(c,16)} {c}</option>)}
                              </select>
                            </div>
                          )}

                          {m ? (
                            <>
                              <div style={{fontSize:isPartySlot?16:22}}>{renderClassIcon(m.job, isPartySlot?20:28)}</div>
                              <div style={{fontSize:isPartySlot?10:12,fontWeight:700,color:"#e2d9f3",textAlign:"center",lineHeight:1.3}}>{m.nick}</div>
                              {m.job && <div style={{fontSize:9,color:CLASS_COLORS[m.job]||"#555",fontWeight:600}}>{m.job}</div>}
                              {(() => { const uInfo = users.find(u => u.nick === m.nick); return uInfo?.atul ? <div style={{fontSize:9,color:"#a78bfa",fontWeight:600}}>아툴 {uInfo.atul}</div> : null; })()}
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
                              {slotRequired ? (
                                <>
                                  <div style={{fontSize:22,opacity:0.4}}>{renderClassIcon(slotRequired,28)}</div>
                                  <div style={{fontSize:10,color:CLASS_COLORS[slotRequired],fontWeight:700}}>{slotRequired}</div>
                                  <div style={{fontSize:9,color:"#333"}}>모집중</div>
                                </>
                              ) : (
                                <>
                                  <div style={{fontSize:isPartySlot?16:20,opacity:0.15}}>＋</div>
                                  <div style={{fontSize:isPartySlot?9:10,color:"#2a2a3a"}}>빈 자리</div>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}

            {isLeader && pending.length > 0 && (
              <div style={{background:"rgba(251,191,36,.06)",border:"1px solid rgba(251,191,36,.25)",borderRadius:12,padding:14,marginTop:12}}>
                <p style={{fontSize:12,color:"#fbbf24",fontWeight:700,marginBottom:10}}>⏳ 참가 신청 대기 ({pending.length}명)</p>
                {pending.map(m => (
                  <div key={m.nick} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid rgba(251,191,36,.1)"}}>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                        <span style={{fontWeight:600,color:"#e2d9f3"}}>{m.nick}</span>
                        {m.job && <span style={{fontSize:11,color:CLASS_COLORS[m.job]||"#555"}}>{renderClassIcon(m.job,14)} {m.job}</span>}
                        {(() => { const uInfo = users.find(u => u.nick === m.nick); return uInfo?.atul ? <span style={{fontSize:10,color:"#a78bfa"}}>아툴 {uInfo.atul}</span> : null; })()}
                      </div>
                    </div>
                    <button onClick={()=>handleApprove(type,date,slot,m.nick)} style={{background:"rgba(34,197,94,.2)",border:"1px solid #22c55e",color:"#22c55e",borderRadius:8,padding:"4px 10px",cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:700}}>수락</button>
                    <button onClick={()=>handleReject(type,date,slot,m.nick)} style={{background:"rgba(239,68,68,.15)",border:"1px solid #ef4444",color:"#ef4444",borderRadius:8,padding:"4px 10px",cursor:"pointer",fontFamily:"inherit",fontSize:11}}>거절</button>
                  </div>
                ))}
              </div>
            )}

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

          {/* 모바일 반응형 클래스 적용 */}
          {!user?.isAdmin && !past && (
            <div className="mobile-col" style={{display:"flex",gap:8}}>
              {!isMine && !isPending && !isFull && (
                myJobAllowed ? (
                  <button onClick={()=>handleRequestJoin(type,date,slot)} style={{flex:1,padding:"13px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#6d4aff,#a78bfa)",color:"#fff",fontFamily:"inherit",fontSize:14,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 16px rgba(109,74,255,.4)"}}>
                    {members.length===0 ? "🏠 방 생성" : "📨 참가 신청"}
                  </button>
                ) : (
                  <div style={{flex:1,padding:"13px",borderRadius:12,background:"rgba(239,68,68,.08)",border:"1px solid #7f1d1d",color:"#ef4444",textAlign:"center",fontSize:13,fontWeight:700}}>
                    ⛔ {user?.job} 참가 불가 클래스
                  </div>
                )
              )}
              {isPending && (
                <button onClick={()=>handleLeave(type,date,slot)} style={{flex:1,padding:"13px",borderRadius:12,border:"1px solid #92400e",background:"rgba(146,64,14,.2)",color:"#fbbf24",fontFamily:"inherit",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                  ✕ 신청 취소
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
              {isFull && !isMine && !isPending && (
                <div style={{flex:1,padding:"13px",borderRadius:12,background:"rgba(239,68,68,.08)",border:"1px solid #7f1d1d",color:"#ef4444",textAlign:"center",fontSize:13,fontWeight:700}}>🔴 마감된 시간대입니다</div>
              )}
            </div>
          )}
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
              {/* 모바일 반응형 클래스 적용 */}
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
                    📥 {adminAddTarget.slot} 에 유저 추가
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
                  const dayData = Object.entries(schedules[type]?.[ds]||{}).filter(([,sd])=>sd.members?.length>0).sort();
                  if (dayData.length===0) return null;
                  return (
                    <div key={ds} style={{marginBottom:14}}>
                      <div style={{fontSize:12,color:"#444",marginBottom:8,display:"flex",alignItems:"center",gap:8}}>
                        <span style={{color:"#555",fontWeight:600}}>{short} {wd}요일</span>
                        {ds===TODAY_STR&&<span style={{background:"rgba(109,74,255,.2)",color:"#a78bfa",fontSize:10,padding:"1px 6px",borderRadius:20}}>오늘</span>}
                      </div>
                      {dayData.map(([slot, sd]) => (
                        <div key={slot} style={{background:"#0d0d18",border:"1px solid #1e1e30",borderRadius:12,padding:"12px 16px",marginBottom:8}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                            <div style={{display:"flex",alignItems:"center",gap:10}}>
                              <span style={{fontWeight:700,color:"#c4b5fd",fontSize:14}}>{slot}</span>
                              <span style={{fontSize:12,color:sd.members.length>=maxOf(type)?"#ef4444":"#22c55e",fontWeight:600}}>
                                {sd.members.length}/{maxOf(type)} {sd.members.length>=maxOf(type)?"마감":"모집중"}
                              </span>
                              {(sd.pendingRequests?.length||0)>0&&<span style={{background:"rgba(251,191,36,.15)",color:"#fbbf24",fontSize:10,padding:"1px 8px",borderRadius:20}}>대기 {sd.pendingRequests.length}명</span>}
                            </div>
                            <div style={{display:"flex",gap:6}}>
                              <button onClick={()=>{setAdminAddTarget({type,date:ds,slot});setAdminSearchQuery("");setAdminView("schedule");}}
                                style={{background:"rgba(109,74,255,.2)",border:"1px solid #6d4aff",color:"#a78bfa",borderRadius:8,padding:"4px 10px",cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:600}}>+ 추가</button>
                              <button onClick={()=>{ if(window.confirm(`${slot} 전체 강퇴?`)) handleAdminClearSlot(type,ds,slot); }}
                                style={{background:"rgba(127,29,29,.3)",border:"1px solid #7f1d1d",color:"#fca5a5",borderRadius:8,padding:"4px 10px",cursor:"pointer",fontFamily:"inherit",fontSize:11}}>전체강퇴</button>
                            </div>
                          </div>
                          {sd.notice&&<p style={{fontSize:11,color:"#fbbf24",marginBottom:8}}>📌 {sd.notice}</p>}
                          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                            {sd.members.map(m=>{
                              const uInfo = users.find(u => u.nick === m.nick);
                              return (
                                <div key={m.nick} style={{background:"#13131f",border:`1px solid ${m.isLeader?"rgba(251,191,36,.4)":"#2a2a3a"}`,borderRadius:10,padding:"4px 10px",fontSize:12,display:"flex",flexDirection:"column",alignItems:"center",gap:1}}>
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
                      ))}
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
      <div style={{maxWidth:1160,margin:"0 auto",padding:"40px 20px 56px"}}>
        <div style={{textAlign:"center",marginBottom:36}}>
          <h1 style={{fontSize:30,fontWeight:900,color:"#c4b5fd",letterSpacing:3,marginBottom:8}}>KINA일정 대시보드</h1>
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
            <div key={ds} style={{marginBottom:24,borderRadius:20,background:"radial-gradient(circle at 0 0,rgba(88,28,135,.3),transparent 55%) #050816",border:"1px solid #111827",padding:20,boxShadow:"0 18px 60px rgba(0,0,0,.65)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div>
                  <div style={{fontSize:12,color:"#6b7280",marginBottom:2}}>레이드 날짜</div>
                  <div style={{fontSize:18,fontWeight:700,color:"#e5e7eb"}}>{label}</div>
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
                    <div key={type} style={{borderRadius:20,background:"#020617",border:"1px solid #111827",padding:18}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                        <div style={{fontSize:15,fontWeight:800,color:"#a5b4fc"}}>⚔️ {title}</div>
                        <div style={{fontSize:12,color:"#6b7280"}}>{dayData.length}개 시간대</div>
                      </div>

                      <div style={{display:"grid",gap:12}}>
                        {dayData.map(([slot, sd]) => {
                          const members = sd.members || [];
                          const leader = members.find(m => m.isLeader);
                          const rawGroups = sd.namedGroups || {};
                          const group1Nicks = rawGroups.group1 || [];
                          const group2Nicks = rawGroups.group2 || [];
                          const byNick = Object.fromEntries(members.map(m => [m.nick, m]));
                          const group1 = group1Nicks.map(n => byNick[n]).filter(Boolean);
                          const group2 = group2Nicks.map(n => byNick[n]).filter(Boolean);
                          const grouped = new Set([...group1Nicks, ...group2Nicks]);
                          const unassigned = members.filter(m => !grouped.has(m.nick));
                          const isPast = !isExtra && !slot.startsWith("party-") ? isSlotPast(ds, slot) : false;

                          const renderPerson = (m) => {
                            if (!m) return null;
                            const info = getUserInfo(m.nick);
                            return (
                              <div key={m.nick} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",fontSize:16}}>
                                <div style={{display:"flex",alignItems:"center",gap:10}}>
                                  {m.isLeader && <span style={{color:"#fbbf24",fontSize:18}}>👑</span>}
                                  <span style={{color:m.isLeader?"#fef9c3":"#e5e7eb",fontWeight:m.isLeader?700:600,fontSize:17}}>{m.nick}</span>
                                  {m.job && <span style={{color:CLASS_COLORS[m.job]||"#9ca3af",fontSize:14,fontWeight:600}}>{m.job}</span>}
                                </div>
                                {info?.atul && (
                                  <span style={{fontSize:15,color:"#a78bfa",fontWeight:700}}>아툴 {info.atul}</span>
                                )}
                              </div>
                            );
                          };

                          const avg1 = calcAvgAtul(group1);
                          const avg2 = calcAvgAtul(group2);

                          return (
                            <div key={slot} style={{
                              borderRadius:18,
                              background:"radial-gradient(circle at 0 0,rgba(79,70,229,.25),transparent 55%) #020617",
                              border:"1px solid #111827",
                              padding:14,
                              opacity:isPast?0.45:1
                            }}>
                              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                                <div>
                                  <div style={{fontSize:12,color:"#64748b"}}>시작 시간</div>
                                  <div style={{fontSize:18,fontWeight:800,color:"#e5e7eb"}}>{slot}</div>
                                </div>
                                <div style={{textAlign:"right"}}>
                                  <div style={{fontSize:12,color:"#64748b"}}>인원</div>
                                  <div style={{fontSize:13,fontWeight:700,color:isPast?"#9ca3af":members.length>=maxOf(type)?"#f97373":"#4ade80"}}>
                                    {members.length}/{maxOf(type)} {isPast || members.length>=maxOf(type)?"마감":"모집중"}
                                  </div>
                                </div>
                              </div>

                              {/* 모바일 반응형 클래스 적용 */}
                              <div className="mobile-grid-1" style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:10,marginTop:4}}>
                                {[
                                  {label:"1파티", group:group1, avg:avg1},
                                  {label:"2파티", group:group2, avg:avg2},
                                ].map(party => (
                                  <div key={party.label} style={{borderRadius:14,background:"#020617",border:"1px solid #111827",padding:10}}>
                                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                                      <div style={{fontSize:12,color:"#e5e7eb",fontWeight:700}}>{party.label}</div>
                                      <div style={{fontSize:11,color:party.avg?"#38bdf8":"#4b5563"}}>
                                        {party.avg ? `아툴 평균 ${party.avg}` : "아툴 정보 없음"}
                                      </div>
                                    </div>
                                    {party.group.length > 0 ? party.group.map(renderPerson) : (
                                      <div style={{fontSize:11,color:"#374151"}}>배정 없음</div>
                                    )}
                                  </div>
                                ))}
                              </div>

                              {unassigned.length > 0 && (
                                <div style={{marginTop:8,paddingTop:8,borderTop:"1px dashed #111827"}}>
                                  <div style={{fontSize:11,color:"#6b7280",marginBottom:2}}>미배치</div>
                                  {unassigned.map(renderPerson)}
                                </div>
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
    const assigned = isExtra
      ? [...namedGroups.party1, ...namedGroups.party2, ...namedGroups.party3, ...namedGroups.party4]
      : [...namedGroups.group1, ...namedGroups.group2];
    const unassigned = allNicks.filter(n => !assigned.includes(n));
    const isLeaderHere = !!members.find(m => m.nick === user?.nick && m.isLeader);

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

    const handleDrop = (e, targetGroup) => {
      if (!isLeaderHere) return; 
      e.preventDefault();
      const nick = e.dataTransfer.getData("nick");
      if (!nick) return;
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
        if (newGroups[targetGroup].length >= 4) { showToast("각 그룹은 최대 4명입니다.", "#eab308"); return; }
        newGroups[targetGroup] = [...newGroups[targetGroup], nick];
      }
      saveGroups(newGroups);
    };

    const renderCard = (nick) => {
      const member = members.find(m => m.nick === nick);
      const uInfo = users.find(u => u.nick === nick);
      if (!member) return null;
      return (
        <div key={nick}
          draggable={isLeaderHere}
          onDragStart={isLeaderHere ? (e => { e.dataTransfer.setData("nick", nick); }) : undefined}
          style={{background:"#0d0d18",border:`1px solid ${CLASS_COLORS[member.job]||"#2a2a3a"}`,borderRadius:10,padding:"8px 10px",cursor:isLeaderHere?"grab":"default",userSelect:"none",display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
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
        onDragOver={isLeaderHere ? (e=>e.preventDefault()) : undefined}
        onDrop={isLeaderHere ? (e=>handleDrop(e,groupKey)) : undefined}>
        <div style={{background:`${color}0d`,border:`1px dashed ${color}66`,borderRadius:12,padding:12,minHeight:200}}>
          <div style={{fontSize:12,fontWeight:700,color,marginBottom:10,textAlign:"center"}}>
            {title} ({namedGroups[groupKey].length}/4)
          </div>
          {namedGroups[groupKey].map(nick => renderCard(nick))}
          {isLeaderHere && namedGroups[groupKey].length < 4 && (
            <div style={{border:"1px dashed #1a1a28",borderRadius:8,padding:"10px 0",textAlign:"center",color:"#2a2a3a",fontSize:11,marginTop:4}}>여기에 드롭</div>
          )}
        </div>
      </div>
    );

    return (
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.92)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:150,padding:16}}
        onClick={e=>{if(e.target===e.currentTarget)setNamedGroupModal(null);}}>
        {/* 모바일 반응형 클래스 적용 */}
        <div className="mobile-modal" style={{background:"#111120",border:"1px solid #22c55e55",borderRadius:20,padding:24,maxWidth:620,width:"100%",maxHeight:"90vh",overflowY:"auto"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <h3 style={{fontSize:16,fontWeight:700,color:"#22c55e"}}>
              {isExtra ? "🏠 방 구성 — 1파티 / 4파티" : "🏠 방 구성 — 1네임드 / 2네임드"}
            </h3>
            <button onClick={()=>setNamedGroupModal(null)} style={{background:"transparent",border:"1px solid #2a2a3a",color:"#666",borderRadius:8,padding:"5px 11px",cursor:"pointer",fontFamily:"inherit"}}>✕</button>
          </div>
          <p style={{fontSize:11,color:isLeaderHere?"#555":"#eab308",marginBottom:16}}>
            {isLeaderHere
              ? "멤버를 드래그앤드롭으로 각 네임드 그룹에 배치하세요. (방장만 배치 가능)"
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
              onDragOver={isLeaderHere ? (e=>e.preventDefault()) : undefined}
              onDrop={isLeaderHere ? (e=>handleDrop(e,"unassigned")) : undefined}>
              <div style={{fontSize:11,color:"#555",fontWeight:700,marginBottom:8}}>⏳ 미배치 ({unassigned.length}명){isLeaderHere?" — 드래그하여 그룹에 배치하세요":""}</div>
              {unassigned.map(nick => renderCard(nick))}
            </div>
          )}
          {/* 모바일 반응형 클래스 적용 */}
          <div className="mobile-col" style={{display:"flex",gap:8,marginTop:16}}>
            <button onClick={()=>setNamedGroupModal(null)} style={{flex:1,padding:"12px",borderRadius:12,border:"1px solid #2a2a3a",background:"transparent",color:"#666",cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:600}}>닫기</button>
            <button onClick={()=>{setNamedGroupModal(null);setSlotModal({type,date,slot});setEditingNotice(false);setClassEditing(false);setNoticeEdit(sd.notice||"");}} style={{flex:2,padding:"12px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#15803d,#22c55e)",color:"#fff",cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:700}}>✅ 저장 완료 — 파티모집으로 돌아가기</button>
          </div>
        </div>
      </div>
    );
  };

  // ── 로딩 화면 ────────────────────────────────────────────────────────────────
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

        /* 모바일 반응형용 CSS 추가 */
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
            setScreen("login");
            setUser(null);
            setCodeInput("");
            setLoginError("");
          }}
        >
          {tab==="schedule" && renderGrid("성역")}
          {tab==="schedule2" && renderGrid("성역2")}
          {tab==="extra" && renderExtraParties()}
          {tab==="admin" && user?.isAdmin && renderAdmin()}
        </MainLayout>
      )}

      {extraDraft && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.9)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:150,padding:16}}
          onClick={e=>{if(e.target===e.currentTarget)setExtraDraft(null);}}>
          {/* 모바일 반응형 클래스 적용 */}
          <div className="mobile-modal" style={{background:"#111120",border:"1px solid #2a2a3a",borderRadius:20,padding:26,maxWidth:480,width:"100%"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <h3 style={{fontSize:16,fontWeight:700,color:"#c4b5fd"}}>🏠 파티 생성</h3>
              <button onClick={()=>setExtraDraft(null)} style={{background:"transparent",border:"1px solid #2a2a3a",color:"#666",borderRadius:8,padding:"5px 11px",cursor:"pointer",fontFamily:"inherit"}}>✕</button>
            </div>

            <div style={{marginBottom:18}}>
              <p style={{fontSize:12,color:"#a78bfa",fontWeight:700,marginBottom:6}}>🎭 모집 클래스 지정 (선택사항)</p>
              <p style={{fontSize:11,color:"#444",marginBottom:10}}>각 자리에 원하는 클래스를 지정하세요. 지정하지 않은 자리는 모든 클래스 신청 가능합니다.</p>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:8}}>
                {CLASSES.map(c => {
                  const cnt = (extraDraft.requiredClasses||[]).filter(x=>x===c).length;
                  return (
                    <button key={c} onClick={()=>{
                      const req = [...(extraDraft.requiredClasses||[])];
                      if(req.length < 7) req.push(c);
                      else showToast("최대 7자리까지 지정 가능합니다.","#eab308");
                      setExtraDraft({...extraDraft, requiredClasses:req});
                    }} style={{
                      padding:"7px 4px",borderRadius:10,border:`1px solid ${CLASS_COLORS[c]}55`,
                      background:cnt>0?CLASS_COLORS[c]+"22":"transparent",
                      color:cnt>0?CLASS_COLORS[c]:"#444",fontSize:11,cursor:"pointer",fontFamily:"inherit",
                      fontWeight:cnt>0?700:400,textAlign:"center",transition:"all .2s",position:"relative"
                    }}>
                      <div style={{fontSize:16}}>{renderClassIcon(c,20)}</div>
                      <div style={{fontSize:10}}>{c}</div>
                      {cnt>0&&<span style={{position:"absolute",top:2,right:4,fontSize:9,color:CLASS_COLORS[c],fontWeight:900}}>{cnt}</span>}
                    </button>
                  );
                })}
              </div>

              {(extraDraft.requiredClasses||[]).length > 0 && (
                <div style={{background:"#0a0a14",borderRadius:10,padding:"10px 12px",marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                    <span style={{fontSize:11,color:"#555"}}>지정된 자리 ({extraDraft.requiredClasses.length}/7)</span>
                    <button onClick={()=>setExtraDraft({...extraDraft,requiredClasses:[]})} style={{fontSize:10,color:"#ef4444",background:"transparent",border:"none",cursor:"pointer",fontFamily:"inherit"}}>전체 초기화</button>
                  </div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                    {extraDraft.requiredClasses.map((c,i)=>(
                      <span key={i} onClick={()=>{
                        const req=[...extraDraft.requiredClasses];
                        req.splice(i,1);
                        setExtraDraft({...extraDraft,requiredClasses:req});
                      }} style={{background:CLASS_COLORS[c]+"22",border:`1px solid ${CLASS_COLORS[c]}55`,color:CLASS_COLORS[c],padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:600,cursor:"pointer"}}>
                        {renderClassIcon(c,14)} {c} ✕
                      </span>
                    ))}
                  </div>
                </div>
              )}
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

            {/* 모바일 반응형 클래스 적용 */}
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
          {/* 모바일 반응형 클래스 적용 */}
          <div className="mobile-modal" style={{background:"#111120",border:"1px solid rgba(251,191,36,.3)",borderRadius:20,padding:30,maxWidth:360,width:"100%",textAlign:"center"}}>
            <div style={{fontSize:44,marginBottom:16}}>⚠️</div>
            <h3 style={{color:"#fbbf24",fontSize:18,fontWeight:700,marginBottom:12}}>시간대 변경</h3>
            <p style={{color:"#888",fontSize:14,lineHeight:1.7,marginBottom:24}}>
              이미 <strong style={{color:"#c4b5fd"}}>{moveModal.fromType&&moveModal.fromType!==moveModal.type?`[${moveModal.fromType}] `:""}{moveModal.fromDate!==selectedDate?moveModal.fromDate+" ":""}{moveModal.fromSlot}</strong>에<br/>등록되어 있습니다.<br/>
              <strong style={{color:"#a78bfa"}}>{moveModal.toDate!==selectedDate?moveModal.toDate+" ":""}{moveModal.toSlot}</strong>으로 이동할까요?
            </p>
            {/* 모바일 반응형 클래스 적용 */}
            <div className="mobile-col" style={{display:"flex",gap:8}}>
              <button onClick={()=>setMoveModal(null)} style={{flex:1,padding:"12px",borderRadius:12,border:"1px solid #2a2a3a",background:"transparent",color:"#666",cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:600}}>취소</button>
              <button onClick={confirmMove} style={{flex:1,padding:"12px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#6d4aff,#a78bfa)",color:"#fff",cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:700,boxShadow:"0 4px 16px rgba(109,74,255,.4)"}}>이동하기</button>
            </div>
          </div>
        </div>
      )}

      {kickConfirm && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.9)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,padding:16}}>
          {/* 모바일 반응형 클래스 적용 */}
          <div className="mobile-modal" style={{background:"#111120",border:"1px solid rgba(239,68,68,.3)",borderRadius:20,padding:28,maxWidth:330,width:"100%",textAlign:"center"}}>
            <div style={{fontSize:38,marginBottom:14}}>🚫</div>
            <h3 style={{color:"#ef4444",fontSize:17,fontWeight:700,marginBottom:10}}>참석자 퇴출</h3>
            <p style={{color:"#888",fontSize:13,lineHeight:1.6,marginBottom:22}}><strong style={{color:"#fca5a5",fontSize:15}}>{kickConfirm.nick}</strong>님을<br/>이 시간대에서 퇴출하시겠습니까?</p>
            {/* 모바일 반응형 클래스 적용 */}
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