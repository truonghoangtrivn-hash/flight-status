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

// Hàm chuẩn hóa tên sân bay sang tiếng Anh viết hoa không dấu
function normalizeAirport(name = "") {
  if (!name) return "";
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toUpperCase()
    .trim();
}

// 4 liên kết FIDS của TIA
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

  console.log(`[TIA] Đang mở trang: ${target.name}...`);
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
        const flightNoRaw = getCol(3);
        const terminal = getCol(4);
        const checkinRow = getCol(5);
        const beltGate = getCol(6);
        const remark = getCol(7);

        if (flightNoRaw) {
          // Bóc tách chuyến bay chính nếu có liên danh (ví dụ "GA 9610, KL 3855" -> lấy "GA9610")
          const mainFlight = flightNoRaw.split(",")[0].trim();
          const cleanFlt = mainFlight.replace(/\s+/g, "").toUpperCase();

          list.push({
            std,
            etd: etd || std,
            airportName,
            cleanFlightNo: cleanFlt,
            displayFlightNo: flightNoRaw, // Giữ nguyên chuỗi hiển thị
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
  b1.forEach((f) => flightsMap.set(f.cleanFlightNo, f));

  // Chờ 12 giây để bảng lật trang
  console.log(`[TIA] Chờ 12s để bảng lật trang...`);
  await new Promise((r) => setTimeout(r, 12000));

  // Đợt 2
  const b2 = await collectRows();
  b2.forEach((f) => flightsMap.set(f.cleanFlightNo, f));

  await page.close();

  const results = Array.from(flightsMap.values()).map((f) => ({
    ...f,
    tripType: target.tripType,
    stationType: target.stationType,
    normalizedAirport: normalizeAirport(f.airportName),
  }));

  console.log(`[TIA] Đã bóc tách được ${results.length} chuyến bay từ ${target.name}`);
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
    const timeKey = (f.std || "").replace(/[^0-9]/g, "");
    // Khóa định danh chuẩn hóa: Ngày_Hướng_MãBayChuẩn_GiờChuẩn
    const docId = `${todayVn}_${f.tripType}_${f.cleanFlightNo}_${timeKey}`;

    const flightRef = doc(db, "flights_sgn", docId);

    // Ghi đè ưu tiên từ TIA: Cửa, Trạng thái, Quầy, Nhà ga và Tên điểm đến viết hoa
    const updateData = {
      date: todayVn,
      stationType: f.stationType,
      tripType: f.tripType,
      flightNo: f.cleanFlightNo,
      displayFlightNo: f.displayFlightNo,
      st: f.std,
      et: f.etd,
      airportName: f.normalizedAirport, // Chuẩn hóa viết hoa quốc tế (HA NOI, DA NANG...)
      terminal: f.terminal,
      checkinRow: f.checkinRow,
      beltGate: f.beltGate,
      remark: f.remark,
      hasTIAData: true, // Đánh dấu cờ TIA để VIAGS không ghi đè Gate & Remark
      source: "TIA_ACV",
      updatedAt: new Date().toISOString(),
    };

    batch.set(flightRef, updateData, { merge: true });
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