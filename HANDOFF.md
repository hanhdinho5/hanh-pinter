# PTP Printer: Tài liệu bàn giao & Lộ trình phát triển

Dự án: Máy in avatar ảo cho TikTok LIVE, lấy cảm hứng từ PFP Printer của Livecade. Người xem comment, follow hoặc tặng quà thì avatar của họ được in lên tờ giấy 6 ô. Máy in hiển thị bằng Three.js, khung hình 9:16, đưa vào OBS qua Browser Source.

Stack:
- Node 22+
- TypeScript strict
- Express 5
- Socket.IO 4
- React + Vite + TS (client)
- Three.js
- pnpm

Cổng mặc định:
- Server: `http://localhost:3001`
- Client: `http://localhost:5173`

---

## Trạng thái các giai đoạn

### Giai đoạn 1: Backend Core (`server/src/`) - [HOÀN TẤT]
Phần lõi chạy hoàn chỉnh, không phụ thuộc TikTok.
- Luồng: Sự kiện → EventHandler (chuẩn hóa, quy tắc, chống trùng) → PrintQueue (2 lane: priority trước free) → PrinterEngine (xử lý tuần tự) → SheetManager (6 ô mỗi tờ).
- Quy tắc:
  - Comment/follow vào lane free, mỗi user chỉ 1 lần trên cùng 1 tờ giấy.
  - Gift luôn vào lane priority và không bị chặn trùng.
  - Tổng kim cương ≥ 100: khung vàng (`gold`).
  - Tổng kim cương ≥ 1000: in nguyên trang (`fullPage` - đẩy tờ hiện tại đi, in 1 tờ đặc biệt).
  - Pause: job đang in dở vẫn in xong rồi mới dừng.
- REST API:
  - `GET /api/health`
  - `GET /api/printer/state`
  - `GET /api/queue`
  - `POST /api/printer/pause` | `/resume` | `/speed`
  - `POST /api/dev/events/comment` | `/follow` | `/gift` (giả lập người xem)
- Socket.IO: Định nghĩa sự kiện tập trung tại `RealtimeEventMap` trong `server/src/types/index.ts`. Client mới kết nối nhận ngay snapshot trạng thái.
- Test: 5/5 test vượt qua (`pnpm test`), `pnpm typecheck` không lỗi.

---

### Giai đoạn 2: Máy in 3D (Workshop 9:16 bằng Three.js) - [ĐANG THỰC HIỆN]
- Dựng workshop tỷ lệ 9:16 (chuẩn dọc OBS 1080x1920) bằng Three.js.
- Bối cảnh: Phòng workshop ấm cúng với nền gỗ, bàn gỗ, ánh sáng ấm, bóng đổ.
- Máy in kim loại 3D cách điệu: Thân máy kim loại, trục ray, đầu in (extruder/printhead), khe nhả giấy, đèn LED trạng thái.
- Tờ giấy: Khổ giấy 6 ô (2 cột x 3 hàng) hoặc 1 ô đặc biệt khi fullPage.
- Sử dụng mock data để hiển thị trước ảnh avatar, username, khung thường và khung vàng.

---

### Giai đoạn 3: Hoạt ảnh & Hiệu ứng (Three.js Animation) - [CHƯA LÀM]
- Đầu in di chuyển theo trục X/Y trên vị trí ô đang in.
- Avatar hiện dần theo từng dòng (quét in từ trên xuống dưới / dither print effect).
- Giấy cuộn/đẩy ra từ khe máy in khi đủ 6 ảnh (hoặc khi đẩy tờ dở).
- Hiệu ứng hạt hào quang kim loại / khung vàng sáng khi in quà tặng lớn (≥ 100 kim cương).
- Hiệu ứng trang đặc biệt (≥ 1000 kim cương).

---

### Giai đoạn 4: Realtime (Socket.IO Client & Overlay OBS) - [CHƯA LÀM]
- Kết nối Socket.IO từ React client đến backend server (`:3001`).
- Dùng chung kiểu dữ liệu từ `RealtimeEventMap`.
- Trang overlay `/overlay` tỷ lệ cố định 9:16 (1080×1920), nền trong suốt hoặc workshop phù hợp OBS Browser Source.
- Đồng bộ mượt mà sự kiện in thật từ queue backend.

---

### Giai đoạn 5: TikTok LIVE Adapter - [CHƯA LÀM]
- Tích hợp `tiktok-live-connector`.
- Adapter chuyển sự kiện livestream (chat, follow, gift) thành `NewEventInput` và chuyển cho `EventHandler`.
- Cơ chế reconnect tự động, xử lý khi streamer ngắt kết nối.
- Lấy đúng avatar và thông tin người xem.

---

### Giai đoạn 6: Dashboard Điều khiển & Tối ưu OBS - [CHƯA LÀM]
- Trang Dashboard `/admin`: Điều khiển pause / resume / tốc độ in.
- Cấu hình ngưỡng quà, nhập TikTok username để kết nối livestream trực tiếp.
- Chạy thử nghiệm thực tế với livestream TikTok.
