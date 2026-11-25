import puppeteer from "puppeteer";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, collection, query, where, getDocs, doc, writeBatch } from "firebase/firestore";

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

function normalizeAirport(name = "") {
  if (!name) return "";
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[-_.,]/g, " ")
    .replace(/\s+/g, " ")
    .toUpperCase()
    .trim();
}

function formatVnTime(timestampSec) {
  if (!timestampSec) return null;
  const d = new Date(timestampSec * 1000);
  return d.toLocaleTimeString("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function getNextDayStr(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().split("T")[0];
}

// 4 liên kết TIA
const TIA_TARGETS = [
  { url: "https://tia.vietnamairport.vn/Depdom", tripType: "D", stationType: "DOM", name: "Đi Quốc Nội" },
  { url: "https://tia.vietnamairport.vn/Depint", tripType: "D", stationType: "INT", name: "Đi Quốc Tế" },
  { url: "https://tia.vietnamairport.vn/arrDom", tripType: "A", stationType: "DOM", name: "Đến Quốc Nội" },
  { url: "https://tia.vietnamairport.vn/arrint", tripType: "A", stationType: "INT", name: "Đến Quốc Tế" },
];

async function scrapeTIAPage(browser, target) {
  const page = await browser.newPage();
  // Chặn tải ảnh và font để tăng tốc tối đa
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    if (["image", "font", "media"].includes(req.resourceType())) {
      req.abort();
    } else {
      req.continue();
    }
  });

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
  );
  await page.setViewport({ width: 1920, height: 1080 });

  console.log(`[TIA Song Song] Bắt đầu tải: ${target.name}...`);
  try {
    await page.goto(target.url, { waitUntil: "networkidle2", timeout: 35000 });
  } catch (e) {
    // Bỏ qua lỗi timeout nhẹ của WebSocket
  }

  try {
    await page.waitForSelector("table.k-grid-table tbody tr.k-table-row", { timeout: 20000 });
  } catch (e) {
    console.log(`[Cảnh báo] Chưa thấy bảng tại ${target.name}`);
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
          const mainFlight = flightNoRaw.split(",")[0].trim();
          const cleanFlt = mainFlight.replace(/\s+/g, "").toUpperCase();
          list.push({
            std,
            etd: etd || std,
            airportName,
            cleanFlightNo: cleanFlt,
            displayFlightNo: flightNoRaw,
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

  // Chờ 12s để bảng lật sang trang 2/2
  await new Promise((r) => setTimeout(r, 12000));

  // Đợt 2
  const b2 = await collectRows();
  b2.forEach((f) => flightsMap.set(f.cleanFlightNo, f));

  await page.close();

  return Array.from(flightsMap.values()).map((f) => ({
    ...f,
    tripType: target.tripType,
    stationType: target.stationType,
    normalizedAirport: normalizeAirport(f.airportName),
  }));
}

// Cào Flightradar24
async function scrapeFlightradar24(browser) {
  console.log("=== [FLIGHTRADAR24] BẮT ĐẦU CÀO GIỜ DỰ ĐÁP (ETA) ===");
  const frPage = await browser.newPage();
  await frPage.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
  );

  const frMap = new Map();

  try {
    await frPage.goto("https://www.flightradar24.com/data/airports/sgn/arrivals", {
      waitUntil: "domcontentloaded",
      timeout: 35000,
    });

    const apiResult = await frPage.evaluate(async () => {
      try {
        const response = await fetch(
          "https://api.flightradar24.com/common/v1/airport.json?code=sgn&plugin[]=&plugin-setting[schedule][mode]=arrivals&page=1&limit=100",
          { headers: { Accept: "application/json" } }
        );
        return await response.json();
      } catch (e) {
        return null;
      }
    });

    if (
      apiResult &&
      apiResult.result &&
      apiResult.result.response &&
      apiResult.result.response.airport &&
      apiResult.result.response.airport.pluginData &&
      apiResult.result.response.airport.pluginData.schedule &&
      apiResult.result.response.airport.pluginData.schedule.arrivals
    ) {
      const arrivals = apiResult.result.response.airport.pluginData.schedule.arrivals.data || [];
      arrivals.forEach((item) => {
        const flt = item.flight;
        if (!flt || !flt.identification || !flt.identification.number) return;
        const flightNo = (flt.identification.number.default || "").replace(/\s+/g, "").toUpperCase();

        let etaSec = null;
        if (flt.time && flt.time.estimated && flt.time.estimated.arrival) {
          etaSec = flt.time.estimated.arrival;
        } else if (flt.time && flt.time.real && flt.time.real.arrival) {
          etaSec = flt.time.real.arrival;
        }

        const etaFormatted = formatVnTime(etaSec);
        if (flightNo && etaFormatted) {
          frMap.set(flightNo, etaFormatted);
        }
      });
    }
  } catch (err) {
    console.error("[FR24] Lỗi cào Flightradar24:", err.message);
  } finally {
    await frPage.close();
  }

  console.log(`[FR24] Đã lấy thành công ETA của ${frMap.size} chuyến bay đến`);
  return frMap;
}

async function main() {
  const startTime = Date.now();

  const now = new Date();
  const vnFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const parts = vnFormatter.formatToParts(now);
  const curYear = parts.find((p) => p.type === "year")?.value;
  const curMonth = parts.find((p) => p.type === "month")?.value;
  const curDay = parts.find((p) => p.type === "day")?.value;
  const curHour = parseInt(parts.find((p) => p.type === "hour")?.value || "12", 10);

  const todayCalStr = `${curYear}-${curMonth}-${curDay}`;
  const nextDayCalStr = getNextDayStr(todayCalStr);

  console.log(`=== BẮT ĐẦU CÀO SONG SONG TIA & FR24 (GIỜ VN: ${curHour}h, NGÀY: ${todayCalStr}) ===`);

  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--disable-gpu",
    ],
  });

  // CHẠY ĐỒNG THỜI SONG SONG CẢ 4 TRANG TIA VÀ FLIGHTRADAR24 CÙNG LÚC!
  const [tiaResults, fr24Map] = await Promise.all([
    Promise.all(TIA_TARGETS.map((target) => scrapeTIAPage(browser, target))),
    scrapeFlightradar24(browser),
  ]);

  await browser.close();

  const allTIA = tiaResults.flat();
  console.log(`=== TỔNG THU THẬP: ${allTIA.length} chuyến bay từ TIA (Chỉ mất ${(Date.now() - startTime) / 1000}s) ===`);

  // Lưu hợp nhất vào Firebase
  const arrivalSnap = await getDocs(
    query(
      collection(db, "flights_sgn"),
      where("date", "in", [todayCalStr, nextDayCalStr]),
      where("tripType", "==", "A")
    )
  );

  const batch = writeBatch(db);

  for (const f of allTIA) {
    const timeKey = (f.std || "").replace(/[^0-9]/g, "");

    let assignedDate = todayCalStr;
    if (curHour >= 18 && (f.std || "") < "03:00") {
      assignedDate = nextDayCalStr;
    }

    const docId = `${assignedDate}_${f.tripType}_${f.cleanFlightNo}_${timeKey}`;
    const flightRef = doc(db, "flights_sgn", docId);

    const updateData = {
      date: assignedDate,
      stationType: f.stationType,
      tripType: f.tripType,
      flightNo: f.cleanFlightNo,
      displayFlightNo: f.displayFlightNo,
      st: f.std,
      et: f.etd,
      airportName: f.normalizedAirport,
      terminal: f.terminal,
      checkinRow: f.checkinRow,
      beltGate: f.beltGate,
      remark: f.remark,
      hasTIAData: true,
      source: "TIA_ACV",
      updatedAt: new Date().toISOString(),
    };

    if (f.tripType === "A" && fr24Map.has(f.cleanFlightNo)) {
      updateData.fr24ETA = fr24Map.get(f.cleanFlightNo);
    }

    batch.set(flightRef, updateData, { merge: true });
  }

  // Cập nhật FR24 ETA cho các chuyến đến đã có
  arrivalSnap.forEach((docSnap) => {
    const flightData = docSnap.data();
    const cleanFlt = (flightData.flightNo || "").replace(/\s+/g, "").toUpperCase();
    if (fr24Map.has(cleanFlt)) {
      const eta = fr24Map.get(cleanFlt);
      batch.set(docSnap.ref, { fr24ETA: eta }, { merge: true });
    }
  });

  const metaRef = doc(db, "meta", "sync_status");
  batch.set(
    metaRef,
    {
      lastUpdated: new Date().toISOString(),
      tiaLastCount: allTIA.length,
      fr24Count: fr24Map.size,
      source: "HYBRID PARALLEL (VIAGS + TIA + FR24)",
      durationSec: Math.round((Date.now() - startTime) / 1000),
    },
    { merge: true }
  );

  await batch.commit();
  console.log(`=== ĐÃ CẬP NHẬT CA TRỰC THÀNH CÔNG VÀO FIREBASE! (Tổng thời gian: ${(Date.now() - startTime) / 1000}s) ===`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Lỗi chương trình:", err);
  process.exit(1);
});