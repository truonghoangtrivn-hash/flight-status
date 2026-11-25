"use client";

import { useState, useEffect, useMemo } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, doc } from "firebase/firestore";
import { RefreshCw, Search } from "lucide-react";

// Bảng từ điển mã hãng bay phổ biến tại Tân Sơn Nhất (SGN)
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
  MH: "MALAYSIA AIRLINES",
  PG: "BANGKOK AIRWAYS",
  MF: "XIAMEN AIR",
};

function resolveAirlineName(flightNo = "", existingAirline = "") {
  if (existingAirline && existingAirline.trim() !== "") {
    return existingAirline.trim();
  }
  const clean = flightNo.replace(/\s+/g, "").toUpperCase();
  const prefix2 = clean.slice(0, 2);
  if (AIRLINE_DICT[prefix2]) return AIRLINE_DICT[prefix2];
  return "-";
}

export default function FlightDashboard() {
  const [flights, setFlights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [lastSyncTime, setLastSyncTime] = useState(null);

  // Mặc định ngày hôm nay
  const todayStr = useMemo(() => {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
    }).format(new Date());
  }, []);

  const [filterDate, setFilterDate] = useState(todayStr);

  // Bộ lọc theo nút bấm: Mặc định là DEP và DOM
  const [filterTrip, setFilterTrip] = useState("D");       // "D" (DEP) hoặc "A" (ARR)
  const [filterStation, setFilterStation] = useState("DOM"); // "DOM" hoặc "INT" (INTL)
  const [filterAirline, setFilterAirline] = useState("ALL"); // "ALL" hoặc "VNA"

  const [filterTime, setFilterTime] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  // 1. Lắng nghe trạng thái cập nhật thời gian thực
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

  // 2. Lắng nghe danh sách chuyến bay theo ngày từ Firebase Firestore
  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, "flights_sgn"), where("date", "==", filterDate));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = [];
        snapshot.forEach((doc) => {
          list.push(doc.data());
        });

        // Sắp xếp thứ tự: Ưu tiên giờ Scheduled (ST)
        list.sort((a, b) => {
          if (a.st === b.st) {
            return (a.sortOrder || 0) - (b.sortOrder || 0);
          }
          return (a.st || "").localeCompare(b.st || "");
        });

        setFlights(list);
        setLoading(false);
      },
      (error) => {
        console.error("Lỗi đọc dữ liệu Firestore:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [filterDate]);

  // 3. Hàm kích hoạt cào dữ liệu từ VIAGS
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

  // 4. Lọc dữ liệu hiển thị trên bảng
  const filteredFlights = useMemo(() => {
    return flights.filter((f) => {
      // 1. Lọc DEP hoặc ARR
      if (f.tripType !== filterTrip) return false;

      // 2. Lọc DOM hoặc INTL
      if (f.stationType !== filterStation) return false;

      // Tính toán tên hãng
      const airlineName = resolveAirlineName(f.flightNo, f.airlines);

      // 3. Lọc VNA hoặc ALL
      if (filterAirline === "VNA") {
        const isVna =
          airlineName.includes("VIETNAM AIRLINES") ||
          (f.flightNo || "").replace(/\s+/g, "").toUpperCase().startsWith("VN");
        if (!isVna) return false;
      }

      // 4. Lọc khung giờ
      if (filterTime !== "all") {
        const [start, end] = filterTime.split("-");
        const flightTime = (f.st || "").replace(":", "");
        if (flightTime < start || flightTime > end) return false;
      }

      // 5. Tìm kiếm nhanh
      if (searchTerm.trim() !== "") {
        const term = searchTerm.toLowerCase();
        const matchFlt = (f.flightNo || "").toLowerCase().includes(term);
        const matchAirport = (f.airportName || "").toLowerCase().includes(term);
        const matchAirline = airlineName.toLowerCase().includes(term);
        if (!matchFlt && !matchAirport && !matchAirline) return false;
      }

      return true;
    });
  }, [flights, filterTrip, filterStation, filterAirline, filterTime, searchTerm]);

  // Màu sắc cho trạng thái (Remarks)
  const getBadgeClass = (remark = "") => {
    const r = remark.toLowerCase();
    if (r.includes("cancel") || r.includes("hủy")) return "badge badge-cancel";
    if (r.includes("departed") || r.includes("đã bay") || r.includes("arrived") || r.includes("đã đến"))
      return "badge badge-departed";
    if (r.includes("boarding") || r.includes("lên")) return "badge badge-boarding";
    if (r.includes("check") || r.includes("thủ tục") || r.includes("open")) return "badge badge-checkin";
    return "badge badge-default";
  };

  return (
    <div className="container">
      {/* Header */}
      <div className="header-box">
        <div className="header-title">
          <h1>Flight Information - Tân Sơn Nhất (SGN)</h1>
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

      {/* Khung Bộ Lọc & Các Nút Chuyển Đổi */}
      <div className="filter-card">
        {/* Nhóm 1: DEP / ARR */}
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

        {/* Nhóm 2: DOM / INTL */}
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

        {/* Nhóm 3: ALL / VNA */}
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

        {/* Ngày */}
        <div className="form-group">
          <label>Date</label>
          <input
            type="date"
            className="form-control"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
          />
        </div>

        {/* Khung giờ */}
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

        {/* Tìm kiếm */}
        <div className="form-group" style={{ flex: 1, minWidth: "180px" }}>
          <label>Tìm kiếm</label>
          <input
            type="text"
            className="form-control"
            placeholder="Mã chuyến, điểm đến, hãng..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Thống kê */}
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
              <th>{filterTrip === "D" ? "Destination" : "From"}</th>
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
                return (
                  <tr key={item.id}>
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

                    {/* Cột 4: Destination hoặc From */}
                    <td className="airport-name">{item.airportName}</td>

                    {/* Cột 5: Gate hoặc Baggage kèm Nhà ga & Quầy (từ TIA) */}
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