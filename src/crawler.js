import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

// 투명 망토(스텔스) 장착!
puppeteer.use(StealthPlugin());

(async () => {
  // 💡 여기에 ScraperAPI 홈페이지에서 가입하고 받은 API 키를 넣으세요!
  const SCRAPER_API_KEY = '여기에_복사한_API_KEY_붙여넣기'; 

  // 1. GitHub Actions(리눅스 서버)에서 크래시 나지 않도록 샌드박스 비활성화 + 프록시 장착
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox',
      '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      '--proxy-server=http://proxy-server.scraperapi.com:8001' // 👈 ScraperAPI 세탁기 주소 추가!
    ]
  });

  const page = await browser.newPage();

  // 💡 2. 페이지 이동 전에 세탁기(프록시) 인증 비밀번호를 입력해 줍니다.
  await page.authenticate({
    username: 'scraperapi',
    password: SCRAPER_API_KEY
  });
  
  await page.setViewport({ width: 1280, height: 1080 });

  const url = 'https://www.aion2tool.com/region/%EB%B0%94%EB%B0%94%EB%A3%BD/%ED%82%A4%EB%82%98';
  console.log('페이지 접속 중...');
  
  await page.goto(url, { waitUntil: 'networkidle2' });

  // ... (이 아래 try ~ catch 부터 끝까지는 석준님 원래 코드 그대로 두시면 됩니다!) ...

  try {
    await page.waitForSelector('a.nickname-link', { timeout: 5000 });
  } catch (error) {
    console.log('데이터 로딩 지연 중...');
  }

  console.log('숨겨진 인원을 불러오기 위해 화면을 스크롤합니다 (약 2~3초 소요)...');
  await autoScroll(page);
  
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('데이터 추출 시작...');
  
  // 2. React에서 다루기 쉽도록 배열(Array) 형태로 추출
  const extractedArray = await page.evaluate(() => {
    const rows = document.querySelectorAll('tbody tr'); 
    const dataList = [];
    const seenNicknames = new Set(); 

    rows.forEach(row => {
      if (row.offsetParent === null) return; 

      const nicknameEl = row.querySelector('a.nickname-link');
      if (!nicknameEl) return; 
      
      const nickname = nicknameEl.getAttribute('data-nickname').trim();

      if (seenNicknames.has(nickname)) return;
      seenNicknames.add(nickname);

      const tds = row.querySelectorAll('td');
      const job = tds[3] ? tds[3].innerText.trim() : ''; 
      const atoolScore = tds[4] ? tds[4].innerText.trim().replace(/,/g, '') : ''; 
      const combatPower = tds[5] ? tds[5].innerText.trim().replace(/,/g, '') : '';

      // 객체 형태로 담아줍니다 (나중에 React에서 쓸 때 편합니다)
      dataList.push({
        nick: nickname,
        job: job,
        atul: atoolScore,
        ilv: combatPower,
        code: Math.random().toString(36).substring(2,6).toUpperCase() // 임시 접속 코드
      });
    });

    return dataList;
  });

  const totalCount = extractedArray ? extractedArray.length : 0;
  console.log(`\n🎉 총 ${totalCount}명의 데이터를 찾았습니다!`);

  // 3. React가 바로 읽을 수 있게 public 폴더에 JSON 형태로 저장
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
      let distance = 100;
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