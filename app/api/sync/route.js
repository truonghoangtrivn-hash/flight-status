import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, doc, writeBatch } from "firebase/firestore";
import https from "node:https";
import http from "node:http";

export const maxDuration = 15;
export const dynamic = "force-dynamic";

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
      agent: isHttps
        ? new https.Agent({ rejectUnauthorized: false, keepAlive: false })
        : undefined,
      timeout: 8000,
    };

    const req = lib.request(url, reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        resolve({
          status: res.statusCode,
          text: async () => data,
        });
      });
    });

    req.on("error", (err) => reject(err));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Timeout VIAGS"));
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

    // 1. Tải trước các chuyến bay hiện có từ Firestore
    const existingSnap = await getDocs(
      query(collection(db, "flights_sgn"), where("date", "==", targetDate))
    );
    const existingMap = new Map();
    existingSnap.forEach((d) => existingMap.set(d.id, d.data()));

    // 2. Lấy ViewState ban đầu từ VIAGS
    const initialRes = await requestViags("https://www.viags.vn/en-US/flight-schedules", {
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

    let allFlights = [];

    // Quét 4 nhóm chính của ngày hiện tại (mất khoảng 4 giây)
    for (const task of scanTasks) {
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
            Referer: "https://www.viags.vn/en-US/flight-schedules",
          },
          body: formData.toString(),
        });

        const text = await response.text();
        const jsonMatch = text.match(/beginLoadData\((\[[\s\S]*?\]),\s*\d+\)/);
        if (jsonMatch && jsonMatch[1]) {
          const parsed = JSON.parse(jsonMatch[1]);
          for (let idx = 0; idx < parsed.length; idx++) {
            const item = parsed[idx];
            const rawFlt = (item.FltNo || "").trim();
            const cleanFlt = rawFlt.replace(/\s+/g, "").toUpperCase();
            const timeKey = (item.ST || "").replace(/[^0-9]/g, "");

            const docId = `${targetDate}_${task.trip}_${cleanFlt}_${timeKey}`;
            const existing = existingMap.get(docId);

            const flightRecord = {
              id: docId,
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
              areaName: "HO CHI MINH CITY",
              source: existing && existing.hasTIAData ? "HYBRID (VIAGS + TIA)" : "VIAGS",
              updatedAt: new Date().toISOString(),
            };

            if (existing && existing.hasTIAData) {
              flightRecord.beltGate = existing.beltGate || (item.BeltGate || "").trim();
              flightRecord.remark = existing.remark || (item.Remark || "").trim();
              flightRecord.terminal = existing.terminal || "";
              flightRecord.checkinRow = existing.checkinRow || "";
              flightRecord.hasTIAData = true;
              if (existing.fr24ETA) flightRecord.fr24ETA = existing.fr24ETA;
            } else {
              flightRecord.beltGate = (item.BeltGate || "").trim();
              flightRecord.remark = (item.Remark || "").trim();
            }

            allFlights.push(flightRecord);
          }
        }
      } catch (err) {
        console.error("Lỗi quét nhóm:", task, err.message);
      }
    }

    // Lưu Firestore
    let totalUpdated = 0;
    const chunkSize = 400;
    for (let i = 0; i < allFlights.length; i += chunkSize) {
      const chunk = allFlights.slice(i, i + chunkSize);
      const batch = writeBatch(db);

      for (const flight of chunk) {
        const flightRef = doc(db, "flights_sgn", flight.id);
        batch.set(flightRef, flight, { merge: true });
      }

      await batch.commit();
      totalUpdated += chunk.length;
    }

    const metaBatch = writeBatch(db);
    const metaRef = doc(db, "meta", "sync_status");
    metaBatch.set(
      metaRef,
      {
        lastUpdated: new Date().toISOString(),
        totalFlightsVIAGS: totalUpdated,
        status: "success",
      },
      { merge: true }
    );
    await metaBatch.commit();

    return NextResponse.json({
      success: true,
      message: `Đồng bộ VIAGS thành công (${totalUpdated} chuyến bay)!`,
      date: targetDate,
      duration: `${(Date.now() - startTime) / 1000}s`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Lỗi đồng bộ VIAGS:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}