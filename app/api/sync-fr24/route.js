import { NextResponse } from "next/server";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore/lite";

export const maxDuration = 20;
export const dynamic = "force-dynamic";

const firebaseConfig = {
  apiKey: "AIzaSyD3hUDc9DjuIfDLL70z_uN4x7N3_Rkeczo",
  authDomain: "flight-status-2.firebaseapp.com",
  projectId: "flight-status-2",
  storageBucket: "flight-status-2.firebasestorage.app",
  messagingSenderId: "359685908297",
  appId: "1:359685908297:web:4bd32434e10323ee6bdc98",
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const dbLite = getFirestore(app);

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

function getVnDateFromTimestamp(timestampSec) {
  if (!timestampSec) return null;
  const d = new Date(timestampSec * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function getNextDayStr(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().split("T")[0];
}

// Tính ngày khai thác hiện tại (03:00 ngày D -> 02:59 ngày D+1)
function getCurrentOperationalDate() {
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
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "12", 10);

  const calDateStr = `${year}-${month}-${day}`;
  if (hour < 3) {
    const [y, m, d] = calDateStr.split("-").map(Number);
    const prev = new Date(Date.UTC(y, m - 1, d));
    prev.setUTCDate(prev.getUTCDate() - 1);
    return prev.toISOString().split("T")[0];
  }
  return calDateStr;
}

export async function GET(request) {
  return await handleSyncFR24(request);
}

export async function POST(request) {
  return await handleSyncFR24(request);
}

async function handleSyncFR24(request) {
  const startTime = Date.now();
  try {
    const { searchParams } = new URL(request.url);

    // Xác định Ngày khai thác D (03:00 -> 23:59) và Ngày kế tiếp D+1 (00:00 -> 02:59)
    const opDate = searchParams.get("date") || getCurrentOperationalDate();
    const nextDate = getNextDayStr(opDate);

    // 1. Gọi API Flightradar24
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const frRes = await fetch(
      "https://api.flightradar24.com/common/v1/airport.json?code=sgn&plugin[]=&plugin-setting[schedule][mode]=arrivals&page=1&limit=100",
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept: "application/json",
          Origin: "https://www.flightradar24.com",
          Referer: "https://www.flightradar24.com/data/airports/sgn/arrivals",
        },
        cache: "no-store",
        signal: controller.signal,
      }
    );
    clearTimeout(timeoutId);

    if (!frRes.ok) {
      throw new Error(`Flightradar24 HTTP ${frRes.status}`);
    }

    const json = await frRes.json();
    const arrivals =
      json?.result?.response?.airport?.pluginData?.schedule?.arrivals?.data || [];

    // Lưu map theo khóa chuẩn: NgàyLịchSTA_MãChuyếnBay
    const fr24ExactMap = new Map();

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

      const scheduledSec = flt.time?.scheduled?.arrival || etaSec;
      const staDate = getVnDateFromTimestamp(scheduledSec);
      const staTime = formatVnTime(scheduledSec);
      const etaFormatted = formatVnTime(etaSec);

      if (flightNo && staDate && etaFormatted) {
        const exactKey = `${staDate}_${flightNo}`;
        fr24ExactMap.set(exactKey, {
          eta: etaFormatted,
          status: flt.status?.text || "",
          staDate,
          staTime,
        });
      }
    });

    // 2. Đọc cả 2 bản ghi của Ca trực: Ngày D (opDate) và Ngày D+1 (nextDate)
    const day1Ref = doc(dbLite, "daily_sgn", opDate);
    const day2Ref = doc(dbLite, "daily_sgn", nextDate);

    const [day1Snap, day2Snap] = await Promise.all([getDoc(day1Ref), getDoc(day2Ref)]);

    let updatedDay1 = 0;
    let updatedDay2 = 0;
    const writePromises = [];

    // Cập nhật phần 1 của ca trực: Các chuyến đến trong ngày D có STA từ 03:00 đến 23:59
    if (day1Snap.exists()) {
      const day1Data = day1Snap.data();
      const flightsMap1 = day1Data.flights || {};

      for (const [key, flt] of Object.entries(flightsMap1)) {
        if (flt.tripType === "A") {
          // Tự động sửa lại nếu còn bản ghi cũ bị lệch cột Băng chuyền & Quầy (như VU8601)
          if (flt.checkinRow && isNaN(Number(flt.beltGate))) {
            flt.remark = flt.beltGate || flt.remark;
            flt.beltGate = flt.checkinRow;
            flt.checkinRow = "";
          }

          if ((flt.st || "") >= "03:00") {
            const cleanFlt = (flt.flightNo || "").replace(/\s+/g, "").toUpperCase();
            const exactKey = `${opDate}_${cleanFlt}`;

            if (fr24ExactMap.has(exactKey)) {
              const info = fr24ExactMap.get(exactKey);
              flightsMap1[key] = {
                ...flt,
                fr24ETA: info.eta,
                fr24Status: info.status,
              };
              updatedDay1++;
            }
          }
        }
      }

      writePromises.push(
        setDoc(
          day1Ref,
          {
            lastFR24Sync: new Date().toISOString(),
            flights: flightsMap1,
          },
          { merge: true }
        )
      );
    }

    // Cập nhật phần 2 của ca trực: Các chuyến đến rạng sáng ngày D+1 có STA từ 00:00 đến 02:59
    if (day2Snap.exists()) {
      const day2Data = day2Snap.data();
      const flightsMap2 = day2Data.flights || {};

      for (const [key, flt] of Object.entries(flightsMap2)) {
        if (flt.tripType === "A") {
          if (flt.checkinRow && isNaN(Number(flt.beltGate))) {
            flt.remark = flt.beltGate || flt.remark;
            flt.beltGate = flt.checkinRow;
            flt.checkinRow = "";
          }

          if ((flt.st || "") < "03:00") {
            const cleanFlt = (flt.flightNo || "").replace(/\s+/g, "").toUpperCase();
            const exactKey = `${nextDate}_${cleanFlt}`;

            if (fr24ExactMap.has(exactKey)) {
              const info = fr24ExactMap.get(exactKey);
              flightsMap2[key] = {
                ...flt,
                fr24ETA: info.eta,
                fr24Status: info.status,
              };
              updatedDay2++;
            }
          }
        }
      }

      writePromises.push(
        setDoc(
          day2Ref,
          {
            lastFR24Sync: new Date().toISOString(),
            flights: flightsMap2,
          },
          { merge: true }
        )
      );
    }

    await Promise.all(writePromises);

    return NextResponse.json({
      success: true,
      message: `Đã cập nhật FR24 theo quy luật 03:00->02:59+ (${updatedDay1} chuyến ngày ${opDate} + ${updatedDay2} chuyến rạng sáng ${nextDate})!`,
      opDate,
      nextDate,
      totalFR24: fr24ExactMap.size,
      updatedDay1,
      updatedDay2,
      duration: `${(Date.now() - startTime) / 1000}s`,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Lỗi sync FR24:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}