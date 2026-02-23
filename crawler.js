const puppeteer = require('puppeteer');
const fs = require('fs'); 

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  // 화면을 넓게 써서 스크롤이 잘 먹히도록 설정합니다.
  await page.setViewport({ width: 1280, height: 1080 });

  const url = 'https://www.aion2tool.com/region/%EB%B0%94%EB%B0%94%EB%A3%BD/%ED%82%A4%EB%82%98';
  console.log('페이지 접속 중...');
  
  await page.goto(url, { waitUntil: 'networkidle2' });

  try {
    await page.waitForSelector('a.nickname-link', { timeout: 5000 });
  } catch (error) {
    console.log('데이터 로딩 지연 중...');
  }

  // ⭐️ 핵심 1: 나머지 27명을 깨우기 위해 화면 맨 아래까지 자동 스크롤합니다.
  console.log('숨겨진 인원을 불러오기 위해 화면을 스크롤합니다 (약 2~3초 소요)...');
  await autoScroll(page);
  
  // 스크롤 후 데이터가 화면에 그려질 시간을 2초 정도 줍니다.
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('데이터 추출 시작...');
  // 4. 페이지 내에서 표(Table) 단위로 세부 데이터 추출 및 중복 제거
  const resultString = await page.evaluate(() => {
    const rows = document.querySelectorAll('tbody tr'); 
    const extractedData = [];
    
    // 중복 닉네임을 걸러내기 위한 메모장
    const seenNicknames = new Set(); 

    rows.forEach(row => {
      // 화면에서 숨겨진 상태(모바일/PC 중복 등)인 줄은 건너뜁니다.
      if (row.offsetParent === null) return; 

      const nicknameEl = row.querySelector('a.nickname-link');
      if (!nicknameEl) return; 
      
      const nickname = nicknameEl.getAttribute('data-nickname').trim();

      // 이미 수집된 닉네임이면 건너뜁니다.
      if (seenNicknames.has(nickname)) return;
      seenNicknames.add(nickname);

      const tds = row.querySelectorAll('td');
      
      const job = tds[3] ? tds[3].innerText.trim() : ''; 
      const atoolScore = tds[4] ? tds[4].innerText.trim().replace(/,/g, '') : ''; 
      const combatPower = tds[5] ? tds[5].innerText.trim().replace(/,/g, '') : '';

      const rowData = `${nickname}|${job}|${atoolScore}|${combatPower}`;
      extractedData.push(rowData);
    });

    return extractedData.join(',');
  });

  // 5. 결과 출력 (총 몇 명인지 바로 확인)
  const totalCount = resultString ? resultString.split(',').length : 0;
  console.log(`\n🎉 총 ${totalCount}명의 데이터를 찾았습니다!`);

  // 6. 텍스트 파일(.txt)로 저장
  const fileName = 'aion2_legion_data.txt'; 
  try {
    fs.writeFileSync(fileName, resultString, 'utf-8');
    console.log(`✅ [${fileName}] 파일 저장 완료!`);
  } catch (err) {
    console.error(`❌ 파일 저장 오류: ${err.message}`);
  }

  await browser.close();
})();

// ⭐️ 핵심 2: 화면을 맨 아래까지 부드럽게 내려주는 자동 스크롤 함수
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