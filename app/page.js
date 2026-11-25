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

// BẢNG TỪ ĐIỂN MÃ SÂN BAY IATA TOÀN DIỆN (CHÍNH XÁC THEO MỌI CÁCH VIẾT CỦA VIAGS & TIA)
const IATA_MAP = {
  // --- VIỆT NAM (NỘI ĐỊA) ---
  "HA NOI": "HAN",
  HANOI: "HAN",
  "NOI BAI": "HAN",
  HUE: "HUI",
  "PHU BAI": "HUI",
  "THANH HOA": "THD",
  "THO XUAN": "THD",
  VINH: "VII",
  "DA NANG": "DAD",
  DANANG: "DAD",
  "HAI PHONG": "HPH",
  "CAT BI": "HPH",
  "PHU QUOC": "PQC",
  PHUQUOC: "PQC",
  "CAM RANH": "CXR",
  "NHA TRANG": "CXR",
  "CON DAO": "VCS",
  CONDAO: "VCS",
  PLEIKU: "PXU",
  "QUY NHON": "UIH",
  "PHU CAT": "UIH",
  "BUON ME THUOT": "BMV",
  "BUON MA THUOT": "BMV",
  "DA LAT": "DLI",
  DALAT: "DLI",
  "LIEN KHUONG": "DLI",
  "TUY HOA": "TBB",
  "DONG TAC": "TBB",
  "CHU LAI": "VCL",
  "DONG HOI": "VDH",
  "CA MAU": "CAH",
  "CAN THO": "VCA",
  "RACH GIA": "VKG",
  "DIEN BIEN": "DIN",
  "VAN DON": "VDO",
  "QUANG NINH": "VDO",

  // --- TRUNG QUỐC & HỒNG KÔNG, ĐÀI LOAN ---
  SHENZHEN: "SZX",
  SHENZEN: "SZX",
  "BEIJING CHINA": "PEK",
  "BEIJING-CHINA": "PEK",
  BEIJING: "PEK",
  "BEIJING CAPITAL": "PEK",
  "BEIJING DAXING": "PKX",
  DAXING: "PKX",
  SHANGHAI: "PVG",
  PUDONG: "PVG",
  HONGQIAO: "SHA",
  GUANGZHOU: "CAN",
  KUNMING: "KMG",
  NANJING: "NKG",
  CHENGDU: "TFU",
  CHONGQING: "CKG",
  HANGZHOU: "HGH",
  WUHAN: "WUH",
  XIAMEN: "XMN",
  QINGDAO: "TAO",
  JINAN: "TNA",
  SANYA: "SYX",
  HAIKOU: "HAK",
  NANNING: "NNG",
  ZHENGZHOU: "CGO",
  CHANGSHA: "CSX",
  TIANJIN: "TSN",
  HONGKONG: "HKG",
  "HONG KONG": "HKG",
  MACAU: "MFM",
  MACAO: "MFM",
  TAIPEI: "TPE",
  TAOYUAN: "TPE",
  KAOHSIUNG: "KHH",
  TAICHUNG: "RMQ",

  // --- ĐÔNG NAM Á ---
  "SIEM RIEP": "SAI",
  "SIEM REAP": "SAI",
  SIEMREAP: "SAI",
  SIEMRIEP: "SAI",
  "PHNOM PENH": "PNH",
  PHNOMPENH: "PNH",
  SIHANOUKVILLE: "KOS",
  BANGKOK: "BKK",
  SUVARNABHUMI: "BKK",
  "DON MUEANG": "DMK",
  "DON MUANG": "DMK",
  PHUKET: "HKT",
  "CHIANG MAI": "CNX",
  SINGAPORE: "SIN",
  CHANGI: "SIN",
  "KUALA LUMPUR": "KUL",
  KUALALUMPUR: "KUL",
  PENANG: "PEN",
  KUCHING: "KCH",
  JAKARTA: "CGK",
  SEMARANG: "SRG",
  BALI: "DPS",
  DENPASAR: "DPS",
  SURABAYA: "SUB",
  MANILA: "MNL",
  CEBU: "CEB",
  CLARK: "CRK",
  VIENTIANE: "VTE",
  "LUANG PRABANG": "LPQ",
  YANGON: "RGN",
  BRUNEI: "BWN",

  // --- NHẬT BẢN & HÀN QUỐC ---
  TOKYO: "HND",
  HANEDA: "HND",
  "HANEDA-TOKYO, JAPAN": "HND",
  "HANEDA-TOKYO": "HND",
  NARITA: "NRT",
  OSAKA: "KIX",
  KANSAI: "KIX",
  NAGOYA: "NGO",
  FUKUOKA: "FUK",
  SAPPORO: "CTS",
  OKINAWA: "OKA",
  SEOUL: "ICN",
  INCHEON: "ICN",
  ANAA: "ICN", // Chuyến DL7926 (liên danh KE476) đi Incheon
  GIMPO: "GMP",
  BUSAN: "PUS",
  DAEGU: "TAE",
  JEJU: "CJU",

  // --- CHÂU ÂU, NGA, TRUNG ĐÔNG, TRUNG Á ---
  COPENHAGEN: "CPH",
  KOBENHAVN: "CPH",
  MUENCHEN: "MUC",
  MUNICH: "MUC",
  PARIS: "CDG",
  FRANKFURT: "FRA",
  LONDON: "LHR",
  HEATHROW: "LHR",
  GATWICK: "LGW",
  AMSTERDAM: "AMS",
  ASHKHABAD: "ASB",
  ASHGABAT: "ASB",
  MOSCOW: "SVO",
  BARNAUL: "BAX",
  NOVOSIBIRSK: "OVB",
  ALMATY: "ALA",
  TASHKENT: "TAS",
  ISTANBUL: "IST",
  DOHA: "DOH",
  DUBAI: "DXB",
  "ABU DHABI": "AUH",

  // --- NAM Á ---
  BOMBAY: "BOM",
  MUMBAI: "BOM",
  "MUMBAI, INDIA": "BOM",
  DELHI: "DEL",
  "NEW DELHI": "DEL",
  BENGALURU: "BLR",
  BANGALORE: "BLR",
  CHENNAI: "MAA",
  KOLKATA: "CCU",
  COLOMBO: "CMB",

  // --- CHÂU ÚC & HOA KỲ ---
  SYDNEY: "SYD",
  MELBOURNE: "MEL",
  BRISBANE: "BNE",
  PERTH: "PER",
  ADELAIDE: "ADL",
  AUCKLAND: "AKL",
  HONOLULU: "HNL",
  "SAN FRANCISCO": "SFO",
  SANFRANCISCO: "SFO",
  "LOS ANGELES": "LAX",
  LOSANGELES: "LAX",
  SEATTLE: "SEA",
  "NEW YORK": "JFK",
};

// Sắp xếp các từ khóa theo độ dài từ dài đến ngắn để so khớp chính xác nhất
const SORTED_IATA_KEYS = Object.keys(IATA_MAP).sort((a, b) => b.length - a.length);

// Hàm chuyển đổi sang IATA chuẩn
function toIATA(name = "") {
  if (!name) return "";
  // Xóa bỏ dấu gạch ngang, dấu phẩy, khoảng trắng dư thừa
  let clean = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[-_.,]/g, " ")
    .replace(/\s+/g, " ")
    .toUpperCase()
    .trim();

  // Nếu bản thân nó đã là mã IATA 3 chữ cái
  if (clean.length === 3 && /^[A-Z]{3}$/.test(clean)) {
    return clean;
  }

  // 1. So khớp chính xác
  if (IATA_MAP[clean]) {
    return IATA_MAP[clean];
  }

  // 2. So khớp từ khóa ưu tiên chuỗi dài trước
  for (const key of SORTED_IATA_KEYS) {
    const cleanKey = key.replace(/[-_.,]/g, " ");
    if (clean === cleanKey || clean.includes(cleanKey) || cleanKey.includes(clean)) {
      return IATA_MAP[key];
    }
  }

  return clean;
}

function resolveAirlineName(flightNo = "", existingAirline = "") {
  if (existingAirline && existingAirline.trim() !== "") {
    return existingAirline.trim();
  }
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

export default function FlightDashboard() {
  const [flights, setFlights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [lastSyncTime, setLastSyncTime] = useState(null);

  const todayStr = useMemo(() => {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
    }).format(new Date());
  }, []);

  const [filterDate, setFilterDate] = useState(todayStr);
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

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, "flights_sgn"), where("date", "==", filterDate));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const rawList = [];
        snapshot.forEach((doc) => {
          rawList.push(doc.data());
        });

        const flightMap = new Map();

        rawList.forEach((item) => {
          const cleanFlt = (item.flightNo || "").replace(/\s+/g, "").toUpperCase();
          const cleanSt = (item.st || "").replace(/[^0-9]/g, "");
          const cleanApt = cleanAirportName(item.airportName);

          const uniqueKey = `${item.tripType || "D"}_${cleanFlt}_${cleanSt}`;

          if (!flightMap.has(uniqueKey)) {
            flightMap.set(uniqueKey, {
              ...item,
              flightNo: cleanFlt,
              airportName: cleanApt,
            });
          } else {
            const prev = flightMap.get(uniqueKey);
            const hasMoreInfo =
              (item.beltGate && !prev.beltGate) ||
              (item.terminal && !prev.terminal) ||
              (item.checkinRow && !prev.checkinRow) ||
              (item.hasTIAData && !prev.hasTIAData);

            flightMap.set(uniqueKey, {
              ...prev,
              ...(hasMoreInfo ? item : {}),
              flightNo: cleanFlt,
              airportName: cleanApt || prev.airportName,
              beltGate: item.beltGate || prev.beltGate,
              terminal: item.terminal || prev.terminal,
              checkinRow: item.checkinRow || prev.checkinRow,
              remark: item.hasTIAData ? item.remark : prev.remark || item.remark,
              airlines: prev.airlines || item.airlines,
            });
          }
        });

        // Khử nhiễu liên danh VASCO / VNA
        const mergedList = Array.from(flightMap.values());
        const vascoDeparted = new Set();

        mergedList.forEach((f) => {
          const r = (f.remark || "").toLowerCase();
          if (f.flightNo.startsWith("0V") && (r.includes("departed") || f.beltGate)) {
            vascoDeparted.add(`${f.st}_${f.airportName}`);
          }
        });

        const finalList = mergedList.filter((f) => {
          const r = (f.remark || "").toLowerCase();
          if (f.flightNo.startsWith("VN") && r.includes("cancel")) {
            if (vascoDeparted.has(`${f.st}_${f.airportName}`)) {
              return false;
            }
          }
          return true;
        });

        finalList.sort((a, b) => (a.st || "").localeCompare(b.st || ""));

        setFlights(finalList);
        setLoading(false);
      },
      (error) => {
        console.error("Lỗi đọc Firestore:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [filterDate]);

  const handleTriggerSync = async () => {
    try {
      setSyncing(true);
      setSyncMessage("Đang quét dữ liệu từ VIAGS...");
      const res = await fetch(`/api/sync?date=${filterDate}`);
      const data = await res.json();

      if (data.success) {
        setSyncMessage(`Đã cập nhật ${data.totalFlights} chuyến bay!`);
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
    if (r.includes("departed") || r.includes("đã bay") || r.includes("arrived") || r.includes("landed") || r.includes("đã đến") || r.includes("hạ cánh"))
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
            Lịch trình bay cập nhật liên tục • Tích hợp VIAGS & TIA FIDS
            {lastSyncTime && ` • Cập nhật lần cuối: ${lastSyncTime}`}
          </p>
        </div>
        <div className="header-actions">
          <button
            className="btn-sync"
            onClick={handleTriggerSync}
            disabled={syncing}
            title="Đồng bộ dữ liệu từ VIAGS"
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
          <label>Date</label>
          <input
            type="date"
            className="form-control"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label>Time</label>
          <select
            className="form-control"
            value={filterTime}
            onChange={(e) => setFilterTime(e.target.value)}
          >
            <option value="all">All day (Cả ngày)</option>
            <option value="0000-0359">00:00 - 04:00</option>
            <option value="0400-0759">04:00 - 08:00</option>
            <option value="0800-1159">08:00 - 12:00</option>
            <option value="1200-1559">12:00 - 16:00</option>
            <option value="1600-1959">16:00 - 20:00</option>
            <option value="2000-2359">20:00 - 23:59</option>
          </select>
        </div>

        <div className="form-group" style={{ flex: 1, minWidth: "180px" }}>
          <label>Tìm kiếm</label>
          <input
            type="text"
            className="form-control"
            placeholder="Mã chuyến, IATA (SZX, CPH, HKT, PEK)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="stats-bar">
        <span>
          Đang hiển thị: <strong>{filteredFlights.length}</strong> chuyến bay
        </span>
      </div>

      {/* Bảng chuyến bay */}
      <div className="table-container">
        <table className="flight-table">
          <thead>
            <tr>
              <th style={{ width: "120px" }}>Flights</th>
              <th style={{ width: "100px" }}>Scheduled</th>
              <th style={{ width: "100px" }}>Estimated</th>
              <th style={{ width: "120px" }}>{filterTrip === "D" ? "Destination" : "From"}</th>
              <th style={{ width: "150px" }}>
                {filterTrip === "D" ? "Gate" : "Baggage"}
              </th>
              <th style={{ width: "150px" }}>Remarks</th>
              <th>Airlines</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="7" className="empty-state">
                  <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "8px" }}>
                    <RefreshCw size={18} className="spinner" /> Đang tải dữ liệu...
                  </div>
                </td>
              </tr>
            ) : filteredFlights.length > 0 ? (
              filteredFlights.map((item) => {
                const airlineName = resolveAirlineName(item.flightNo, item.airlines);
                const iataCode = toIATA(item.airportName);

                return (
                  <tr key={`${item.flightNo}_${item.st}`}>
                    {/* Cột 1: Flights */}
                    <td className="flight-no">{item.flightNo}</td>

                    {/* Cột 2: Scheduled */}
                    <td className="time-box">{item.st}</td>

                    {/* Cột 3: Estimated */}
                    <td
                      className="time-box"
                      style={{ color: item.et !== item.st ? "#e53e3e" : "#334155" }}
                    >
                      {item.et}
                    </td>

                    {/* Cột 4: Mã sân bay IATA 3 chữ cái */}
                    <td className="airport-name" style={{ fontSize: "16px", fontWeight: "800", letterSpacing: "1px" }}>
                      {iataCode}
                    </td>

                    {/* Cột 5: Gate/Baggage */}
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

                    {/* Cột 6: Remarks */}
                    <td>
                      <span className={getBadgeClass(item.remark)}>
                        {item.remark || "On schedule"}
                      </span>
                    </td>

                    {/* Cột 7: Airlines */}
                    <td style={{ fontWeight: "500", color: "#334155" }}>
                      {airlineName}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="7" className="empty-state">
                  Không tìm thấy chuyến bay phù hợp với bộ lọc đã chọn.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}