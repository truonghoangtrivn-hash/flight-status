import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, writeBatch, doc } from "firebase/firestore";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

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

export async function GET(request) {
  return await handleSyncFR24(request);
}

export async function POST(request) {
  return await handleSyncFR24(request);
}

async function handleSyncFR24(request) {
  try {
    const todayVn = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
    }).format(new Date());

    const nextDateVn = getNextDayStr(todayVn);

    // 1. Gọi trực tiếp cổng dữ liệu JSON của Flightradar24 cho các chuyến đến SGN
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
      }
    );

    if (!frRes.ok) {
      throw new Error(`Flightradar24 trả về mã lỗi HTTP ${frRes.status}`);
    }

    const json = await frRes.json();
    const arrivals =
      json?.result?.response?.airport?.pluginData?.schedule?.arrivals?.data || [];

    const fr24Map = new Map();

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
        fr24Map.set(flightNo, {
          eta: etaFormatted,
          status: flt.status?.text || "",
        });
      }
    });

    console.log(`[FR24 Fast-Sync] Đã lấy dữ liệu radar của ${fr24Map.size} chuyến bay đến`);

    // 2. Tìm các chuyến bay đến trong ca trực từ Firestore để cập nhật
    const arrivalSnap = await getDocs(
      query(
        collection(db, "flights_sgn"),
        where("tripType", "==", "A"),
        where("date", "in", [todayVn, nextDateVn])
      )
    );

    let updatedCount = 0;
    const batch = writeBatch(db);

    arrivalSnap.forEach((docSnap) => {
      const flightData = docSnap.data();
      const cleanFlt = (flightData.flightNo || "").replace(/\s+/g, "").toUpperCase();

      if (fr24Map.has(cleanFlt)) {
        const info = fr24Map.get(cleanFlt);
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
      }
    });

    // Cập nhật trạng thái
    const metaRef = doc(db, "meta", "sync_status");
    batch.set(
      metaRef,
      {
        lastFR24Sync: new Date().toISOString(),
        fr24LiveCount: fr24Map.size,
      },
      { merge: true }
    );

    await batch.commit();

    return NextResponse.json({
      success: true,
      message: `Đã cập nhật giờ radar Flightradar24 cho ${updatedCount} chuyến bay đến!`,
      totalFR24: fr24Map.size,
      updatedInFirestore: updatedCount,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Lỗi sync FR24:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message,
      },
      { status: 500 }
    );
  }
}