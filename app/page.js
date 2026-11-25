"use client";

import { useState, useEffect, useMemo } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, doc } from "firebase/firestore";
import { RefreshCw } from "lucide-react";

// Bảng từ điển Hãng bay
const AIRLINE_DICT = {
  VN: "VIETNAM AIRLINES",
  "0V": "VASCO",
  OV: "VASCO",
  BL: "PACIFIC AIRLINES",
  VJ: "VIETJET AIR",
  QH: "BAMBOO AIRWAYS",
  VU: "VIETRAVEL AIRLINES",
  "9G": "9 AIR",
  K6: "CAMBODIA ANGKOR AIR",
  GA: "GARUDA INDONESIA",
  TK: "TURKISH AIRLINES",
  CI: "CHINA AIRLINES",
  BR: "EVA AIR",
  SQ: "SINGAPORE AIRLINES",
  TG: "THAI AIRWAYS",
  CX: "CATHAY PACIFIC",
  EK: "EMIRATES",
  QR: "QATAR AIRWAYS",
  KE: "KOREAN AIR",
  OZ: "ASIANA AIRLINES",
  JL: "JAPAN AIRLINES",
  NH: "ALL NIPPON AIRWAYS",
  CZ: "CHINA SOUTHERN AIRLINES",
  MU: "CHINA EASTERN AIRLINES",
  CA: "AIR CHINA",
  TR: "SCOOT",
  AK: "AIRASIA",
  FD: "THAI AIRASIA",
};

// BẢNG TỪ ĐIỂN MÃ SÂN BAY IATA
const IATA_MAP = {
  "HA NOI": "HAN", HANOI: "HAN", "NOI BAI": "HAN",
  HUE: "HUI", "PHU BAI": "HUI",
  "THANH HOA": "THD", "THO XUAN": "THD",
  VINH: "VII",
  "DA NANG": "DAD", DANANG: "DAD",
  "HAI PHONG": "HPH", "CAT BI": "HPH",
  "PHU QUOC": "PQC", PHUQUOC: "PQC",
  "CAM RANH": "CXR", "NHA TRANG": "CXR",
  "CON DAO": "VCS", CONDAO: "VCS",
  PLEIKU: "PXU",
  "QUY NHON": "UIH", "PHU CAT": "UIH",
  "BUON ME THUOT": "BMV", "BUON MA THUOT": "BMV",
  "DA LAT": "DLI", DALAT: "DLI", "LIEN KHUONG": "DLI",
  "TUY HOA": "TBB", "DONG TAC": "TBB",
  "CHU LAI": "VCL", "DONG HOI": "VDH",
  "CA MAU": "CAH", "CAN THO": "VCA",
  "RACH GIA": "VKG", "DIEN BIEN": "DIN",
  "VAN DON": "VDO", "QUANG NINH": "VDO",
  SHENZHEN: "SZX", SHENZEN: "SZX",
  "BEIJING CHINA": "PEK", "BEIJING-CHINA": "PEK", BEIJING: "PEK", "BEIJING CAPITAL": "PEK",
  "BEIJING DAXING": "PKX", DAXING: "PKX",
  SHANGHAI: "PVG", PUDONG: "PVG", HONGQIAO: "SHA",
  GUANGZHOU: "CAN", KUNMING: "KMG", NANJING: "NKG", CHENGDU: "TFU", CHONGQING: "CKG",
  HANGZHOU: "HGH", WUHAN: "WUH", XIAMEN: "XMN", QINGDAO: "TAO", JINAN: "TNA",
  SANYA: "SYX", HAIKOU: "HAK", NANNING: "NNG", ZHENGZHOU: "CGO", CHANGSHA: "CSX",
  HONGKONG: "HKG", "HONG KONG": "HKG", MACAU: "MFM", MACAO: "MFM",
  TAIPEI: "TPE", TAOYUAN: "TPE", KAOHSIUNG: "KHH", TAICHUNG: "RMQ",
  "SIEM RIEP": "SAI", "SIEM REAP": "SAI", SIEMREAP: "SAI", SIEMRIEP: "SAI",
  "PHNOM PENH": "PNH", PHNOMPENH: "PNH", SIHANOUKVILLE: "KOS",
  BANGKOK: "BKK", SUVARNABHUMI: "BKK", "DON MUEANG": "DMK", "DON MUANG": "DMK",
  PHUKET: "HKT", "CHIANG MAI": "CNX",
  SINGAPORE: "SIN", CHANGI: "SIN", "KUALA LUMPUR": "KUL", KUALALUMPUR: "KUL",
  PENANG: "PEN", KUCHING: "KCH",
  JAKARTA: "CGK", SEMARANG: "SRG", BALI: "DPS", DENPASAR: "DPS", SURABAYA: "SUB",
  MANILA: "MNL", CEBU: "CEB", CLARK: "CRK",
  VIENTIANE: "VTE", "LUANG PRABANG": "LPQ", YANGON: "RGN", BRUNEI: "BWN",
  TOKYO: "HND", HANEDA: "HND", "HANEDA-TOKYO, JAPAN": "HND", "HANEDA-TOKYO": "HND",
  NARITA: "NRT", OSAKA: "KIX", KANSAI: "KIX", NAGOYA: "NGO", FUKUOKA: "FUK",
  SEOUL: "ICN", INCHEON: "ICN", ANAA: "ICN", GIMPO: "GMP", BUSAN: "PUS", DAEGU: "TAE", JEJU: "CJU",
  COPENHAGEN: "CPH", KOBENHAVN: "CPH", MUENCHEN: "MUC", MUNICH: "MUC",
  PARIS: "CDG", FRANKFURT: "FRA", LONDON: "LHR", AMSTERDAM: "AMS",
  ASHKHABAD: "ASB", ASHGABAT: "ASB", MOSCOW: "SVO", BARNAUL: "BAX", NOVOSIBIRSK: "OVB",
  ALMATY: "ALA", TASHKENT: "TAS", ISTANBUL: "IST", DOHA: "DOH", DUBAI: "DXB",
  BOMBAY: "BOM", MUMBAI: "BOM", "MUMBAI, INDIA": "BOM", DELHI: "DEL", "NEW DELHI": "DEL",
  BENGALURU: "BLR", CHENNAI: "MAA", KOLKATA: "CCU", COLOMBO: "CMB",
  SYDNEY: "SYD", MELBOURNE: "MEL", BRISBANE: "BNE", PERTH: "PER", AUCKLAND: "AKL",
  HONOLULU: "HNL", "SAN FRANCISCO": "SFO", SANFRANCISCO: "SFO", "LOS ANGELES": "LAX",
};

const SORTED_IATA_KEYS = Object.keys(IATA_MAP).sort((a, b) => b.length - a.length);

function toIATA(name = "") {
  if (!name) return "";
  let clean = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[-_.,]/g, " ")
    .replace(/\s+/g, " ")
    .toUpperCase()
    .trim();

  if (clean.length === 3 && /^[A-Z]{3}$/.test(clean)) return clean;
  if (IATA_MAP[clean]) return IATA_MAP[clean];

  for (const key of SORTED_IATA_KEYS) {
    const cleanKey = key.replace(/[-_.,]/g, " ");
    if (clean === cleanKey || clean.includes(cleanKey) || cleanKey.includes(clean)) {
      return IATA_MAP[key];
    }
  }
  return clean;
}

function resolveAirlineName(flightNo = "", existingAirline = "") {
  if (existingAirline && existingAirline.trim() !== "") return existingAirline.trim();
  const clean = flightNo.replace(/\s+/g, "").toUpperCase();
  const prefix2 = clean.slice(0, 2);
  if (AIRLINE_DICT[prefix2]) return AIRLINE_DICT[prefix2];
  return "-";
}

function cleanAirportName(name = "") {
  if (!name) return "";
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toUpperCase()
    .trim();
}

// Hàm tính ngày hôm sau (YYYY-MM-DD)
function getNextDayStr(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().split("T")[0];
}

// Hàm lấy ngày khai thác hiện tại (nếu trước 03:00 sáng thì tính là ca hôm qua)
function getInitialOperationalDate() {
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

export default function FlightDashboard() {
  const [flights, setFlights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [lastSyncTime, setLastSyncTime] = useState(null);

  // Mặc định ngày khai thác hiện tại
  const [filterDate, setFilterDate] = useState(() => getInitialOperationalDate());
  const nextDateStr = useMemo(() => getNextDayStr(filterDate), [filterDate]);

  const [filterTrip, setFilterTrip] = useState("D");
  const [filterStation, setFilterStation] = useState("DOM");
  const [filterAirline, setFilterAirline] = useState("ALL");
  const [filterTime, setFilterTime] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const unsubMeta = onSnapshot(doc(db, "meta", "sync_status"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.lastUpdated) {
          const dateObj = new Date(data.lastUpdated);
          setLastSyncTime(
            dateObj.toLocaleTimeString("vi-VN", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })
          );
        }
      }
    });
    return () => unsubMeta();
  }, []);

  // Lắng nghe dữ liệu cả 2 ngày: Ngày D và Ngày D+1
  useEffect(() => {
    setLoading(true);
    const q = query(
      collection(db, "flights_sgn"),
      where("date", "in", [filterDate, nextDateStr])
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const rawList = [];
        snapshot.forEach((doc) => {
          rawList.push(doc.data());
        });

        // 1. ÁP DỤNG NGUYÊN TẮC NGÀY KHAI THÁC (03:00 NGÀY D -> TRƯỚC 03:00 NGÀY D+1)
        const opDayFlights = rawList.filter((f) => {
          const st = f.st || "";
          if (f.date === filterDate) {
            // Ngày được chọn: Lấy các chuyến từ 03:00 trở đi
            return st >= "03:00";
          }
          if (f.date === nextDateStr) {
            // Ngày hôm sau: Chỉ lấy các chuyến trước 03:00 rạng sáng
            return st < "03:00";
          }
          return false;
        });

        // 2. KHỬ TRÙNG LẶP & XỬ LÝ XUNG ĐỘT
        const flightMap = new Map();

        opDayFlights.forEach((item) => {
          const cleanFlt = (item.flightNo || "").replace(/\s+/g, "").toUpperCase();
          const cleanSt = (item.st || "").replace(/[^0-9]/g, "");
          const cleanApt = cleanAirportName(item.airportName);

          const uniqueKey = `${item.tripType || "D"}_${cleanFlt}_${cleanSt}_${item.date}`;

          if (!flightMap.has(uniqueKey)) {
            flightMap.set(uniqueKey, {
              ...item,
              flightNo: cleanFlt,
              airportName: cleanApt,
              isNextDay: item.date === nextDateStr,
            });
          } else {
            const prev = flightMap.get(uniqueKey);
            const hasMoreInfo =
              (item.beltGate && !prev.beltGate) ||
              (item.terminal && !prev.terminal) ||
              (item.checkinRow && !prev.checkinRow) ||
              (item.fr24ETA && !prev.fr24ETA) ||
              (item.hasTIAData && !prev.hasTIAData);

            flightMap.set(uniqueKey, {
              ...prev,
              ...(hasMoreInfo ? item : {}),
              flightNo: cleanFlt,
              airportName: cleanApt || prev.airportName,
              beltGate: item.beltGate || prev.beltGate,
              terminal: item.terminal || prev.terminal,
              checkinRow: item.checkinRow || prev.checkinRow,
              fr24ETA: item.fr24ETA || prev.fr24ETA,
              remark: item.hasTIAData ? item.remark : prev.remark || item.remark,
              airlines: prev.airlines || item.airlines,
              isNextDay: item.date === nextDateStr,
            });
          }
        });

        // Khử nhiễu liên danh VASCO / VNA
        const mergedList = Array.from(flightMap.values());
        const vascoDeparted = new Set();

        mergedList.forEach((f) => {
          const r = (f.remark || "").toLowerCase();
          if (f.flightNo.startsWith("0V") && (r.includes("departed") || f.beltGate)) {
            vascoDeparted.add(`${f.st}_${f.airportName}_${f.date}`);
          }
        });

        const finalList = mergedList.filter((f) => {
          const r = (f.remark || "").toLowerCase();
          if (f.flightNo.startsWith("VN") && r.includes("cancel")) {
            if (vascoDeparted.has(`${f.st}_${f.airportName}_${f.date}`)) {
              return false;
            }
          }
          return true;
        });

        // 3. SẮP XẾP THEO THỨ TỰ CA TRỰC: 03:00 -> 23:59 (D) rồi nối tiếp 00:00 -> 02:59 (D+1)
        finalList.sort((a, b) => {
          const getWeight = (item) => {
            const [h, m] = (item.st || "00:00").split(":").map(Number);
            // Nếu thuộc ngày hôm sau D+1 hoặc giờ < 03:00, cộng thêm 24 tiếng để xếp ở cuối ca trực
            if (item.isNextDay || (item.st || "") < "03:00") {
              return (h + 24) * 60 + (m || 0);
            }
            return h * 60 + (m || 0);
          };
          return getWeight(a) - getWeight(b);
        });

        setFlights(finalList);
        setLoading(false);
      },
      (error) => {
        console.error("Lỗi đọc Firestore:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [filterDate, nextDateStr]);

  const handleTriggerSync = async () => {
    try {
      setSyncing(true);
      setSyncMessage("Đang quét dữ liệu ca trực từ VIAGS...");
      const res = await fetch(`/api/sync?date=${filterDate}`);
      const data = await res.json();

      if (data.success) {
        setSyncMessage(`Đã cập nhật ${data.totalFlights} chuyến bay ca trực!`);
      } else {
        setSyncMessage(`Lỗi: ${data.error || "Không thể đồng bộ"}`);
      }
    } catch (err) {
      setSyncMessage("Lỗi kết nối máy chủ");
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(""), 4000);
    }
  };

  const filteredFlights = useMemo(() => {
    return flights.filter((f) => {
      if (f.tripType !== filterTrip) return false;
      if (f.stationType !== filterStation) return false;

      const airlineName = resolveAirlineName(f.flightNo, f.airlines);
      const iataCode = toIATA(f.airportName);

      if (filterAirline === "VNA") {
        const isVna =
          airlineName.includes("VIETNAM AIRLINES") ||
          f.flightNo.startsWith("VN");
        if (!isVna) return false;
      }

      if (filterTime !== "all") {
        const [start, end] = filterTime.split("-");
        const flightTime = (f.st || "").replace(":", "");
        if (flightTime < start || flightTime > end) return false;
      }

      if (searchTerm.trim() !== "") {
        const term = searchTerm.toLowerCase();
        const matchFlt = (f.flightNo || "").toLowerCase().includes(term);
        const matchAirport = (f.airportName || "").toLowerCase().includes(term);
        const matchIata = iataCode.toLowerCase().includes(term);
        const matchAirline = airlineName.toLowerCase().includes(term);
        if (!matchFlt && !matchAirport && !matchIata && !matchAirline) return false;
      }

      return true;
    });
  }, [flights, filterTrip, filterStation, filterAirline, filterTime, searchTerm]);

  const getBadgeClass = (remark = "") => {
    const r = remark.toLowerCase();
    if (r.includes("cancel") || r.includes("hủy")) return "badge badge-cancel";
    if (
      r.includes("departed") ||
      r.includes("đã bay") ||
      r.includes("arrived") ||
      r.includes("landed") ||
      r.includes("đã đến") ||
      r.includes("hạ cánh")
    )
      return "badge badge-departed";
    if (r.includes("boarding") || r.includes("lên")) return "badge badge-boarding";
    if (r.includes("check") || r.includes("thủ tục") || r.includes("open")) return "badge badge-checkin";
    return "badge badge-default";
  };

  return (
    <div className="container">
      <div className="header-box">
        <div className="header-title">
          <h1>FLIGHT INFORMATION - TÂN SƠN NHẤT (SGN)</h1>
          <p>
            Ca trực khai thác (03:00 ➜ 03:00+ hôm sau) • Tích hợp VIAGS, TIA & FR24
            {lastSyncTime && ` • Cập nhật lần cuối: ${lastSyncTime}`}
          </p>
        </div>
        <div className="header-actions">
          <button
            className="btn-sync"
            onClick={handleTriggerSync}
            disabled={syncing}
            title="Đồng bộ dữ liệu ca trực từ VIAGS"
          >
            <RefreshCw size={16} className={syncing ? "spinner" : ""} />
            {syncing ? "Đang quét..." : "Đồng bộ ngay"}
          </button>
        </div>
      </div>

      {syncMessage && (
        <div
          style={{
            marginBottom: "16px",
            padding: "10px 16px",
            borderRadius: "8px",
            backgroundColor: syncMessage.includes("Lỗi") ? "#fff1f0" : "#f6ffed",
            color: syncMessage.includes("Lỗi") ? "#cf1322" : "#389e0d",
            border: `1px solid ${syncMessage.includes("Lỗi") ? "#ffa39e" : "#b7eb8f"}`,
            fontSize: "14px",
            fontWeight: "600",
          }}
        >
          {syncMessage}
        </div>
      )}

      {/* Khung Bộ Lọc */}
      <div className="filter-card">
        <div className="form-group">
          <label>Chuyến bay</label>
          <div className="filter-btn-group">
            <button
              className={`filter-btn ${filterTrip === "D" ? "active" : ""}`}
              onClick={() => setFilterTrip("D")}
            >
              DEP
            </button>
            <button
              className={`filter-btn ${filterTrip === "A" ? "active" : ""}`}
              onClick={() => setFilterTrip("A")}
            >
              ARR
            </button>
          </div>
        </div>

        <div className="form-group">
          <label>Tuyến bay</label>
          <div className="filter-btn-group">
            <button
              className={`filter-btn ${filterStation === "DOM" ? "active" : ""}`}
              onClick={() => setFilterStation("DOM")}
            >
              DOM
            </button>
            <button
              className={`filter-btn ${filterStation === "INT" ? "active" : ""}`}
              onClick={() => setFilterStation("INT")}
            >
              INTL
            </button>
          </div>
        </div>

        <div className="form-group">
          <label>Hãng bay</label>
          <div className="filter-btn-group">
            <button
              className={`filter-btn ${filterAirline === "ALL" ? "active" : ""}`}
              onClick={() => setFilterAirline("ALL")}
            >
              ALL
            </button>
            <button
              className={`filter-btn ${filterAirline === "VNA" ? "active" : ""}`}
              onClick={() => setFilterAirline("VNA")}
            >
              VNA
            </button>
          </div>
        </div>

        <div className="form-group">
          <label>Ngày khai thác</label>
          <input
            type="date"
            className="form-control"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label>Khung giờ</label>
          <select
            className="form-control"
            value={filterTime}
            onChange={(e) => setFilterTime(e.target.value)}
          >
            <option value="all">Toàn bộ ca trực (03:00 - 03:00+)</option>
            <option value="0300-0659">03:00 - 07:00 (Sáng sớm)</option>
            <option value="0700-1159">07:00 - 12:00 (Buổi sáng)</option>
            <option value="1200-1659">12:00 - 17:00 (Buổi chiều)</option>
            <option value="1700-2159">17:00 - 22:00 (Buổi tối)</option>
            <option value="2200-2359">22:00 - 24:00 (Đêm)</option>
            <option value="0000-0259">00:00 - 03:00 (Rạng sáng D+1)</option>
          </select>
        </div>

        <div className="form-group" style={{ flex: 1, minWidth: "180px" }}>
          <label>Tìm kiếm</label>
          <input
            type="text"
            className="form-control"
            placeholder="Mã chuyến, IATA (HAN, SFO, BKK)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="stats-bar">
        <span>
          Ca trực ngày <strong>{filterDate}</strong> (đến trước 03:00 sáng {nextDateStr}): Đang hiển thị{" "}
          <strong>{filteredFlights.length}</strong> chuyến bay
        </span>
      </div>

      {/* Bảng chuyến bay */}
      <div className="table-container">
        <table className="flight-table">
          <thead>
            <tr>
              <th style={{ width: "110px" }}>Flights</th>
              <th style={{ width: "105px" }}>Scheduled</th>
              <th style={{ width: "95px" }}>Estimated</th>
              <th style={{ width: "125px", color: "#f59e0b" }}>Flightradar24</th>
              <th style={{ width: "110px" }}>{filterTrip === "D" ? "Destination" : "From"}</th>
              <th style={{ width: "140px" }}>
                {filterTrip === "D" ? "Gate" : "Baggage"}
              </th>
              <th style={{ width: "150px" }}>Remarks</th>
              <th>Airlines</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="8" className="empty-state">
                  <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "8px" }}>
                    <RefreshCw size={18} className="spinner" /> Đang tải dữ liệu ca trực...
                  </div>
                </td>
              </tr>
            ) : filteredFlights.length > 0 ? (
              filteredFlights.map((item) => {
                const airlineName = resolveAirlineName(item.flightNo, item.airlines);
                const iataCode = toIATA(item.airportName);

                return (
                  <tr key={`${item.flightNo}_${item.st}_${item.date}`}>
                    {/* Cột 1: Flights */}
                    <td className="flight-no">{item.flightNo}</td>

                    {/* Cột 2: Scheduled */}
                    <td className="time-box">
                      {item.st}
                      {item.isNextDay && (
                        <span
                          style={{
                            fontSize: "10px",
                            fontWeight: "700",
                            color: "#dc2626",
                            marginLeft: "4px",
                            backgroundColor: "#fef2f2",
                            padding: "1px 4px",
                            borderRadius: "4px",
                            border: "1px solid #fecaca",
                          }}
                        >
                          +1
                        </span>
                      )}
                    </td>

                    {/* Cột 3: Estimated */}
                    <td
                      className="time-box"
                      style={{ color: item.et !== item.st ? "#e53e3e" : "#334155" }}
                    >
                      {item.et}
                    </td>

                    {/* Cột 4: Flightradar24 */}
                    <td>
                      {item.tripType === "A" && item.fr24ETA ? (
                        <span
                          style={{
                            fontWeight: "800",
                            color: "#d97706",
                            backgroundColor: "#fffbeb",
                            padding: "3px 8px",
                            borderRadius: "6px",
                            border: "1px solid #fde68a",
                            display: "inline-block",
                            fontSize: "14px",
                          }}
                        >
                          {item.fr24ETA}
                        </span>
                      ) : (
                        <span style={{ color: "#94a3b8" }}>-</span>
                      )}
                    </td>

                    {/* Cột 5: Destination hoặc From */}
                    <td className="airport-name" style={{ fontSize: "16px", fontWeight: "800", letterSpacing: "1px" }}>
                      {iataCode}
                    </td>

                    {/* Cột 6: Gate/Baggage */}
                    <td>
                      <div>
                        {item.beltGate ? (
                          <span className="gate-badge">{item.beltGate}</span>
                        ) : (
                          <span style={{ color: "#94a3b8" }}>-</span>
                        )}
                      </div>
                      {(item.terminal || item.checkinRow) && (
                        <div
                          style={{
                            fontSize: "11px",
                            fontWeight: "600",
                            color: "#0369a1",
                            backgroundColor: "#f0f9ff",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            display: "inline-block",
                            marginTop: "4px",
                            border: "1px solid #bae6fd",
                          }}
                        >
                          {item.terminal && <span>T{item.terminal}</span>}
                          {item.terminal && item.checkinRow && <span> • </span>}
                          {item.checkinRow && <span>Quầy {item.checkinRow}</span>}
                        </div>
                      )}
                    </td>

                    {/* Cột 7: Remarks */}
                    <td>
                      <span className={getBadgeClass(item.remark)}>
                        {item.remark || "On schedule"}
                      </span>
                    </td>

                    {/* Cột 8: Airlines */}
                    <td style={{ fontWeight: "500", color: "#334155" }}>
                      {airlineName}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="8" className="empty-state">
                  Không tìm thấy chuyến bay phù hợp với ca trực này.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}