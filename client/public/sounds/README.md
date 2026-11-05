# Thư mục Âm thanh Hiệu ứng (SFX)

Dự án đã tích hợp sẵn bộ phát âm thanh tổng hợp tự động qua **Web Audio API** (tự phát tiếng nét bút / cọ ma sát sột soạt trên bề mặt giấy ASMR, tiếng chuông vàng VIP và tiếng cuộn giấy mà không cần nạp file ngoài).

Nếu bạn muốn dùng file âm thanh thực tế của riêng mình (file thu âm tiếng bút vẽ, tiếng cọ cọ giấy), hãy đặt các file `.mp3` hoặc `.wav` vào thư mục này với các tên sau:

1. **`paper-friction.mp3`** (hoặc **`printer-working.mp3`**): Tiếng bút chì / cọ vẽ ma sát trên bề mặt giấy (sẽ được phát lặp khi đầu bút đang vẽ/quét và ngắt khi vẽ xong).
2. **`gold-chime.mp3`**: Tiếng chuông gió / ting lấp lánh khi in xong khung vàng VIP.
3. **`paper-eject.mp3`**: Tiếng cuộn giấy / trượt giấy khi đẩy tờ cũ ra ngoài.

*Hệ thống sẽ tự động ưu tiên phát file mp3 của bạn nếu tìm thấy file trong thư mục này.*

