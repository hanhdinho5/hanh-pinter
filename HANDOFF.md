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

### Giai đoạn 5: TikTok LIVE Adapter - [HOÀN TẤT]
- `server/src/tiktok/tiktokAdapter.ts` dùng API mới của `tiktok-live-connector` 2.x (`TikTokLiveConnection`, proto v3), không dùng bản `legacy`.
- Chuyển chat/follow/gift sang `NewEventInput` rồi gọi `handler.handle()`, không đụng engine.
- Quà combo: gộp cả combo thành MỘT vé với tổng kim cương, in khi combo kết thúc (hoặc sau 4s im lặng). Kiểm tra `fetchIsLive()` trước khi vào phòng.
- Tự nối lại vô hạn khi rớt/hết phiên: 5s, 10s, 20s, 40s, tối đa 60s. Listener của kết nối cũ bị bỏ qua, chỉ một timer nối lại.
- Server nhớ username (`server/data/settings.json`, đã gitignore) và tự nối lại khi bật lại; bấm Ngắt thì quên.
- REST: `POST /api/tiktok/connect|disconnect`, `GET /api/tiktok/status`; Socket.IO `tiktok:status`.
- Avatar TikTok đi qua proxy `GET /api/avatar?url=` (chỉ cho CDN TikTok) vì CDN không có CORS cho canvas WebGL.
- `pnpm test`: 11/11 (gồm test luồng adapter: combo, trùng, hàng đợi đầy).

### Giai đoạn 6: Dashboard & OBS - [HOÀN TẤT PHẦN CODE, CHƯA CHẠY LIVE THẬT]
- Trang `/admin`: trạng thái + nhập username TikTok, pause/resume/tốc độ, ngưỡng quà, link OBS, nút thử, sự kiện gần đây.
- `GET/PUT /api/config/gift`: đổi ngưỡng khung vàng / nguyên trang ngay lập tức và lưu file.
- Thử khi chưa live: `/admin` có nút "Giả lập TikTok" (POST `/api/dev/tiktok/simulate`) đi qua đúng adapter thật, gồm combo quà.
- OBS: Browser Source `http://localhost:5173/overlay`, 1080x1920.
- Còn lại: chạy thử trên livestream TikTok thật (reconnect, avatar, quà combo chưa kiểm chứng ngoài đời).

---

### Giai đoạn 7: Đồng bộ Chuyển động Thanh In 2 Trục (Pen-Plotter Gantry Motion) & Hệ Thống Âm Thanh (SFX / BGM) - [HOÀN TẤT]
1. **Chuyển động Thanh in & Đầu in (CNC Plotter / Pen Motion)**:
   - **Ray trượt kim loại trục Z**: Mở rộng chiều dài ray lên `4.2` (từ $Z = -1.2$ tới $Z = +3.0$, đế kẹp tại $-1.15$ và $+2.95$), đảm bảo thanh dầm di chuyển trơn tru trên toàn bộ chiều dài tờ giấy mà không bị tuột khỏi ray.
   - **Thanh in (Gantry Bar) di chuyển trục Z**: Tính toán ánh xạ toạ độ chính xác $Z_{\text{paper}}(y) = -0.85 + (y / 1536) \times 3.4$. Thanh dầm trượt tới đúng hàng đang in (Row 0, 1, 2 hoặc trang đặc biệt) và tịnh tiến từ trên xuống dưới bám sát từng scanline đang vẽ. Khi nghỉ hoặc đẩy giấy, dầm lùi về vị trí chờ ($Z = -0.65$).
   - **Đầu in (Printhead) di chuyển trục X**: Quét ngang zigzag qua lại đúng chiều rộng của ô slot (cột 0, cột 1 hoặc toàn khổ giấy trang đặc biệt) như một cây bút vẽ đang tô hình ảnh.
   - **Đèn LED & Spotlight đầu in**: Chiếu rọi trực tiếp vào scanline đang vẽ trên bề mặt giấy với hiệu ứng ánh sáng đồng bộ.
2. **Hệ thống âm thanh sống động (Audio System)**:
   - **Web Audio API Synth**: Tự tổng hợp âm thanh chân thực không phụ thuộc tải file:
     - Tiếng máy in (SFX): Tiếng motor bước (stepper motor 110Hz + 220Hz) phối hợp với tiếng dither nhiệt (white noise filter) êm dịu, không gây ồn. Tự động bật khi in và tắt êm khi in xong.
     - Tiếng chuông vàng VIP: Hòa âm chuông ngũ cung (pentatonic chimes) vang lên khi in xong khung vàng hoặc trang đặc biệt.
     - Tiếng cuộn giấy: Hiệu ứng gió rít cuốn giấy trượt vút khỏi bàn in.
   - **Hỗ trợ nạp file âm thanh ngoài**:
     - Thư mục `client/public/sounds/`: hỗ trợ file ghi âm thật (`printer-working.mp3`, `gold-chime.mp3`, `paper-eject.mp3`).
     - Thư mục `client/public/music/`: hỗ trợ các bản nhạc lofi không bản quyền (`lofi-1.mp3`, `lofi-2.mp3`, `bgm.mp3`), tự động phát lặp và chuyển bài.
   - **Bộ điều khiển âm lượng UI**:
     - Tích hợp trên cả `/admin` và `DevControls`: Bật/Tắt BGM, Mute/Unmute, thanh trượt âm lượng BGM (0–100%), thanh trượt âm lượng máy in SFX (0–100%), và các nút thử nghiệm âm thanh nhanh.
     - Hỗ trợ tham số URL trên `/overlay`: `?bgm=1`, `?mute=1`, `?sfxVol=0.8`, `?bgmVol=0.4`.

---

### Giai đoạn 8: Cảnh Nền Linh Hoạt (Dynamic Backgrounds) & Sinh Vật Bay Tự Nhiên (Bướm, Chim, Sương Mù) - [HOÀN TẤT]
1. **Hệ Thống Đổi Cảnh Nền (BackgroundManager)**:
   - **Mẫu Núi Non Mây Mù (mountain-mist.jpg)**: Trích xuất từ ảnh người dùng, hiển thị thung lũng núi mây sớm mai hùng vĩ vô tận phía sau máy in.
   - **Thư viện Preset đa dạng**:
     - mountain-mist: Núi non mây mù bình minh (mẫu chuẩn).
     - sunset-clouds: Hoàng hôn rực rỡ lãng mạn.
     - cozy-lofi: Cửa sổ phòng Lofi nhìn ra thành phố đêm.
     - cyberpunk: Thành phố ánh đèn neon tương lai.
     - wooden-workshop: Xưởng mộc Livecade gốc ban đầu (tường gỗ, pegboard, đèn bàn).
   - **Cơ chế chuyển cảnh kép (Dual-Quad Cross-Fade)**: Hai tấm quad lồng nhau mờ dần trong 1.2s, không bị chớp đen hay giật hình.
   - **Ẩn/Hiện thông minh**: Tự động ẩn tường gỗ trong nhà khi ở chế độ ngoài trời để mở rộng tầm nhìn, bật lại khi chọn Xưởng mộc.
   - **Tự động đổi cảnh (Auto-Rotate)**: Có toggle bật/tắt và chọn khoảng thời gian xoay vòng (1, 3, 5, 10 phút).
   - **Thư mục mở rộng**: client/public/backgrounds/ sẵn sàng nhận thêm bất kỳ file ảnh nào từ người dùng.
2. **Chuyển Động Sinh Vật Tự Nhiên (Ambient Motion)**:
   - **Đàn bướm 3D dập dờn (ButterflySystem)**: 4 con bướm 3D (xanh ngọc Morpho, vàng hổ phách, ngọc lục bảo, tím hoa cà) vỗ cánh nhịp nhàng theo chu kỳ hình sin $\pm 45^\circ$, lượn lơ lửng mềm mại quanh máy in và bàn làm việc.
   - **Đàn chim bay qua bầu trời xa (BirdFlockSystem)**: Cứ sau 25-45 giây, một đàn chim 6 con hình chữ V chao liệng bay ngang qua bầu trời xa xăm, vỗ cánh uốn lượn rồi khuất dần. Có nút "Cho chim bay ngay" để thử nghiệm tức thì.
   - **Lớp sương mù/mây trôi (MistLayerSystem)**: Các dải mây bán trong suốt lững lờ trôi ngang sườn núi tạo chiều sâu thị giác (parallax depth).
3. **Đồng Bộ Realtime & Giao Diện Admin/OBS**:
   - REST API: GET/PUT /api/config/background lưu vào settings.json (bền vững qua các lần khởi động).
   - Socket.IO: Sự kiện ackground:sync phát tức thì tới mọi màn hình OBS /overlay và 3D Scene khi Admin đổi cảnh.
   - Bảng điều khiển trên cả /admin và DevControls: Gallery thumbnail, toggle Auto-Rotate, công tắc bật/tắt riêng cho Đàn bướm và Đàn chim.
