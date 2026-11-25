import puppeteer from "puppeteer";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, doc, writeBatch } from "firebase/firestore";

// Cấu hình Firebase
const firebaseConfig = {
  apiKey: "AIzaSyD5xJ95pYWckUcnbGzrD6mPUcYEFrwuUj8",
  authDomain: "flight-status-b0895.firebaseapp.com",
  projectId: "flight-status-b0895",
  storageBucket: "flight-status-b0895.firebasestorage.app",
  messagingSenderId: "274057468561",
  appId: "1:274057468561:web:f8edcb85d692caebb9bd30",
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

// 4 liên kết FIDS chính thức của TIA
const TIA_TARGETS = [
  { url: "https://tia.vietnamairport.vn/Depdom", tripType: "D", stationType: "DOM", name: "Đi Quốc Nội" },
  { url: "https://tia.vietnamairport.vn/Depint", tripType: "D", stationType: "INT", name: "Đi Quốc Tế" },
  { url: "https://tia.vietnamairport.vn/arrDom", tripType: "A", stationType: "DOM", name: "Đến Quốc Nội" },
  { url: "https://tia.vietnamairport.vn/arrint", tripType: "A", stationType: "INT", name: "Đến Quốc Tế" },
];

async function scrapePage(browser, target) {
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
  );
  await page.setViewport({ width: 1920, height: 1080 });

  console.log(`[TIA] Đang mở trang: ${target.name} (${target.url})...`);
  try {
    await page.goto(target.url, { waitUntil: "networkidle2", timeout: 45000 });
  } catch (e) {
    console.log(`Chờ tải trang hoàn tất...`);
  }

  try {
    await page.waitForSelector("table.k-grid-table tbody tr.k-table-row", { timeout: 25000 });
  } catch (e) {
    console.log(`[Cảnh báo] Chưa tìm thấy bảng chuyến bay tại ${target.name}`);
    await page.close();
    return [];
  }

  const flightsMap = new Map();

  async function collectRows() {
    return await page.evaluate(() => {
      const rows = document.querySelectorAll("table.k-grid-table tbody tr.k-table-row");
      const list = [];

      rows.forEach((row) => {
        const getCol = (idx) => {
          const td = row.querySelector(`td[data-col-index="${idx}"]`);
          return td ? td.innerText.trim() : "";
        };

        const std = getCol(0);
        const etd = getCol(1);
        const airportName = getCol(2);
        const flightNo = getCol(3);
        const terminal = getCol(4);
        const checkinRow = getCol(5);
        const beltGate = getCol(6);
        const remark = getCol(7);

        if (flightNo) {
          list.push({
            std,
            etd: etd || std,
            airportName,
            flightNo: flightNo.replace(/\s+/g, ""),
            displayFlightNo: flightNo,
            terminal,
            checkinRow,
            beltGate,
            remark,
          });
        }
      });
      return list;
    });
  }

  // Đợt 1
  const b1 = await collectRows();
  b1.forEach((f) => flightsMap.set(f.flightNo, f));

  // Chờ 12 giây để TIA tự lật sang trang tiếp theo (ví dụ trang 2/2)
  console.log(`[TIA] Chờ 12s để bảng lật sang trang 2/2...`);
  await new Promise((r) => setTimeout(r, 12000));

  // Đợt 2
  const b2 = await collectRows();
  b2.forEach((f) => flightsMap.set(f.flightNo, f));

  await page.close();

  const results = Array.from(flightsMap.values()).map((f) => ({
    ...f,
    tripType: target.tripType,
    stationType: target.stationType,
  }));

  console.log(`[TIA] Đã bóc tách thành công ${results.length} chuyến bay từ ${target.name}`);
  return results;
}

async function main() {
  const todayVn = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date());

  console.log(`=== BẮT ĐẦU CÀO DỮ LIỆU TIA FIDS (NGÀY: ${todayVn}) ===`);

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  let allFlights = [];

  for (const target of TIA_TARGETS) {
    try {
      const items = await scrapePage(browser, target);
      allFlights.push(...items);
    } catch (err) {
      console.error(`Lỗi cào ${target.name}:`, err);
    }
  }

  await browser.close();
  console.log(`=== TỔNG CỘNG THU THẬP: ${allFlights.length} chuyến bay từ TIA ===`);

  if (allFlights.length === 0) {
    console.log("Không có dữ liệu mới để lưu.");
    process.exit(0);
  }

  // Hợp nhất dữ liệu vào Firestore
  const batch = writeBatch(db);
  for (const f of allFlights) {
    const docId = `${todayVn}_${f.stationType}_${f.tripType}_${f.flightNo}_${f.std || ""}`.replace(
      /[^a-zA-Z0-9_-]/g,
      "_"
    );

    const flightRef = doc(db, "flights_sgn", docId);

    // merge: true giúp giữ lại tên Hãng bay (nếu VIAGS đã có) và bổ sung thêm Terminal, Row từ TIA
    batch.set(
      flightRef,
      {
        date: todayVn,
        stationType: f.stationType,
        tripType: f.tripType,
        flightNo: f.displayFlightNo,
        st: f.std,
        et: f.etd,
        airportName: f.airportName,
        terminal: f.terminal,
        checkinRow: f.checkinRow,
        beltGate: f.beltGate,
        remark: f.remark,
        source: "TIA_ACV",
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  }

  // Cập nhật trạng thái
  const metaRef = doc(db, "meta", "sync_status");
  batch.set(
    metaRef,
    {
      lastUpdated: new Date().toISOString(),
      totalFlightsTIA: allFlights.length,
      source: "HYBRID (VIAGS + TIA)",
    },
    { merge: true }
  );

  await batch.commit();
  console.log("=== ĐÃ CẬP NHẬT HỢP NHẤT THÀNH CÔNG VÀO FIREBASE! ===");
  process.exit(0);
}

main().catch((err) => {
  console.error("Lỗi:", err);
  process.exit(1);
});