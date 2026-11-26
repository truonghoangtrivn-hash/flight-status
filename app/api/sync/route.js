import { NextResponse } from "next/server";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore/lite";
import https from "node:https";
import http from "node:http";

export const maxDuration = 30;
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

const sharedHttpsAgent = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: true,
  maxSockets: 12,
});

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

function getNextDayStr(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().split("T")[0];
}

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

function requestViags(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === "https:";
    const lib = isHttps ? https : http;

    const bodyBuffer = options.body ? Buffer.from(options.body, "utf-8") : null;
    const headers = { ...(options.headers || {}) };
    if (bodyBuffer) {
      headers["Content-Length"] = bodyBuffer.length;
    }

    const reqOptions = {
      method: options.method || "GET",
      headers,
      agent: isHttps ? sharedHttpsAgent : undefined,
      timeout: 15000,
    };

    const req = lib.request(url, reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        resolve({
          status: res.statusCode,
          headers: {
            get: (name) => {
              const val = res.headers[name.toLowerCase()];
              if (Array.isArray(val)) return val.join("; ");
              return val || "";
            },
          },
          text: async () => data,
        });
      });
    });

    req.on("error", (err) => reject(err));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Timeout kết nối ${url}`));
    });

    if (bodyBuffer) {
      req.write(bodyBuffer);
    }
    req.end();
  });
}

function getInputValue(html, name) {
  const match =
    html.match(new RegExp(`name="${name}"[^>]*value="([^"]*)"`, "i")) ||
    html.match(new RegExp(`id="${name}"[^>]*value="([^"]*)"`, "i"));
  return match ? match[1] : "";
}

export async function GET(request) {
  return await handleSync(request);
}

export async function POST(request) {
  return await handleSync(request);
}

async function handleSync(request) {
  const startTime = Date.now();
  try {
    const { searchParams } = new URL(request.url);

    // Quét trọn vẹn cả 24h của Ngày D (ví dụ 26-Nov) VÀ trọn vẹn 24h của Ngày D+1 (ví dụ 27-Nov)
    const opDate = searchParams.get("date") || getCurrentOperationalDate();
    const nextDate = getNextDayStr(opDate);

    const day1Ref = doc(dbLite, "daily_sgn", opDate);
    const day2Ref = doc(dbLite, "daily_sgn", nextDate);
    const viagsUrl = "https://viags.vn/en-US/flight-schedules";

    // 1. Đọc 2 bản ghi ngày D & D+1 và tải ViewState gốc từ VIAGS cùng lúc
    const [day1Snap, day2Snap, initialRes] = await Promise.all([
      getDoc(day1Ref),
      getDoc(day2Ref),
      requestViags(viagsUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      }),
    ]);

    const flightsMapDay1 = day1Snap.exists() ? day1Snap.data().flights || {} : {};
    const flightsMapDay2 = day2Snap.exists() ? day2Snap.data().flights || {} : {};

    const initHtml = await initialRes.text();
    const viewState = getInputValue(initHtml, "__VIEWSTATE");
    const viewState1 = getInputValue(initHtml, "__VIEWSTATE1");
    const viewStateGenerator = getInputValue(initHtml, "__VIEWSTATEGENERATOR") || "CA0B0334";
    const eventValidation = getInputValue(initHtml, "__EVENTVALIDATION");

    // Quét toàn bộ 24h ("0000-2359") cho cả ngày D (26-Nov) và ngày D+1 (27-Nov)
    const scanJobs = [
      { scanDate: opDate, timeRange: "0000-2359", station: "DOM", trip: "D" },
      { scanDate: opDate, timeRange: "0000-2359", station: "DOM", trip: "A" },
      { scanDate: opDate, timeRange: "0000-2359", station: "INT", trip: "D" },
      { scanDate: opDate, timeRange: "0000-2359", station: "INT", trip: "A" },
      { scanDate: nextDate, timeRange: "0000-2359", station: "DOM", trip: "D" },
      { scanDate: nextDate, timeRange: "0000-2359", station: "DOM", trip: "A" },
      { scanDate: nextDate, timeRange: "0000-2359", station: "INT", trip: "D" },
      { scanDate: nextDate, timeRange: "0000-2359", station: "INT", trip: "A" },
    ];

    const jobResults = await Promise.all(
      scanJobs.map(async (job) => {
        try {
          const formData = new URLSearchParams();
          formData.append(
            "ctl00$ScriptManager1",
            "ctl00$mainContent$ctl00$updSchedule|ctl00$mainContent$ctl00$ddlOriginal"
          );
          formData.append("__EVENTTARGET", "ctl00$mainContent$ctl00$ddlOriginal");
          formData.append("__EVENTARGUMENT", "");
          formData.append("__LASTFOCUS", "");
          formData.append("__VIEWSTATEFIELDCOUNT", viewState1 ? "2" : "1");
          formData.append("__VIEWSTATE", viewState);
          if (viewState1) formData.append("__VIEWSTATE1", viewState1);
          formData.append("__VIEWSTATEGENERATOR", viewStateGenerator);
          formData.append("__EVENTVALIDATION", eventValidation);
          formData.append("ctl00$mainContent$ctl00$ddlStation", job.station);
          formData.append("ctl00$mainContent$ctl00$ddlTrip", job.trip);
          formData.append("ctl00$mainContent$ctl00$ddlOriginal", "SGN");
          formData.append("ctl00$mainContent$ctl00$datetimepicker1", job.scanDate);
          formData.append("ctl00$mainContent$ctl00$ddlScheduled", job.timeRange);
          formData.append("__ASYNCPOST", "true");

          const response = await requestViags(viagsUrl, {
            method: "POST",
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
              "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
              "X-MicrosoftAjax": "Delta=true",
              Referer: viagsUrl,
            },
            body: formData.toString(),
          });

          const text = await response.text();
          const jsonMatch = text.match(/beginLoadData\((\[[\s\S]*?\]),\s*\d+\)/);
          if (jsonMatch && jsonMatch[1]) {
            return { job, parsed: JSON.parse(jsonMatch[1]) };
          }
          return { job, parsed: [] };
        } catch (err) {
          console.error("Bỏ qua lỗi nhóm:", job.scanDate, job.station, job.trip, err.message);
          return { job, parsed: [] };
        }
      })
    );

    let totalUpdatedDay1 = 0;
    let totalUpdatedDay2 = 0;

    for (const { job, parsed } of jobResults) {
      const activeMap = job.scanDate === opDate ? flightsMapDay1 : flightsMapDay2;

      for (let idx = 0; idx < parsed.length; idx++) {
        const item = parsed[idx];
        const st = (item.ST || "").trim();

        const rawFlt = (item.FltNo || "").trim();
        const cleanFlt = rawFlt.replace(/\s+/g, "").toUpperCase();
        const timeKey = st.replace(/[^0-9]/g, "");

        const flightKey = `${job.trip}_${cleanFlt}_${timeKey}`;
        const existing = activeMap[flightKey];

        const flightRecord = {
          id: `${job.scanDate}_${flightKey}`,
          sortOrder: idx,
          date: job.scanDate,
          stationType: job.station,
          tripType: job.trip,
          st,
          et: (item.ET || "").trim(),
          airportName: normalizeAirport((item.AirportName || "").trim()),
          airlines: (item.Airlines || "").trim(),
          flightNo: cleanFlt,
          displayFlightNo: rawFlt,
          updatedAt: new Date().toISOString(),
        };

        if (existing) {
          if (existing.hasTIAData) {
            flightRecord.beltGate = existing.beltGate || (item.BeltGate || "").trim();
            flightRecord.remark = existing.remark || (item.Remark || "").trim();
            flightRecord.terminal = existing.terminal || "";
            flightRecord.checkinRow = job.trip === "D" ? existing.checkinRow || "" : "";
            flightRecord.hasTIAData = true;
          } else {
            flightRecord.beltGate = (item.BeltGate || "").trim();
            flightRecord.remark = (item.Remark || "").trim();
          }
          if (existing.fr24ETA) {
            flightRecord.fr24ETA = existing.fr24ETA;
          }
        } else {
          flightRecord.beltGate = (item.BeltGate || "").trim();
          flightRecord.remark = (item.Remark || "").trim();
        }

        activeMap[flightKey] = flightRecord;
        if (job.scanDate === opDate) totalUpdatedDay1++;
        else totalUpdatedDay2++;
      }
    }

    // Lưu trọn vẹn cả 2 ngày D (26-Nov) và D+1 (27-Nov) vào Firebase
    await Promise.all([
      setDoc(
        day1Ref,
        {
          date: opDate,
          lastUpdated: new Date().toISOString(),
          totalFlights: Object.keys(flightsMapDay1).length,
          flights: flightsMapDay1,
        },
        { merge: true }
      ),
      setDoc(
        day2Ref,
        {
          date: nextDate,
          lastUpdated: new Date().toISOString(),
          totalFlights: Object.keys(flightsMapDay2).length,
          flights: flightsMapDay2,
        },
        { merge: true }
      ),
    ]);

    return NextResponse.json({
      success: true,
      message: `Đã gộp lưu đầy đủ 24h cho cả 2 ngày (${totalUpdatedDay1} chuyến ngày ${opDate} + ${totalUpdatedDay2} chuyến ngày ${nextDate})!`,
      opDate,
      nextDate,
      duration: `${(Date.now() - startTime) / 1000}s`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Lỗi đồng bộ VIAGS:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}