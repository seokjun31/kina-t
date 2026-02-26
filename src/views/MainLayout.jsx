import React from "react";

export default function MainLayout({ user, tab, setTab, AION_LOGO, raidNames, onLogout, children }) {
  return (
    <>
      {/* 헤더 */}
      <div style={{background:"rgba(10,10,20,.95)",borderBottom:"1px solid #1a1a28",padding:"12px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:50,backdropFilter:"blur(20px)"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:40,height:40,borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",boxShadow:"0 4px 16px rgba(6,182,212,.35)"}}>
            <img src={AION_LOGO} alt="AION2" style={{width:46,height:46,objectFit:"contain",filter:"drop-shadow(0 0 6px rgba(6,182,212,.8))"}}/>
          </div>
          <div>
            <div>
              <div style={{fontSize:16,fontWeight:900,background:"linear-gradient(90deg,#a78bfa,#c4b5fd)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",letterSpacing:-0.5}}>바바룽</div>
              <div style={{fontSize:10,color:"#a78bfa",letterSpacing:2,fontWeight:700}}>KINA</div>
            </div>
            <div style={{fontSize:10,color:"#444",marginTop:1}}>{user?.isAdmin?"👑 관리자":`${user?.nick}${user?.job?` · ${user.job}`:""}`}</div>
          </div>
        </div>
        <button
          onClick={onLogout}
          style={{padding:"7px 14px",borderRadius:8,border:"1px solid #1e1e30",background:"transparent",color:"#555",cursor:"pointer",fontFamily:"inherit",fontSize:12}}
        >
          로그아웃
        </button>
      </div>

      {/* 탭 */}
      <div style={{display:"flex",background:"rgba(10,10,20,.9)",borderBottom:"1px solid #1a1a28",padding:"0 16px",backdropFilter:"blur(10px)"}}>
        {[
          {key:"schedule",label:`⚔️ ${raidNames?.primary || "성역"}`},
          {key:"schedule2",label:`⚔️ ${raidNames?.secondary || "성역2"}`},
          {key:"extra",label:"➕ 추가모집"},
          ...(user?.isAdmin?[{key:"admin",label:"🔐 관리자"}]:[])
        ].map(t=>(
          <button
            key={t.key}
            onClick={()=>setTab(t.key)}
            style={{
              padding:"14px 20px",border:"none",background:"transparent",cursor:"pointer",fontFamily:"inherit",
              color:tab===t.key?"#a78bfa":"#444",fontWeight:tab===t.key?700:400,fontSize:13,
              borderBottom:tab===t.key?"2px solid #6d4aff":"2px solid transparent",
              marginBottom:-1,transition:"all .2s",whiteSpace:"nowrap"
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 콘텐츠 */}
      <div style={{maxWidth:960,margin:"0 auto",padding:"24px 16px"}}>
        {children}
      </div>
    </>
  );
}

