# PTP Printer

Máy in avatar ảo cho TikTok LIVE. Người xem comment, follow hoặc tặng quà thì avatar được in lên tờ giấy 6 ô. Hiển thị bằng Three.js (khung 9:16), đưa vào OBS qua Browser Source.

Stack: Node 22+, TypeScript, Express 5, Socket.IO 4, React + Vite, Three.js, pnpm.

## Chạy

```bash
pnpm install            # ở thư mục gốc (workspace)
pnpm dev:server         # backend  http://localhost:3001
pnpm dev:client         # frontend http://localhost:5173
```

Trên Windows: `dev-server.bat` và `dev-client.bat`, hoặc `live.bat` (bật cả hai, tự bật lại khi server sập).

## Các trang
| Địa chỉ | Dùng để |
|---|---|
| `/admin` | Bảng điều khiển: kết nối TikTok, pause/resume/tốc độ, ngưỡng quà, giả lập sự kiện |
| `/overlay` | Link cho OBS Browser Source, 1080 x 1920, nền sạch |
| `/` | Trang thử có bảng điều khiển dev |

## Livestream
1. Bật server và client.
2. Mở `/admin`, nhập username TikTok (tài khoản phải đang LIVE) rồi bấm Kết nối. Server nhớ username và tự nối lại khi rớt mạng hoặc khi bật lại.
3. Trong OBS thêm Browser Source `http://localhost:5173/overlay`, rộng 1080, cao 1920.

Thử khi chưa live: ở `/admin` dùng các nút "Giả lập TikTok" (Chat, Follow, quà 1000, combo Rose).

## Quy tắc in
- Comment/follow: mỗi người một lần trên mỗi tờ.
- Hàng đợi miễn phí giới hạn `MAX_FREE_QUEUE` (mặc định 30): đầy thì comment/follow mới bị bỏ để avatar không in trễ hàng chục phút.
- Quà: luôn được in. Tổng kim cương (kim cương x số lượng, combo gộp thành một vé) từ 100 là khung vàng, từ 1000 in nguyên trang. Đổi ngưỡng ở `/admin`.

## Cấu hình
`server/.env` (không commit), đều tùy chọn:

```
PORT=3001
CLIENT_ORIGIN=http://localhost:5173
GOLD_DIAMONDS=100
MAX_FREE_QUEUE=30
FULL_PAGE_DIAMONDS=1000
```

Ngưỡng quà và username TikTok đổi ở `/admin` được lưu trong `server/data/settings.json`.

## Kiểm tra
```bash
pnpm test                          # test server
pnpm --filter server typecheck
pnpm --filter client build
```

## Cấu trúc
- `server/` - API, hàng đợi, máy in, adapter TikTok, Socket.IO
- `client/` - cảnh 3D, trang overlay và admin

Tiến độ và ghi chú chi tiết: `HANDOFF.md`.
