import "./globals.css";

export const metadata = {
  title: "Flight Schedules - Tân Sơn Nhất (SGN)",
  description: "Bảng thông tin và tình trạng chuyến bay Tân Sơn Nhất cập nhật thời gian thực",
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body>{children}</body>
    </html>
  );
}