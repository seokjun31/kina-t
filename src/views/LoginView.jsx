import React from "react";

export default function LoginView({ codeInput, setCodeInput, loginError, onLogin, AION_LOGO }) {
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",padding:24,background:"radial-gradient(ellipse at 50% 0%,rgba(109,74,255,.2) 0%,transparent 60%)"}}>
      <div style={{width:"100%",maxWidth:380}}>
        <div style={{textAlign:"center",marginBottom:44}}>
          <div style={{marginBottom:10,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <img src={AION_LOGO} alt="AION2" style={{width:120,height:120,objectFit:"contain",filter:"drop-shadow(0 0 24px rgba(6,182,212,.6)) drop-shadow(0 0 8px rgba(167,139,250,.5))"}}/>
          </div>
          <h1 style={{fontSize:34,fontWeight:900,background:"linear-gradient(135deg,#a78bfa,#c4b5fd,#818cf8)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",letterSpacing:-1,marginBottom:4}}>바바룽</h1>
              <p style={{color:"#a78bfa",fontSize:14,letterSpacing:4,fontWeight:700,marginBottom:8}}>KINA</p>
              <p style={{color:"#333",fontSize:12,letterSpacing:2}}>AION2 SANCTUARY SCHEDULER</p>
        </div>
        <div style={{background:"linear-gradient(145deg,#111120,#0d0d18)",border:"1px solid #1e1e30",borderRadius:22,padding:30,boxShadow:"0 24px 80px rgba(0,0,0,.7)"}}>
          <label style={{display:"block",marginBottom:10,fontSize:11,color:"#444",letterSpacing:2,fontWeight:600}}>ACCESS CODE</label>
          <input
            style={{width:"100%",padding:"15px",background:"#08080f",border:"1px solid #1e1e30",borderRadius:12,color:"#c4b5fd",fontFamily:"inherit",fontSize:22,letterSpacing:10,textAlign:"center",marginBottom:10,transition:"border .2s",fontWeight:700}}
            placeholder="· · · ·"
            value={codeInput}
            onChange={e => setCodeInput(e.target.value.toUpperCase())}
            onKeyDown={e => e.key==="Enter" && onLogin()}
            onFocus={e => e.target.style.borderColor="#6d4aff"}
            onBlur={e => e.target.style.borderColor="#1e1e30"}
            maxLength={8}
          />
          {loginError && <p style={{color:"#ef4444",fontSize:12,marginBottom:12,textAlign:"center",padding:"8px",background:"rgba(239,68,68,.1)",borderRadius:8}}>{loginError}</p>}
          <button
            onClick={onLogin}
            style={{width:"100%",padding:"14px",background:"linear-gradient(135deg,#6d4aff,#a78bfa)",border:"none",borderRadius:12,color:"#fff",fontFamily:"inherit",fontSize:15,fontWeight:900,cursor:"pointer",letterSpacing:1,boxShadow:"0 8px 24px rgba(109,74,255,.5)"}}
            onMouseEnter={e=>e.target.style.transform="translateY(-1px)"}
            onMouseLeave={e=>e.target.style.transform=""}
          >
            접속하기
          </button>
        </div>
        <p style={{textAlign:"center",marginTop:20,fontSize:11,color:"#1e1e30"}}>Powered by KINA Guild · AION2</p>
        <p style={{textAlign:"center",marginTop:8,fontSize:10,color:"#2a2a3a"}}>@made by JSJ</p>
      </div>
    </div>
  );
}

