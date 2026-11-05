# Thư mục Âm thanh Máy in (SFX)

Dự án đã tích hợp sẵn bộ phát âm thanh tổng hợp tự động qua **Web Audio API** (tự phát tiếng motor bước êm dịu, tiếng in nhiệt và tiếng chuông vàng mà không cần file ngoài).

Nếu bạn muốn dùng file âm thanh thực tế của riêng mình, hãy đặt các file `.mp3` hoặc `.wav` vào thư mục này với đúng tên sau:

1. **`printer-working.mp3`**: Tiếng máy in đang chạy quét qua lại (sẽ được phát lặp khi in và ngắt khi in xong).
2. **`gold-chime.mp3`**: Tiếng chuông gió / ting lấp lánh khi in xong khung vàng VIP.
3. **`paper-eject.mp3`**: Tiếng cuộn giấy / trượt giấy khi đẩy tờ cũ ra ngoài.

*Hệ thống sẽ tự động ưu tiên phát file của bạn nếu tìm thấy file trong thư mục này.*

