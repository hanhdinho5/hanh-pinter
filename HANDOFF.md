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

### Giai đoạn 2: Máy in 3D (Workshop 9:16 bằng Three.js) - [HOÀN TẤT]
- Dựng workshop tỷ lệ 9:16 (chuẩn dọc OBS 1080x1920) bằng Three.js thuần tích hợp React 19.
- Bối cảnh: Phòng workshop ấm cúng với bàn gỗ mahogany, tường gỗ ván ghép, ánh sáng keylight, spotlight và fill light tạo bóng mềm mại.
- Máy in kim loại 3D cách điệu: Thân máy kim loại phay xước, ray trượt kép bằng thép, cụm đầu in (printhead carriage, tản nhiệt, vòi phun đồng), khe nhả giấy có con lăn, khay đỡ dốc, đèn LED trạng thái có ánh sáng tỏa và màn hình OLED hiển thị thông tin.
- Tờ giấy in:
  - Khổ giấy uốn cong tự nhiên từ khe máy chảy dốc xuống bàn.
  - Vẽ động bằng HTML5 Canvas Texture độ phân giải cao (1024x1536).
  - Lưới 6 ô avatar (2 cột x 3 hàng) với ảnh avatar, tên @username, khung thường bạc và khung vàng VIP lấp lánh (quà ≥ 100 kim cương).
  - Chế độ trang đặc biệt (`kind: 'special'`) cho quà tặng lớn ≥ 1000 kim cương (Full page avatar).
- Bộ công cụ DevControls:
  - Chuyển đổi qua lại các bộ dữ liệu mẫu (mockPartialSheet, mockFullSheet, mockSpecialSheet, mockEmptySheet).
  - Thử nghiệm in thêm avatar vào các slot trống tiếp theo.
  - Chuyển đổi trạng thái máy in (idle, printing, paused) đồng bộ với đèn LED và màn hình OLED.
  - Đổi góc nhìn camera (9:16 Stream, Cận cảnh, Toàn cảnh xưởng).
  - Chuyển đổi chế độ toàn màn hình OBS.

---

### Giai đoạn 3: Hoạt ảnh & Hiệu ứng (Three.js Animation) - [HOÀN TẤT]
- Đầu in di chuyển: Cụm đầu in (carriage) quét zigzag theo trục X qua lại đúng vị trí cột ô đang in (hoặc quét toàn khổ đối với trang đặc biệt).
- Avatar hiện dần theo từng dòng (Progressive Line-by-line / Dither Print Reveal):
  - CanvasTexture cắt clip theo tiến trình in (`progress: 0 -> 1`).
  - Tia quét Laser Scanline phát sáng màu xanh cyan rực rỡ (khung thường) hoặc vàng hoàng gia (khung vàng) kèm các hạt chấm dither nhiệt mô phỏng in kim ảo.
- Cuộn & nạp giấy (Paper Roll / Eject Animation):
  - Khi tờ giấy đủ 6 ô hoặc khi có lệnh cuộn tờ mới: tờ giấy cũ trượt vút về phía trước và rơi nhẹ khỏi bàn; tờ giấy mới trắng tinh chui ra từ dưới dầm ngang máy in trượt vào vị trí chuẩn.
- Hiệu ứng khung vàng (Gold Frame Sparkles):
  - Viền vàng lấp lánh có hiệu ứng quét ánh kim (gleam sweep).
  - Hệ thống hạt `SparkleParticleSystem`: bùng nổ 40-50 ngôi sao vàng óng ánh bay tỏa lên trên và rơi xuống mặt bàn khi in xong ô vàng.
- Hiệu ứng Trang đặc biệt (Full Page VIP):
  - Đẩy nhanh tờ cũ, nạp tờ giấy đặc biệt, đầu in quét toàn bộ diện tích rộng với dải sáng vàng.
  - Pháo hoa ánh kim hoàng gia (Grand VIP celebration) bùng nổ khi in xong.
- Tích hợp điều khiển qua `DevControls`:
  - Nút "▶ In 1 Avatar (Quét dòng laser xanh)"
  - Nút "👑 In Khung Vàng (Quét vàng + Bắn hạt VIP)"
  - Nút "📜 Cuộn tờ mới (Đẩy tờ cũ ra)"
  - Nút "⭐ In Trang Đặc Biệt Full Page (VIP ≥ 1k)"

---

### Giai đoạn 4: Realtime (Socket.IO Client & Overlay OBS) - [HOÀN TẤT]
- Nối client với server qua `socket.io-client` dùng lại type từ `RealtimeEventMap`.
- Hook `usePrinterSocket`: Lắng nghe và đồng bộ trạng thái `printer:state`, `printer:sheet`, `queue`, `event`.
- Tự động kích hoạt hoạt ảnh in khi nhận `printer:job:started` (tính đúng thời gian in theo tốc độ máy `(basePrintMs * factor) / speed`).
- Tự động kích hoạt hoạt ảnh cuộn tờ mới khi nhận `printer:sheet:completed`.
- Trang riêng cho OBS Browser Source: `/overlay` (chuẩn tỷ lệ 1080×1920, nền sạch, không có thanh điều khiển, sẵn sàng đưa vào OBS).
- Bổ sung bộ điều khiển Realtime trong `DevControls`:
  - Hiển thị trạng thái kết nối thời gian thực (`:3001`).
  - Hiển thị số lượng hàng đợi thời gian thực (`Priority` & `Free`).
  - Các nút bắn sự kiện giả lập trực tiếp qua REST API: Comment, Follow, Gift 150 kim cương (vàng), Gift 1200 kim cương (Full Page).
  - Điều khiển pause/resume/tốc độ in trực tiếp tới backend engine.
  - Nút sao chép đường dẫn `/overlay` cho OBS.

---

### Giai đoạn 5: TikTok LIVE Adapter - [TIẾP THEO]
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
