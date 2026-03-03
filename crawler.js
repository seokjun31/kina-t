import puppeteer from 'puppeteer';
import fs from 'fs';

(async () => {
  const browser = await puppeteer.launch({ 
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  });
  const page = await browser.newPage();
  
  await page.setViewport({ width: 1280, height: 1080 });

  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
  });

  // 브라우저 내부 로그를 터미널로 가져오기 (에러 추적용)
  page.on('console', msg => console.log('🌐 브라우저 내부:', msg.text()));

  const url = 'https://www.aion2tool.com/region/%EB%B0%94%EB%B0%94%EB%A3%BD/%ED%82%A4%EB%82%98';
  console.log('페이지 접속 중...');
  
  await page.goto(url, { waitUntil: 'networkidle2' });

  try {
    await page.waitForSelector('a.nickname-link', { timeout: 15000 });
  } catch (error) {
    console.log('데이터 로딩 지연 중...');
  }

  console.log('숨겨진 인원을 불러오기 위해 화면을 스크롤합니다 (약 5초 소요)...');
  await autoScroll(page);
  
  // 스크롤 후 데이터가 자리 잡을 수 있게 조금 넉넉히 대기
  await new Promise(resolve => setTimeout(resolve, 8000));

  console.log('서버 접속 화면 스크린샷 저장 중...');
  try {
    await page.screenshot({ path: './public/debug_screenshot.png', fullPage: true });
    console.log('✅ 디버그용 스크린샷 저장 완료 (public/debug_screenshot.png)');
  } catch (err) {
    console.log('❌ 스크린샷 저장 실패:', err.message);
  }

  console.log('데이터 추출 시작...');
  
  const extractedArray = await page.evaluate(() => {
    const rows = document.querySelectorAll('tbody tr'); 
    console.log(`탐색된 전체 줄(tr) 개수: ${rows.length}개`); // 내부 로그 확인용

    const dataList = [];
    const seenNicknames = new Set(); 

    rows.forEach(row => {
      // 🚨 새롭게 적용된 숨김 데이터 필터링 (GitHub 환경에서도 안전하게 작동)
      // 1. CSS로 완전히 숨겨진 경우 제외
      const style = window.getComputedStyle(row);
      if (style.display === 'none' || style.visibility === 'hidden') return;
      
      // 2. 화면에 공간을 차지하지 않는(크기가 0인) 투명 요소 제외
      const rect = row.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;

      const nicknameEl = row.querySelector('a.nickname-link');
      if (!nicknameEl) return; 
      
      const nickname = nicknameEl.getAttribute('data-nickname');
      if (!nickname) return;
      const cleanNickname = nickname.trim();

      if (seenNicknames.has(cleanNickname)) return;
      seenNicknames.add(cleanNickname);

      const tds = row.querySelectorAll('td');
      const job = tds[3] ? tds[3].innerText.trim() : ''; 
      const atoolScore = tds[4] ? tds[4].innerText.trim().replace(/,/g, '') : ''; 
      const combatPower = tds[5] ? tds[5].innerText.trim().replace(/,/g, '') : '';

      dataList.push({
        nick: cleanNickname,
        job: job,
        atul: atoolScore,
        ilv: combatPower,
        code: Math.random().toString(36).substring(2,6).toUpperCase()
      });
    });

    return dataList;
  });

  const totalCount = extractedArray ? extractedArray.length : 0;
  console.log(`\n🎉 총 ${totalCount}명의 데이터를 찾았습니다!`);

  const fileName = './public/aion2_legion_data.json'; 
  try {
    fs.writeFileSync(fileName, JSON.stringify(extractedArray, null, 2), 'utf-8');
    console.log(`✅ [${fileName}] 파일 JSON 저장 완료!`);
  } catch (err) {
    console.error(`❌ 파일 저장 오류: ${err.message}`);
  }

  await browser.close();
})();

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      let distance = 300; 
      let timer = setInterval(() => {
        let scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight - window.innerHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  });
}