# Avatar mẫu để test

Thêm, thay hoặc xóa ảnh trực tiếp trong `client/public/avatars/`, không cần sửa code.
Hỗ trợ PNG, JPG, JPEG, WebP, SVG, GIF, AVIF, kể cả đuôi viết hoa.
Chỉ nhận file ngay trong thư mục này, không quét thư mục con.

- Backend quét khi nhận request `/api/avatars` đầu tiên và cache trong RAM; thay đổi thư mục sẽ vô hiệu cache để request tiếp theo quét lại.
- Sau khi đổi ảnh: tải lại trang. Chỉ cần khởi động lại backend nếu đang chạy phiên bản code cũ.
- Client lấy danh sách một lần trước khi dựng cảnh. Backend offline thì dùng danh sách lúc build.
- Với bản build, copy ảnh mới vào `client/dist/avatars/` hoặc build lại client để phục vụ ảnh.
- Không tải trước toàn bộ ảnh; chỉ tải khi dùng để in.
- Client kiểm tra đường dẫn bằng HEAD một lần lúc nạp để loại ảnh đã mất trong danh sách cache cũ.
- Thư mục rỗng: dùng hình đại diện mặc định có sẵn trong code.

Dùng cho nút in thử và dữ liệu mẫu. Người xem thật dùng avatar TikTok;
khi thiếu hoặc tải lỗi thì dùng biểu tượng trung tính, không dùng ảnh trong kho test.

## Bộ ảnh test phong cách ảnh chụp

Được tạo bằng công cụ imagegen tích hợp. Chân dung là nhân vật hư cấu do AI tạo,
không phải ảnh lấy từ tài khoản người thật. Ảnh `hanh.png` do người dùng cung cấp được giữ nguyên.

Bộ prompt: ảnh vuông tự nhiên, chủ thể ở giữa, đủ khoảng trống để cắt tròn;
không chữ hoặc watermark.

- `person-woman`: phụ nữ Việt Nam trưởng thành, tóc đen ngang vai, áo kem, cười nhẹ, nền quán cà phê cây xanh.
- `person-man`: nam Việt Nam trưởng thành, tóc đen ngắn, áo xanh navy, cười nhẹ, nền công viên.
- `cat-orange`: mèo mướp vàng, mắt hổ phách, ánh sáng cửa sổ, nền nhà màu be.
- `cat-white`: mèo con trắng xám lông xù, mắt xanh, nền vườn.
- `landscape-mountains`: núi đá vôi và ruộng bậc thang Việt Nam, sương sớm, bình minh.
- `landscape-coast`: vịnh biển Việt Nam, đảo đá vôi, nước xanh, hoàng hôn màu đào.

Ảnh hoạt hình cũ đã được gỡ khỏi dự án; danh sách test dùng bộ ảnh phía trên và `hanh.png`.
