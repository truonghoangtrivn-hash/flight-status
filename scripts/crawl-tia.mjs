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

// 4 liên kết TIA
const TIA_TARGETS = [
  { url: "https://tia.vietnamairport.vn/Depdom", tripType: "D", stationType: "DOM", name: "Đi Quốc Nội" },
  { url: "https://tia.vietnamairport.vn/Depint", tripType: "D", stationType: "INT", name: "Đi Quốc Tế" },
  { url: "https://tia.vietnamairport.vn/arrDom", tripType: "A", stationType: "DOM", name: "Đến Quốc Nội" },
  { url: "https://tia.vietnamairport.vn/arrint", tripType: "A", stationType: "INT", name: "Đến Quốc Tế" },
];

async function scrapeTIA(browser, target) {
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

  const b1 = await collectRows();
  b1.forEach((f) => flightsMap.set(f.cleanFlightNo, f));

  console.log(`[TIA] Chờ 12s để bảng lật trang...`);
  await new Promise((r) => setTimeout(r, 12000));

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

// HÀM CÀO DỮ LIỆU FLIGHTRADAR24 DÀNH CHO CHUYẾN BAY ĐẾN SÂN BAY TÂN SƠN NHẤT (SGN ARRIVALS)
async function scrapeFlightradar24(browser) {
  console.log("=== [FLIGHTRADAR24] BẮT ĐẦU CÀO GIỜ DỰ ĐÁP (ETA) TÂN SƠN NHẤT ===");
  const frPage = await browser.newPage();
  await frPage.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
  );

  const frMap = new Map();

  try {
    // 1. Thử gọi trực tiếp cổng API JSON của Flightradar24
    await frPage.goto("https://www.flightradar24.com/data/airports/sgn/arrivals", {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });

    const apiResult = await frPage.evaluate(async () => {
      try {
        const response = await fetch(
          "https://api.flightradar24.com/common/v1/airport.json?code=sgn&plugin[]=&plugin-setting[schedule][mode]=arrivals&page=1&limit=100",
          {
            headers: {
              Accept: "application/json",
            },
          }
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
      console.log(`[FR24] Nhận được ${arrivals.length} chuyến bay đến từ API Flightradar24`);

      arrivals.forEach((item) => {
        const flt = item.flight;
        if (!flt || !flt.identification || !flt.identification.number) return;
        const flightNo = (flt.identification.number.default || "").replace(/\s+/g, "").toUpperCase();

        // Lấy giờ dự đáp (ETA): Ưu tiên estimated arrival, nếu đã hạ cánh thì lấy real arrival
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
    } else {
      // 2. Dự phòng: Đọc trực tiếp từ bảng HTML của Flightradar24 nếu API bị chặn
      console.log("[FR24] Chuyển sang đọc trực tiếp bảng DOM Flightradar24...");
      const tableData = await frPage.evaluate(() => {
        const rows = document.querySelectorAll("table#tbl-datatable tbody tr");
        const list = [];
        rows.forEach((row) => {
          const fltLink = row.querySelector("a[data-flight]");
          const statusCell = row.querySelector("td.cell-status");
          if (fltLink && statusCell) {
            const flight = fltLink.innerText.trim().replace(/\s+/g, "").toUpperCase();
            const text = statusCell.innerText.trim();
            // Bóc tách giờ (ví dụ "Estimated 23:00" hoặc "Landed 22:50" hoặc "11:00 PM")
            const timeMatch = text.match(/(\d{1,2}:\d{2})/);
            if (flight && timeMatch) {
              list.push({ flight, eta: timeMatch[1] });
            }
          }
        });
        return list;
      });

      tableData.forEach((item) => {
        frMap.set(item.flight, item.eta);
      });
    }
  } catch (err) {
    console.error("[FR24] Lỗi khi cào Flightradar24:", err.message);
  } finally {
    await frPage.close();
  }

  console.log(`[FR24] Đã trích xuất thành công ETA của ${frMap.size} chuyến bay đến từ Flightradar24`);
  return frMap;
}

async function main() {
  const todayVn = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date());

  console.log(`=== BẮT ĐẦU CÀO DỮ LIỆU TIA & FLIGHTRADAR24 (NGÀY: ${todayVn}) ===`);

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  // 1. Cào 4 trang TIA
  let allTIA = [];
  for (const target of TIA_TARGETS) {
    try {
      const items = await scrapeTIA(browser, target);
      allTIA.push(...items);
    } catch (err) {
      console.error(`Lỗi cào ${target.name}:`, err);
    }
  }

  // 2. Cào giờ dự đáp từ Flightradar24
  let fr24Map = new Map();
  try {
    fr24Map = await scrapeFlightradar24(browser);
  } catch (err) {