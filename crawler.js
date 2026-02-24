import puppeteer from 'puppeteer';
import fs from 'fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

// ─── Firebase 초기화 ──────────────────────────────────────────────────────────
// 로컬: node --env-file=.env crawler.js (VITE_ 접두어 사용)
// GitHub Actions: secrets에서 FIREBASE_ 접두어로 주입
const firebaseConfig = {
  apiKey:            process.env.FIREBASE_API_KEY            || process.env.VITE_FIREBASE_API_KEY,
  authDomain:        process.env.FIREBASE_AUTH_DOMAIN        || process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.FIREBASE_PROJECT_ID         || process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.FIREBASE_STORAGE_BUCKET     || process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID|| process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.FIREBASE_APP_ID             || process.env.VITE_FIREBASE_APP_ID,
};

if (!firebaseConfig.projectId) {
  console.error('❌ Firebase 환경변수가 설정되지 않았습니다.');
  console.error('   로컬 실행: node --env-file=.env crawler.js');
  process.exit(1);
}

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

const loadFromFirebase = async (key) => {
  const snap = await getDoc(doc(db, 'kina_data', key));
  return snap.exists() ? snap.data().value : null;
};

const saveToFirebase = async (key, value) => {
  await setDoc(doc(db, 'kina_data', key), { value });
};

// ─── 크롤링 ──────────────────────────────────────────────────────────────────
(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1080 });

  const url = 'https://www.aion2tool.com/region/%EB%B0%94%EB%B0%94%EB%A3%BD/%ED%82%A4%EB%82%98';
  console.log('페이지 접속 중...');
  await page.goto(url, { waitUntil: 'networkidle2' });

  try {
    await page.waitForSelector('a.nickname-link', { timeout: 5000 });
  } catch {
    console.log('데이터 로딩 지연 중...');
  }

  console.log('스크롤 중 (2~3초)...');
  await autoScroll(page);
  await new Promise(r => setTimeout(r, 2000));

  console.log('데이터 추출 시작...');
  const crawledData = await page.evaluate(() => {
    const rows = document.querySelectorAll('tbody tr');
    const list = [];
    const seen = new Set();

    rows.forEach(row => {
      if (row.offsetParent === null) return;
      const el = row.querySelector('a.nickname-link');
      if (!el) return;

      const nick = el.getAttribute('data-nickname').trim();
      if (seen.has(nick)) return;
      seen.add(nick);

      const tds = row.querySelectorAll('td');
      list.push({
        nick,
        job:  tds[3]?.innerText.trim() || '',
        atul: tds[4]?.innerText.trim().replace(/,/g, '') || '',
        ilv:  tds[5]?.innerText.trim().replace(/,/g, '') || '',
        code: Math.random().toString(36).substring(2, 6).toUpperCase(),
      });
    });
    return list;
  });

  await browser.close();
  console.log(`\n🎉 총 ${crawledData.length}명 수집 완료`);

  if (crawledData.length === 0) {
    console.warn('⚠️  수집된 데이터가 없습니다. Firebase 저장을 건너뜁니다.');
    process.exit(0);
  }

  // ─── JSON 저장 (기존 방식 유지) ─────────────────────────────────────────────
  try {
    fs.writeFileSync(
      './public/aion2_legion_data.json',
      JSON.stringify(crawledData, null, 2),
      'utf-8'
    );
    console.log('✅ public/aion2_legion_data.json 저장 완료');
  } catch (err) {
    console.warn('⚠️  JSON 파일 저장 실패 (계속 진행):', err.message);
  }

  // ─── Firebase 저장 ──────────────────────────────────────────────────────────
  try {
    console.log('\nFirebase 기존 유저 불러오는 중...');
    const existingUsers = await loadFromFirebase('kina:users') || [];

    // 크롤링 데이터 + Firebase 기존 데이터 병합
    // 기존 유저면 code, isAdmin 유지 / 신규 유저면 임시 code 부여
    const mergedUsers = crawledData.map(crawled => {
      const existing = existingUsers.find(u => u.nick === crawled.nick);
      return {
        nick:    crawled.nick,
        job:     crawled.job,
        atul:    crawled.atul,
        ilv:     crawled.ilv,
        code:    existing?.code    || crawled.code,
        isAdmin: existing?.isAdmin || false,
      };
    });

    await saveToFirebase('kina:users', mergedUsers);
    console.log(`✅ Firebase에 ${mergedUsers.length}명 저장 완료!`);

    // 신규 유저 / 퇴장 유저 로그
    const newUsers     = mergedUsers.filter(u => !existingUsers.find(e => e.nick === u.nick));
    const removedUsers = existingUsers.filter(e => !mergedUsers.find(u => u.nick === e.nick));
    if (newUsers.length)     console.log(`   ➕ 신규: ${newUsers.map(u => u.nick).join(', ')}`);
    if (removedUsers.length) console.log(`   ➖ 제거: ${removedUsers.map(u => u.nick).join(', ')}`);

  } catch (err) {
    console.error('❌ Firebase 저장 실패:', err.message);
    process.exit(1);
  }
})();

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise(resolve => {
      let total = 0;
      const timer = setInterval(() => {
        window.scrollBy(0, 100);
        total += 100;
        if (total >= document.body.scrollHeight - window.innerHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  });
}
