import { NextResponse } from "next/server";
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  writeBatch,
  doc,
} from "firebase/firestore/lite";

export const maxDuration = 20;
export const dynamic = "force-dynamic";

const firebaseConfig = {
  apiKey: "AIzaSyD5xJ95pYWckUcnbGzrD6mPUcYEFrwuUj8",
  authDomain: "flight-status-b0895.firebaseapp.com",
  projectId: "flight-status-b0895",
  storageBucket: "flight-status-b0895.firebasestorage.app",
  messagingSenderId: "274057468561",
  appId: "1:274057468561:web:f8edcb85d692caebb9bd30",
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

    const nextDateVn = getNextDayStr(todayVn);

    // 1. Gọi API Flightradar24 với khóa bảo vệ timeout 8 giây
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

    // 2. Truy vấn và lưu bằng Firestore Lite (Stateless HTTP - Không bao giờ bị treo)
    const arrivalSnap = await getDocs(
      query(
        collection(dbLite, "flights_sgn"),
        where("tripType", "==", "A"),
        where("date", "in", [todayVn, nextDateVn])
      )
    );

    let updatedCount = 0;
    let clearedCount = 0;
    const batch = writeBatch(dbLite);

    arrivalSnap.forEach((docSnap) => {
      const flightData = docSnap.data();
      const cleanFlt = (flightData.flightNo || "").replace(/\s+/g, "").toUpperCase();
      const docDate = flightData.date;

      const exactKey = `${docDate}_${cleanFlt}`;

      if (fr24ExactMap.has(exactKey)) {
        const info = fr24ExactMap.get(exactKey);
        batch.set(
          docSnap.ref,
          {
            fr24ETA: info.eta,
            fr24Status: info.status,
            fr24UpdatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
        updatedCount++;
      } else if (flightData.fr24ETA) {
        batch.set(
          docSnap.ref,
          {
            fr24ETA: null,
            fr24Status: null,
          },
          { merge: true }
        );
        clearedCount++;
      }
    });

    const metaRef = doc(dbLite, "meta", "sync_status");
    batch.set(
      metaRef,
      {
        lastFR24Sync: new Date().toISOString(),
        fr24LiveCount: fr24ExactMap.size,
      },
      { merge: true }
    );

    await batch.commit();

    return NextResponse.json({
      success: true,
      message: `Cập nhật ${updatedCount} chuyến bay trong ${(Date.now() - startTime) / 1000}s!`,
      totalFR24: fr24ExactMap.size,
      updatedInFirestore: updatedCount,
      clearedWrongDates: clearedCount,
      duration: `${(Date.now() - startTime) / 1000}s`,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Lỗi sync FR24:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}