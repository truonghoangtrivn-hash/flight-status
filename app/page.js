"use client";

import { useState, useEffect, useMemo } from "react";
import { db } from "@/lib/firebase";
import { onSnapshot, doc } from "firebase/firestore";

// Bảng từ điển Hãng bay mở rộng toàn diện
const AIRLINE_DICT = {
  VN: "VIETNAM AIRLINES",
  "0V": "VASCO",
  OV: "VASCO",
  BL: "PACIFIC AIRLINES",
  VJ: "VIETJET AIR",
  QH: "BAMBOO AIRWAYS",
  VU: "VIETRAVEL AIRLINES",
  "9G": "9 AIR",
  AQ: "9 AIR",
  K6: "CAMBODIA ANGKOR AIR",
  KR: "CAMBODIA AIRWAYS",
  LQ: "LANMEI AIRLINES",
  QV: "LAO AIRLINES",
  DR: "RUILI AIRLINES",
  SC: "SHANDONG AIRLINES",
  JX: "STARLUX AIRLINES",
  "9C": "SPRING AIRLINES",
  "5J": "CEBU PACIFIC AIR",
  PR: "PHILIPPINE AIRLINES",
  GA: "GARUDA INDONESIA",
  TK: "TURKISH AIRLINES",
  CI: "CHINA AIRLINES",
  BR: "EVA AIR",
  SQ: "SINGAPORE AIRLINES",
  TG: "THAI AIRWAYS",
  CX: "CATHAY PACIFIC",
  UO: "HK EXPRESS",
  HX: "HONG KONG AIRLINES",
  HB: "GREATER BAY AIRLINES",
  NX: "AIR MACAU",
  EK: "EMIRATES",
  QR: "QATAR AIRWAYS",
  EY: "ETIHAD AIRWAYS",
  KE: "KOREAN AIR",
  OZ: "ASIANA AIRLINES",
  YP: "AIR PREMIA",
  "7C": "JEJU AIR",
  LJ: "JIN AIR",
  TW: "T'WAY AIR",
  ZE: "EASTAR JET",
  BX: "AIR BUSAN",
  JL: "JAPAN AIRLINES",
  NH: "ALL NIPPON AIRWAYS",
  NQ: "AIR JAPAN",
  MM: "PEACH AVIATION",
  CZ: "CHINA SOUTHERN AIRLINES",
  MU: "CHINA EASTERN AIRLINES",
  FM: "SHANGHAI AIRLINES",
  CA: "AIR CHINA",
  ZH: "SHENZHEN AIRLINES",
  MF: "XIAMEN AIR",
  "3U": "SICHUAN AIRLINES",
  HU: "HAINAN AIRLINES",
  HO: "JUNEYAO AIRLINES",
  TR: "SCOOT",
  "3K": "JETSTAR ASIA",
  JQ: "JETSTAR AIRWAYS",
  QF: "QANTAS",
  AK: "AIRASIA",
  FD: "THAI AIRASIA",
  QZ: "INDONESIA AIRASIA",
  Z2: "PHILIPPINES AIRASIA",
  D7: "AIRASIA X",
  XJ: "THAI AIRASIA X",
  OD: "BATIK AIR MALAYSIA",
  ID: "BATIK AIR",
  MH: "MALAYSIA AIRLINES",
  BI: "ROYAL BRUNEI AIRLINES",
  PG: "BANGKOK AIRWAYS",
  SL: "THAI LION AIR",
  VZ: "THAI VIETJET AIR",
  "8M": "MYANMAR AIRWAYS INTL",
  UB: "MYANMAR NATIONAL AIRLINES",
  AI: "AIR INDIA",
  "6E": "INDIGO",
  UL: "SRILANKAN AIRLINES",
  SU: "AEROFLOT",
  T5: "TURKMENISTAN AIRLINES",
  HY: "UZBEKISTAN AIRWAYS",
  KC: "AIR ASTANA",
  AF: "AIR FRANCE",
  LH: "LUFTHANSA",
  SK: "SCANDINAVIAN AIRLINES",
  UA: "UNITED AIRLINES",
  DL: "DELTA AIR LINES",
  AA: "AMERICAN AIRLINES",
  "5X": "UPS AIRLINES",
  FX: "FEDEX EXPRESS",
  CV: "CARGOLUX",
  PO: "POLAR AIR CARGO",
  "5Y": "ATLAS AIR",
  K4: "KALITTA AIR",
  O3: "SF AIRLINES",
  CF: "CHINA POSTAL AIRLINES",
  Y8: "SUPARNA AIRLINES",
  VI: "VOLGA-DNEPR AIRLINES",
};

// Danh sách các chuyến bay thực tế đi/đến sân bay TOKYO HANEDA (HND)
// Tất cả các chuyến TOKYO còn lại (VN306, VN307, NH834, NH833, JL750, JL759, VJ822, VJ823...) đều là NARITA (NRT)
const TOKYO_HANEDA_FLIGHTS = new Set([
  "NH891",
  "NH892",
  "UA7974",
  "JL70",
  "JL070",
  "JL79",
  "JL079",
  "VJ820",
  "VJ821",
]);

// BẢNG TỪ ĐIỂN MÃ SÂN BAY IATA TOÀN DIỆN (BAO GỒM CẢ CÁC TÊN VIẾT SAI CHÍNH TẢ TỪ HỆ THỐNG GỐC)
const IATA_MAP = {
  // --- VIỆT NAM (NỘI ĐỊA) ---
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

  // --- CÁC ĐỊA DANH MỚI & CÁCH VIẾT SAI CHÍNH TẢ TRÊN BẢNG GỐC ---
  PAKSE: "PKZ",
  "LIJIANG CITY": "LJG",
  LIJIANG: "LJG",
  QUINGDAO: "TAO", // Lỗi chính tả thừa chữ U của Shandong Airlines SC4646
  QINGDAO: "TAO",
  "BEJING CHINA": "PEK", // Lỗi chính tả thiếu chữ I của Air China CA904
  "BEJING-CHINA": "PEK",
  BEJING: "PEK",
  "BEIJING CHINA": "PEK",
  "BEIJING-CHINA": "PEK",
  BEIJING: "PEK",
  "BEIJING CAPITAL": "PEK",
  "BEIJING DAXING": "PKX",
  DAXING: "PKX",

  // --- TRUNG QUỐC, HỒNG KÔNG, ĐÀI LOAN ---
  SHENZHEN: "SZX", SHENZEN: "SZX",
  SHANGHAI: "PVG", PUDONG: "PVG", HONGQIAO: "SHA",
  GUANGZHOU: "CAN", KUNMING: "KMG", NANJING: "NKG", CHENGDU: "TFU", CHONGQING: "CKG",
  HANGZHOU: "HGH", WUHAN: "WUH", XIAMEN: "XMN", JINAN: "TNA",
  SANYA: "SYX", HAIKOU: "HAK", NANNING: "NNG", ZHENGZHOU: "CGO", CHANGSHA: "CSX",
  GUIYANG: "KWE", HARBIN: "HRB", SHENYANG: "SHE", LANZHOU: "LHW", WENZHOU: "WNZ",
  NINGBO: "NGB", HEFEI: "HFE", NANCHANG: "KHN", TAIYUAN: "TYN", DALIAN: "DLC",
  FUZHOU: "FOC", QUANZHOU: "JJN", JINJIANG: "JJN", WUXI: "WUX", TIANJIN: "TSN",
  HONGKONG: "HKG", "HONG KONG": "HKG", MACAU: "MFM", MACAO: "MFM",
  TAIPEI: "TPE", TAOYUAN: "TPE", KAOHSIUNG: "KHH", TAICHUNG: "RMQ", TAINAN: "TNN",

  // --- ĐÔNG NAM Á ---
  "SIEM RIEP": "SAI", "SIEM REAP": "SAI", SIEMREAP: "SAI", SIEMRIEP: "SAI",
  "PHNOM PENH": "PNH", PHNOMPENH: "PNH", SIHANOUKVILLE: "KOS",
  BANGKOK: "BKK", SUVARNABHUMI: "BKK", "DON MUEANG": "DMK", "DON MUANG": "DMK",
  PHUKET: "HKT", "CHIANG MAI": "CNX",
  SINGAPORE: "SIN", CHANGI: "SIN", "KUALA LUMPUR": "KUL", KUALALUMPUR: "KUL",
  PENANG: "PEN", KUCHING: "KCH", "KOTA KINABALU": "BKI",
  JAKARTA: "CGK", SEMARANG: "SRG", BALI: "DPS", DENPASAR: "DPS", SURABAYA: "SUB",
  MANILA: "MNL", CEBU: "CEB", CLARK: "CRK",
  VIENTIANE: "VTE", "LUANG PRABANG": "LPQ", YANGON: "RGN", MANDALAY: "MDL", BRUNEI: "BWN",

  // --- NHẬT BẢN & HÀN QUỐC ---
  HANEDA: "HND", "HANEDA-TOKYO, JAPAN": "HND", "HANEDA-TOKYO": "HND",
  NARITA: "NRT", "NARITA-TOKYO": "NRT",
  OSAKA: "KIX", KANSAI: "KIX", NAGOYA: "NGO", FUKUOKA: "FUK", SAPPORO: "CTS", OKINAWA: "OKA",
  SEOUL: "ICN", INCHEON: "ICN", ANAA: "ICN", GIMPO: "GMP", BUSAN: "PUS", DAEGU: "TAE", JEJU: "CJU",

  // --- CHÂU ÂU, TRUNG ĐÔNG, NAM Á, CHÂU ÚC, MỸ ---
  COPENHAGEN: "CPH", KOBENHAVN: "CPH", MUENCHEN: "MUC", MUNICH: "MUC",
  PARIS: "CDG", FRANKFURT: "FRA", LONDON: "LHR", AMSTERDAM: "AMS",
  ASHKHABAD: "ASB", ASHGABAT: "ASB", MOSCOW: "SVO", BARNAUL: "BAX", NOVOSIBIRSK: "OVB",
  ALMATY: "ALA", TASHKENT: "TAS", ISTANBUL: "IST", DOHA: "DOH", DUBAI: "DXB", "ABU DHABI": "AUH",
  BOMBAY: "BOM", MUMBAI: "BOM", "MUMBAI, INDIA": "BOM", DELHI: "DEL", "NEW DELHI": "DEL",
  BENGALURU: "BLR", BANGALORE: "BLR", CHENNAI: "MAA", KOLKATA: "CCU", HYDERABAD: "HYD",
  AHMEDABAD: "AMD", KOCHI: "COK", COLOMBO: "CMB",
  SYDNEY: "SYD", MELBOURNE: "MEL", BRISBANE: "BNE", PERTH: "PER", ADELAIDE: "ADL", AUCKLAND: "AKL",
  HONOLULU: "HNL", "SAN FRANCISCO": "SFO", SANFRANCISCO: "SFO", "LOS ANGELES": "LAX", SEATTLE: "SEA",
};

const SORTED_IATA_KEYS = Object.keys(IATA_MAP).sort((a, b) => b.length - a.length);

// Hàm chuẩn hóa số hiệu chuyến bay (Xử lý lỗi dính tiền tố "00" ở chuyến hàng hóa/thuê chuyến như 00VHLLJ, 00VI8114)
function normalizeFlightNumber(rawFlt = "") {
  let clean = (rawFlt || "").replace(/\s+/g, "").toUpperCase();
  if (clean.startsWith("00") && clean.length > 4) {
    clean = clean.slice(2);
  }
  return clean;
}

// Hàm chuyển đổi sang mã IATA 3 chữ cái (Phân biệt chính xác Tokyo Narita NRT vs Haneda HND theo số hiệu chuyến bay)
function toIATA(name = "", flightNo = "") {
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

  const cleanFlt = normalizeFlightNumber(flightNo);

  // 1. Xử lý chuyên biệt cho TOKYO / TYO / HND / NRT
  if (clean.includes("NARITA") || clean === "NRT") {
    return "NRT";
  }
  if (clean.includes("HANEDA")) {
    return "HND";
  }
  if (clean.includes("TOKYO") || clean === "TYO" || clean === "HND") {
    // Nếu số hiệu chuyến bay nằm trong danh sách bay Haneda (NH892, JL070, VJ820...) -> HND
    if (TOKYO_HANEDA_FLIGHTS.has(cleanFlt)) {
      return "HND";
    }
    // Ngược lại (NH834, JL750, VN306, VN307, VJ822...) -> Thực tế hạ cánh tại Narita (NRT)
    return "NRT";
  }

  // 2. Nếu bản thân đã là mã IATA 3 chữ cái chuẩn
  if (clean.length === 3 && /^[A-Z]{3}$/.test(clean)) {
    return clean;
  }

  // 3. Khớp chính xác trong từ điển
  if (IATA_MAP[clean]) {
    return IATA_MAP[clean];
  }

  // 4. Khớp theo từ khóa ưu tiên chuỗi dài
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
  const clean = normalizeFlightNumber(flightNo);
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

function getNextDayStr(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().split("T")[0];
}

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
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [lastFR24Time, setLastFR24Time] = useState(null);

  const [filterDate, setFilterDate] = useState(() => getInitialOperationalDate());
  const nextDateStr = useMemo(() => getNextDayStr(filterDate), [filterDate]);

  const [filterTrip, setFilterTrip] = useState("D");
  const [filterStation, setFilterStation] = useState("DOM");
  const [filterAirline, setFilterAirline] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");

  // Lắng nghe dữ liệu từ 2 bản ghi gộp (Chỉ tốn 2 lượt Đọc!)
  useEffect(() => {
    setLoading(true);
    let day1Flights = [];
    let day2Flights = [];

    const processAndCombine = () => {
      const rawList = [...day1Flights, ...day2Flights];

      // Áp dụng ca trực 03:00 -> 03:00+ hôm sau
      const opDayFlights = rawList.filter((f) => {
        const st = f.st || "";
        if (f.date === filterDate) {
          return st >= "03:00";
        }
        if (f.date === nextDateStr) {
          return st < "03:00";
        }
        return false;
      });

      const flightMap = new Map();

      opDayFlights.forEach((item) => {
        const cleanFlt = normalizeFlightNumber(item.flightNo);
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

      finalList.sort((a, b) => {
        const getWeight = (item) => {
          const [h, m] = (item.st || "00:00").split(":").map(Number);
          if (item.isNextDay || (item.st || "") < "03:00") {
            return (h + 24) * 60 + (m || 0);
          }
          return h * 60 + (m || 0);
        };
        return getWeight(a) - getWeight(b);
      });

      setFlights(finalList);
      setLoading(false);
    };

    const unsub1 = onSnapshot(
      doc(db, "daily_sgn", filterDate),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.lastUpdated) {
            setLastSyncTime(
              new Date(data.lastUpdated).toLocaleTimeString("vi-VN", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })
            );
          }
          if (data.lastFR24Sync) {
            setLastFR24Time(
              new Date(data.lastFR24Sync).toLocaleTimeString("vi-VN", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })
            );
          }
          day1Flights = Object.values(data.flights || {});
        } else {
          day1Flights = [];
        }
        processAndCombine();
      },
      (err) => {
        console.error("Lỗi đọc ngày 1:", err);
        setLoading(false);
      }
    );

    const unsub2 = onSnapshot(
      doc(db, "daily_sgn", nextDateStr),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          day2Flights = Object.values(data.flights || {});
        } else {
          day2Flights = [];
        }
        processAndCombine();
      },
      (err) => {
        console.error("Lỗi đọc ngày 2:", err);
        setLoading(false);
      }
    );

    return () => {
      unsub1();
      unsub2();
    };
  }, [filterDate, nextDateStr]);

  const filteredFlights = useMemo(() => {
    return flights.filter((f) => {
      if (f.tripType !== filterTrip) return false;
      if (f.stationType !== filterStation) return false;

      const airlineName = resolveAirlineName(f.flightNo, f.airlines);
      const iataCode = toIATA(f.airportName, f.flightNo);

      if (filterAirline === "VNA") {
        const isVna =
          airlineName.includes("VIETNAM AIRLINES") ||
          f.flightNo.startsWith("VN");
        if (!isVna) return false;
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
  }, [flights, filterTrip, filterStation, filterAirline, searchTerm]);

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
            Tích hợp VIAGS, TIA
            {lastSyncTime && ` • Cập nhật: ${lastSyncTime}`}
            {lastFR24Time && ` • Radar FR24: ${lastFR24Time}`}
          </p>
        </div>
        
        <div className="header-actions">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              backgroundColor: "rgba(255, 255, 255, 0.18)",
              padding: "8px 16px",
              borderRadius: "20px",
              fontSize: "13px",
              fontWeight: "600",
              letterSpacing: "0.3px",
              backdropFilter: "blur(4px)",
              border: "1px solid rgba(255, 255, 255, 0.25)",
            }}
          >
            <span
              style={{
                width: "9px",
                height: "9px",
                borderRadius: "50%",
                backgroundColor: "#4ade80",
                boxShadow: "0 0 10px #4ade80",
                display: "inline-block",
              }}
            />
            <span>Tự động hóa 24/7 (Cloud)</span>
          </div>
        </div>
      </div>

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
          <label>Ngày</label>
          <input
            type="date"
            className="form-control"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
          />
        </div>

        <div className="form-group" style={{ flex: 1, minWidth: "220px" }}>
          <label>Tìm kiếm</label>
          <input
            type="text"
            className="form-control"
            placeholder="Mã chuyến, IATA (NRT, HND, PKZ, LJG)..."
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
                    Đang tải dữ liệu...
                  </div>
                </td>
              </tr>
            ) : filteredFlights.length > 0 ? (
              filteredFlights.map((item) => {
                const airlineName = resolveAirlineName(item.flightNo, item.airlines);
                const iataCode = toIATA(item.airportName, item.flightNo);

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
                  Không tìm thấy chuyến bay phù hợp.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}