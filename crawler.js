import puppeteer from 'puppeteer';
import fs from 'fs';

(async () => {
  const browser = await puppeteer.launch({ 
    headless: "new",
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled'
    ] 
  });
  const page = await browser.newPage();
  
  await page.setViewport({ width: 1280, height: 1080 });

  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"'
  });

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (req.resourceType() === 'image' || req.resourceType() === 'stylesheet' || req.resourceType() === 'font') {
      req.abort();
    } else {
      req.continue();
    }
  });

  page.on('console', msg => {
    if (!msg.text().includes('Failed to load resource')) {
      console.log('🌐 브라우저 내부:', msg.text());
    }
  });

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
  
  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('서버 접속 화면 스크린샷 저장 중...');
  try {
    await page.screenshot({ path: './public/debug_screenshot.png', fullPage: true });
    console.log('✅ 디버그용 스크린샷 저장 완료');
  } catch (err) {
    console.log('❌ 스크린샷 저장 실패:', err.message);
  }

  console.log('데이터 추출 시작...');
  
  const extractedArray = await page.evaluate(() => {
    const tables = document.querySelectorAll('table');
    console.log(`페이지 내 전체 표(table) 개수: ${tables.length}개`);

    let targetTable = null;
    let maxRows = 0;

    // 🚨 핵심 수정: 여러 개의 표 중에서 '실제 유저 데이터'가 가장 많은 진짜 표를 찾습니다.
    tables.forEach((table, index) => {
      const userCount = table.querySelectorAll('a.nickname-link').length;
      if (userCount > 0) {
        console.log(`- ${index + 1}번째 표의 유저 수: ${userCount}명`);
      }
      
      if (userCount > maxRows) {
        maxRows = userCount;
        targetTable = table;
      }
    });

    if (!targetTable) {
      console.log('유저 데이터가 있는 표를 찾지 못했습니다.');
      return [];
    }

    const rows = targetTable.querySelectorAll('tbody tr'); 
    console.log(`최종 선택된 표에서 탐색할 줄(tr) 개수: ${rows.length}개`); 

    const dataList = [];
    const seenNicknames = new Set(); 

    rows.forEach(row => {
      const nicknameEl = row.querySelector('a.nickname-link');
      if (!nicknameEl) return; 
      
      const nickname = nicknameEl.getAttribute('data-nickname');
      if (!nickname) return;
      const cleanNickname = nickname.trim();

      const tds = row.querySelectorAll('td');
      if (tds.length < 6) return;

      const job = tds[3] ? tds[3].innerText.trim() : ''; 
      const atoolScore = tds[4] ? tds[4].innerText.trim().replace(/,/g, '') : ''; 
      const combatPower = tds[5] ? tds[5].innerText.trim().replace(/,/g, '') : '';

      if (!job || !combatPower) return;

      if (seenNicknames.has(cleanNickname)) return;
      seenNicknames.add(cleanNickname);

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