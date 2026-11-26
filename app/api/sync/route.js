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

// Hàm gửi yêu cầu mạng an toàn - TẮT KEEPALIVE ĐỂ KHÔNG BỊ LỖI SOCKET DISCONNECTED
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
      // Tắt keepAlive để mỗi yêu cầu mở socket mới tinh, chống rớt mạng TLS
      agent: isHttps
        ? new https.Agent({ rejectUnauthorized: false, keepAlive: false })
        : undefined,
      timeout: 12000,
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
      reject(new Error("Timeout kết nối VIAGS"));
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

    const todayVn = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
    }).format(new Date());

    const nextDayVn = getNextDayStr(todayVn);

    // Mặc định tự động quét cả Hôm nay (26-Nov) và Ngày mai (27-Nov)
    const requestedDate = searchParams.get("date");
    const datesToSync = requestedDate ? [requestedDate] : [todayVn, nextDayVn];

    const viagsUrl = "https://viags.vn/en-US/flight-schedules";

    // 1. Tải ViewState gốc từ VIAGS với socket mới
    const initialRes = await requestViags(viagsUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    const initHtml = await initialRes.text();
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

    let grandTotal = 0;

    // 2. Nạp dữ liệu lần lượt cho từng ngày (mỗi nhóm gửi qua kết nối sạch)
    for (const targetDate of datesToSync) {
      const dayRef = doc(dbLite, "daily_sgn", targetDate);
      const daySnap = await getDoc(dayRef);
      const flightsMap = daySnap.exists() ? daySnap.data().flights || {} : {};

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
              return { task, parsed: JSON.parse(jsonMatch[1]) };
            }
            return { task, parsed: [] };
          } catch (err) {
            console.error("Bỏ qua lỗi nhóm:", targetDate, task.station, task.trip, err.message);
            return { task, parsed: [] };
          }
        })
      );

      let dayUpdated = 0;

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
            airportName: normalizeAirport((item.AirportName || "").trim()),
            airlines: (item.Airlines || "").trim(),
            flightNo: cleanFlt,
            displayFlightNo: rawFlt,
            updatedAt: new Date().toISOString(),
          };

          if (existing && existing.hasTIAData) {
            flightRecord.et = existing.et || (item.ET || "").trim();
            flightRecord.beltGate = existing.beltGate || (item.BeltGate || "").trim();
            flightRecord.remark = existing.remark || (item.Remark || "").trim();
            flightRecord.terminal = existing.terminal || "";
            flightRecord.checkinRow = task.trip === "D" ? existing.checkinRow || "" : "";
            flightRecord.hasTIAData = true;
            if (existing.fr24ETA) flightRecord.fr24ETA = existing.fr24ETA;
          } else {
            flightRecord.et = (item.ET || "").trim();
            flightRecord.beltGate = (item.BeltGate || "").trim();
            flightRecord.remark = (item.Remark || "").trim();
          }

          flightsMap[flightKey] = flightRecord;
          dayUpdated++;
        }
      }

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

      grandTotal += dayUpdated;
    }

    return NextResponse.json({
      success: true,
      message: `Đã nạp thành công ${grandTotal} chuyến bay cho các ngày: [${datesToSync.join(", ")}] chỉ mất ${(Date.now() - startTime) / 1000}s!`,
      dates: datesToSync,
      totalFlights: grandTotal,
      duration: `${(Date.now() - startTime) / 1000}s`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Lỗi đồng bộ VIAGS:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}