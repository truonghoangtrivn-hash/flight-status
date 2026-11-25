"use client";

import { useState, useEffect, useMemo } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, doc } from "firebase/firestore";
import { RefreshCw, Search, Plane, Clock, Filter, AlertCircle, CheckCircle } from "lucide-react";

export default function FlightDashboard() {
  const [flights, setFlights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [lastSyncTime, setLastSyncTime] = useState(null);

  // Bộ lọc
  const todayStr = useMemo(() => {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
    }).format(new Date());
  }, []);

  const [filterDate, setFilterDate] = useState(todayStr);
  const [filterStation, setFilterStation] = useState("ALL"); // ALL, DOM, INT
  const [filterTrip, setFilterTrip] = useState("ALL");       // ALL, D, A
  const [filterTime, setFilterTime] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  // 1. Lắng nghe trạng thái cập nhật (Sync Status) thời gian thực
  useEffect(() => {
    const unsubMeta = onSnapshot(doc(db, "meta", "sync_status"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.lastUpdated) {
          const dateObj = new Date(data.lastUpdated);
          setLastSyncTime(dateObj.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
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

        // Sắp xếp theo thứ tự hiển thị: Ưu tiên giờ dự kiến (ST), sau đó đến thứ tự quét
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
      // Lọc Quốc nội / Quốc tế
      if (filterStation !== "ALL" && f.stationType !== filterStation) return false;
      // Lọc Đi / Đến
      if (filterTrip !== "ALL" && f.tripType !== filterTrip) return false;

      // Lọc khung giờ
      if (filterTime !== "all") {
        const [start, end] = filterTime.split("-");
        const flightTime = (f.st || "").replace(":", "");
        if (flightTime < start || flightTime > end) return false;
      }

      // Tìm kiếm từ khóa (Mã chuyến bay, Điểm đến/đi, Hãng bay)
      if (searchTerm.trim() !== "") {
        const term = searchTerm.toLowerCase();
        const matchFlt = (f.flightNo || "").toLowerCase().includes(term);
        const matchAirport = (f.airportName || "").toLowerCase().includes(term);
        const matchAirline = (f.airlines || "").toLowerCase().includes(term);
        if (!matchFlt && !matchAirport && !matchAirline) return false;
      }

      return true;
    });
  }, [flights, filterStation, filterTrip, filterTime, searchTerm]);

  // Hàm chọn màu cho Trạng thái (Remarks)
  const getBadgeClass = (remark = "") => {
    const r = remark.toLowerCase();
    if (r.includes("cancel") || r.includes("hủy")) return "badge badge-cancel";
    if (r.includes("departed") || r.includes("đã bay") || r.includes("arrived") || r.includes("đã đến")) return "badge badge-departed";
    if (r.includes("boarding") || r.includes("lên máy bay")) return "badge badge-boarding";
    if (r.includes("check-in") || r.includes("open")) return "badge badge-checkin";
    return "badge badge-default";
  };

  return (
    <div className="container">
      {/* Tiêu đề & Nút đồng bộ */}
      <div className="header-box">
        <div className="header-title">
          <h1>Flight Information - Tân Sơn Nhất (SGN)</h1>
          <p>
            Hệ thống theo dõi và cập nhật lịch trình bay theo thời gian thực
            {lastSyncTime && ` • Cập nhật lần cuối: ${lastSyncTime}`}
          </p>
        </div>
        <div className="header-actions">
          <button
            className="btn-sync"
            onClick={handleTriggerSync}
            disabled={syncing}
            title="Đồng bộ dữ liệu mới nhất từ VIAGS"
          >
            <RefreshCw size={16} className={syncing ? "spinner" : ""} />
            {syncing ? "Đang đồng bộ..." : "Đồng bộ ngay"}
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
            fontWeight: "500",
          }}
        >
          {syncMessage}
        </div>
      )}

      {/* Khung Bộ Lọc (Filters) */}
      <div className="filter-card">
        <div className="form-group">
          <label>Flights</label>
          <select
            className="form-control"
            value={filterStation}
            onChange={(e) => setFilterStation(e.target.value)}
          >
            <option value="ALL">Tất cả chuyến bay</option>
            <option value="DOM">Domestic Flights (Quốc nội)</option>
            <option value="INT">International Flights (Quốc tế)</option>
          </select>
        </div>

        <div className="form-group">
          <label>Departures / Arrivals</label>
          <select
            className="form-control"
            value={filterTrip}
            onChange={(e) => setFilterTrip(e.target.value)}
          >
            <option value="ALL">Tất cả (Đi & Đến)</option>
            <option value="D">Departures (Khởi hành)</option>
            <option value="A">Arrivals (Đến nơi)</option>
          </select>
        </div>

        <div className="form-group">
          <label>Location</label>
          <select className="form-control" disabled value="SGN">
            <option value="SGN">Ho Chi Minh (SGN)</option>
          </select>
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

        <div className="form-group">
          <label>Tìm kiếm nhanh</label>
          <div style={{ position: "relative" }}>
            <input
              type="text"
              className="form-control"
              placeholder="Mã chuyến, điểm đến..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Thanh thống kê kết quả */}
      <div className="stats-bar">
        <span>
          Hiển thị: <strong>{filteredFlights.length}</strong> chuyến bay
          {flights.length === 0 && !loading && " (Chưa có dữ liệu, hãy bấm 'Đồng bộ ngay')"}
        </span>
      </div>

      {/* Bảng danh sách chuyến bay */}
      <div className="table-container">
        <table className="flight-table">
          <thead>
            <tr>
              <th style={{ width: "100px" }}>Scheduled</th>
              <th style={{ width: "100px" }}>Estimated</th>
              <th>
                {filterTrip === "D"
                  ? "Destination"
                  : filterTrip === "A"
                  ? "From"
                  : "Destination / From"}
              </th>
              <th>Airlines</th>
              <th style={{ width: "120px" }}>Flights</th>
              <th style={{ width: "100px" }}>
                {filterTrip === "A" ? "Baggage" : "Gate"}
              </th>
              <th style={{ width: "140px" }}>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="7" className="empty-state">
                  <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "8px" }}>
                    <RefreshCw size={18} className="spinner" /> Đang tải dữ liệu từ Firestore...
                  </div>
                </td>
              </tr>
            ) : filteredFlights.length > 0 ? (
              filteredFlights.map((item) => (
                <tr key={item.id}>
                  <td className="time-box">{item.st}</td>
                  <td className="time-box" style={{ color: item.et !== item.st ? "#e53e3e" : "#2d3748" }}>
                    {item.et}
                  </td>
                  <td className="airport-name">
                    {item.airportName}
                    <span style={{ fontSize: "11px", color: "#8c8c8c", marginLeft: "6px" }}>
                      ({item.tripType === "D" ? "Khởi hành" : "Đến nơi"})
                    </span>
                  </td>
                  <td>{item.airlines}</td>
                  <td className="flight-no">{item.flightNo}</td>
                  <td>
                    {item.beltGate ? (
                      <span className="gate-badge">{item.beltGate}</span>
                    ) : (
                      <span style={{ color: "#bbb" }}>-</span>
                    )}
                  </td>
                  <td>
                    <span className={getBadgeClass(item.remark)}>
                      {item.remark || "On schedule"}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="7" className="empty-state">
                  {flights.length === 0 ? (
                    <div>
                      <p style={{ marginBottom: "12px", fontSize: "15px" }}>
                        Chưa có dữ liệu chuyến bay ngày hôm nay trong Firebase!
                      </p>
                      <button className="btn-sync" style={{ margin: "0 auto", color: "#00779e", border: "1px solid #00779e" }} onClick={handleTriggerSync}>
                        <RefreshCw size={14} /> Bấm vào đây để tải dữ liệu từ VIAGS
                      </button>
                    </div>
                  ) : (
                    "Không tìm thấy chuyến bay phù hợp với bộ lọc."
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}