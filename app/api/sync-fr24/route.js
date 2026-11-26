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

export async function GET(request) {
  return await handleSyncFR24(request);
}

export async function POST(request) {
  return await handleSyncFR24(request);
}

async function handleSyncFR24(request) {
  const startTime = Date.now();
  try {
    const todayVn = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
    }).format(new Date());

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
      const flightArrivalDate = getVnDateFromTimestamp(scheduledSec || etaSec);
      const etaFormatted = formatVnTime(etaSec);

      if (flightNo && flightArrivalDate && etaFormatted) {
        const exactKey = `${flightArrivalDate}_${flightNo}`;
        fr24ExactMap.set(exactKey, {
          eta: etaFormatted,
          status: flt.status?.text || "",
          date: flightArrivalDate,
        });
      }
    });

    // 2. CHỈ TỐN 1 LƯỢT ĐỌC DUY NHẤT: Đọc bản ghi gộp của ngày hôm nay
    const dayRef = doc(dbLite, "daily_sgn", todayVn);
    const daySnap = await getDoc(dayRef);

    let updatedCount = 0;

    if (daySnap.exists()) {
      const dayData = daySnap.data();
      const flightsMap = dayData.flights || {};

      for (const [key, flt] of Object.entries(flightsMap)) {
        if (flt.tripType === "A") {
          const cleanFlt = (flt.flightNo || "").replace(/\s+/g, "").toUpperCase();
          const exactKey = `${todayVn}_${cleanFlt}`;

          if (fr24ExactMap.has(exactKey)) {
            const info = fr24ExactMap.get(exactKey);
            flightsMap[key] = {
              ...flt,
              fr24ETA: info.eta,
              fr24Status: info.status,
            };
            updatedCount++;
          }
        }
      }

      // 3. CHỈ TỐN 1 LƯỢT GHI DUY NHẤT: Cập nhật lại bản ghi của ngày hôm nay
      await setDoc(
        dayRef,
        {
          lastFR24Sync: new Date().toISOString(),
          flights: flightsMap,
        },
        { merge: true }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Đã cập nhật FR24 cho ${updatedCount} chuyến bay vào flight-status-2 chỉ với 1 lượt Ghi!`,
      totalFR24: fr24ExactMap.size,
      updatedInFirestore: updatedCount,
      duration: `${(Date.now() - startTime) / 1000}s`,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Lỗi sync FR24:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}