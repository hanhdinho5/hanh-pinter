# PTP Printer

Máy in avatar ảo cho TikTok LIVE (Express + Socket.IO + React/Vite, Three.js ở phase sau).

## Yêu cầu
- Node.js 22+
- pnpm

## Chạy

```bash
# Backend (http://localhost:3001)
cd server
pnpm install
pnpm dev

# Frontend (http://localhost:5173) - terminal khác
cd client
pnpm install
pnpm dev
```

## Cấu hình
Tạo `server/.env` (không commit):

```
PORT=3001
```

## Cấu trúc
- `server/` - API, queue, printer engine, Socket.IO
- `client/` - giao diện / overlay OBS

## Trạng thái
Mới có khung dự án. Backend Core (Phase 1) đang được xây.
