import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, writeBatch, serverTimestamp } from "firebase/firestore";

// Cho phép xử lý tối đa 60 giây trên Vercel Serverless
export const maxDuration = 60;
export const dynamic = "force-dynamic";

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
  try {
    const { searchParams } = new URL(request.url);

    // Mặc định lấy ngày hôm nay theo múi giờ Việt Nam (UTC+7)
    const todayVn = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
    }).format(new Date());

    const targetDate = searchParams.get("date") || todayVn;

    // 1. Tải trang ban đầu để lấy Cookie và mã xác thực ASP.NET (__VIEWSTATE, __EVENTVALIDATION)
    const initialRes = await fetch("https://viags.vn/en-US/flight-schedules", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      },
      cache: "no-store",
    });

    const initHtml = await initialRes.text();
    const cookie = initialRes.headers.get("set-cookie") || "";

    const viewState = getInputValue(initHtml, "__VIEWSTATE");
    const viewState1 = getInputValue(initHtml, "__VIEWSTATE1");
    const viewStateGenerator = getInputValue(initHtml, "__VIEWSTATEGENERATOR") || "CA0B0334";
    const eventValidation = getInputValue(initHtml, "__EVENTVALIDATION");

    // 2. Định nghĩa 4 danh mục cần quét tại Hồ Chí Minh (SGN)
    const scanTasks = [
      { station: "DOM", trip: "D", stationName: "Domestic", tripName: "Departures" },
      { station: "DOM", trip: "A", stationName: "Domestic", tripName: "Arrivals" },
      { station: "INT", trip: "D", stationName: "International", tripName: "Departures" },
      { station: "INT", trip: "A", stationName: "International", tripName: "Arrivals" },
    ];

    let allFlights = [];

    // 3. Thực hiện gửi yêu cầu lấy dữ liệu cho từng danh mục
    for (const task of scanTasks) {
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
      formData.append("ctl00$mainContent$ctl00$ddlOriginal", "SGN"); // Cố định TP. Hồ Chí Minh
      formData.append("ctl00$mainContent$ctl00$datetimepicker1", targetDate);
      formData.append("ctl00$mainContent$ctl00$ddlScheduled", "0000-2359"); // Cả ngày
      formData.append("__ASYNCPOST", "true");

      const response = await fetch("https://viags.vn/en-US/flight-schedules", {
        method: "POST",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-MicrosoftAjax": "Delta=true",
          Cookie: cookie,
          Referer: "https://viags.vn/en-US/flight-schedules",
        },
        body: formData.toString(),
        cache: "no-store",
      });

      const text = await response.text();

      // Bóc tách mảng JSON từ beginLoadData([...])
      const jsonMatch = text.match(/beginLoadData\((\[[\s\S]*?\]),\s*\d+\)/);
      if (jsonMatch && jsonMatch[1]) {
        try {
          const parsed = JSON.parse(jsonMatch[1]);
          const mapped = parsed.map((item, idx) => ({
            id: `${targetDate}_${task.station}_${task.trip}_${(item.FltNo || "").trim()}_${(item.ST || "").trim()}`.replace(
              /[^a-zA-Z0-9_-]/g,
              "_"
            ),
            sortOrder: idx,
            date: targetDate,
            stationType: task.station, // DOM hoặc INT
            tripType: task.trip,       // D (Đi) hoặc A (Đến)
            st: (item.ST || "").trim(),
            et: (item.ET || "").trim(),
            airportName: (item.AirportName || "").trim(),
            airlines: (item.Airlines || "").trim(),
            flightNo: (item.FltNo || "").trim(),
            beltGate: (item.BeltGate || "").trim(),
            remark: (item.Remark || "").trim(),
            areaName: "HO CHI MINH CITY",
            updatedAt: new Date().toISOString(),
          }));
          allFlights.push(...mapped);
        } catch (err) {
          console.error("Lỗi parse JSON danh mục:", task, err);
        }
      }
    }

    // 4. Lưu dữ liệu hàng loạt vào Firestore theo từng đợt (Batch tối đa 400 mục)
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

    // Cập nhật trạng thái tổng quát
    const metaBatch = writeBatch(db);
    const metaRef = doc(db, "meta", "sync_status");
    metaBatch.set(
      metaRef,
      {
        lastUpdated: new Date().toISOString(),
        totalFlights: totalUpdated,
        date: targetDate,
        status: "success",
      },
      { merge: true }
    );
    await metaBatch.commit();

    return NextResponse.json({
      success: true,
      message: "Đồng bộ thành công dữ liệu chuyến bay Hồ Chí Minh!",
      date: targetDate,
      totalFlights: totalUpdated,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Lỗi trong quá trình đồng bộ:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}