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

// Dùng chung 1 Agent giữ kết nối (keepAlive: true) để tái sử dụng đường truyền TLS, tiết kiệm 50% thời gian kết nối
const sharedHttpsAgent = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: true,
  maxSockets: 10,
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

function requestViags(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === "https:";
    const lib = isHttps ? https : http;

    const reqOptions = {
      method: options.method || "GET",
      headers: options.headers || {},
      agent: isHttps ? sharedHttpsAgent : undefined,
      timeout: 15000, // Nới lên 15 giây vì trang chủ VIAGS phản hồi lần đầu mất khoảng 6-8 giây
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
      reject(new Error("Timeout VIAGS (15s)"));
    });

    if (options.body) req.write(options.body);
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

    const todayVn = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
    }).format(new Date());

    const targetDate = searchParams.get("date") || todayVn;
    const dayRef = doc(dbLite, "daily_sgn", targetDate);

    // 1. CHẠY SONG SONG: Vừa đọc Firebase (1 lượt Đọc) vừa tải trang chủ VIAGS cùng lúc để tiết kiệm thời gian!
    const [daySnap, initialRes] = await Promise.all([
      getDoc(dayRef),
      requestViags("https://www.viags.vn/en-US/flight-schedules", {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      }),
    ]);

    const flightsMap = daySnap.exists() ? daySnap.data().flights || {} : {};
    const initHtml = await initialRes.text();
    const cookie = initialRes.headers.get("set-cookie") || "";

    const viewState = getInputValue(initHtml, "__VIEWSTATE");
    const viewState1 = getInputValue(initHtml, "__VIEWSTATE1");
    const viewStateGenerator = getInputValue(initHtml, "__VIEWSTATEGENERATOR") || "CA0B0334";
    const eventValidation = getInputValue(initHtml, "__EVENTVALIDATION");

    const scanTasks = [
      { station: "DOM", trip: "D" },
      { station: "DOM", trip: "A" },
      { station: "INT", trip: "D" },
      { station: "INT", trip: "A" },
    ];

    // 2. BẮN ĐỒNG THỜI CẢ 4 NHÓM CHUYẾN BAY CÙNG LÚC (Promise.all) - Chỉ mất ~2.5 giây cho cả 4 nhóm!
    const taskResults = await Promise.all(
      scanTasks.map(async (task) => {
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
          formData.append("ctl00$mainContent$ctl00$ddlStation", task.station);
          formData.append("ctl00$mainContent$ctl00$ddlTrip", task.trip);
          formData.append("ctl00$mainContent$ctl00$ddlOriginal", "SGN");
          formData.append("ctl00$mainContent$ctl00$datetimepicker1", targetDate);
          formData.append("ctl00$mainContent$ctl00$ddlScheduled", "0000-2359");
          formData.append("__ASYNCPOST", "true");

          const response = await requestViags("https://www.viags.vn/en-US/flight-schedules", {
            method: "POST",
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
              "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
              "X-MicrosoftAjax": "Delta=true",
              Cookie: cookie,
              Referer: "https://www.viags.vn/en-US/flight-schedules",
            },
            body: formData.toString(),
          });

          const text = await response.text();
          const jsonMatch = text.match(/beginLoadData\((\[[\s\S]*?\]),\s*\d+\)/);
          if (jsonMatch && jsonMatch[1]) {
            return { task, parsed: JSON.parse(jsonMatch[1]) };
          }
          return { task, parsed: [] };
        } catch (err) {
          console.error("Bỏ qua lỗi nhóm:", task.station, task.trip, err.message);
          return { task, parsed: [] };
        }
      })
    );

    let totalUpdated = 0;

    for (const { task, parsed } of taskResults) {
      for (let idx = 0; idx < parsed.length; idx++) {
        const item = parsed[idx];
        const rawFlt = (item.FltNo || "").trim();
        const cleanFlt = rawFlt.replace(/\s+/g, "").toUpperCase();
        const timeKey = (item.ST || "").replace(/[^0-9]/g, "");

        const flightKey = `${task.trip}_${cleanFlt}_${timeKey}`;
        const existing = flightsMap[flightKey];

        const flightRecord = {
          id: `${targetDate}_${flightKey}`,
          sortOrder: idx,
          date: targetDate,
          stationType: task.station,
          tripType: task.trip,
          st: (item.ST || "").trim(),
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
            flightRecord.checkinRow = existing.checkinRow || "";
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

        flightsMap[flightKey] = flightRecord;
        totalUpdated++;
      }
    }

    // 3. CHỈ TỐN 1 LƯỢT GHI DUY NHẤT: Lưu toàn bộ vào flight-status-2
    await setDoc(
      dayRef,
      {
        date: targetDate,
        lastUpdated: new Date().toISOString(),
        totalFlights: Object.keys(flightsMap).length,
        flights: flightsMap,
      },
      { merge: true }
    );

    return NextResponse.json({
      success: true,
      message: `Đã gộp lưu ${totalUpdated} chuyến bay vào flight-status-2 chỉ với 1 lượt Ghi!`,
      date: targetDate,
      duration: `${(Date.now() - startTime) / 1000}s`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Lỗi đồng bộ VIAGS:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}