# Thư mục Cảnh Nền (Backgrounds)

Có **2 chế độ** nền, đổi qua nút **🎬 Đổi Cảnh Nền** (hoặc mục 4 trong Dev Controls):

## 🌄 1. Cảnh Sống (mặc định – khuyên dùng cho livestream dài)

- Ảnh nền tĩnh `mountain-mist.jpg` + các lớp chuyển động do Three.js tạo theo thời gian thực:
  mây trời trôi chậm, sương thung lũng, chim liệng / đàn chim bay ngang, bướm, lá rơi trong gió.
- Chạy **vô tận, không có điểm cắt**, góc nhìn và màu sắc cố định tuyệt đối.
- `mountain-mist.jpg` được tách từ `vd1.mp4`: lấy trung vị ~36 khung hình đầu để xoá chim/bướm/lá vẽ sẵn,
  rồi lấp vùng tờ giấy trắng vẽ sẵn bằng sương.
- Muốn cảnh khác: chuẩn bị ảnh **9:16 không có chim, lá, bướm, tờ giấy**
  (các thứ đó hệ thống tự vẽ), rồi bấm **📁 Tải Ảnh Lên**.

## 🎬 2. Video

- Đặt file vào thư mục này với tên `vd1.mp4`, `vd2.mp4`, `vd3.mp4` (9:16, `.mp4`).
  Video nào chưa có file sẽ tự ẩn khỏi danh sách.
- Điểm lặp được **hoà trộn chéo** (2 lớp video) nên không bị giật cảnh.
  Với `vd1.mp4` chỉ phát đoạn 0–6.2s vì sau đó đàn chim lao vào camera
  (cấu hình `loopStart / loopEnd / crossfade` trong `src/printer3d/backgroundManager.ts`).
- Khi phát video, chim/lá/bướm 3D tự tắt vì video đã có sẵn.
- Video AI tạo từng đoạn ngắn nên camera thường hơi trôi/zoom trong đoạn; nếu cần cảnh đứng yên tuyệt đối
  trong thời gian dài, hãy dùng chế độ Cảnh Sống.
