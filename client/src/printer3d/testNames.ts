export const TEST_NAMES = [
    'Minh Anh', 'Hoàng Anh', 'Bảo Ngọc', 'Linh Đan', 'Tuấn Kiệt',
    'Mai Anh', 'Quang Huy', 'Thanh Hà', 'Đức Anh', 'Ngọc Linh',
    'Gia Hân', 'Minh Khang', 'Thu Trang', 'Hải Nam', 'Khánh Linh',
    'Bảo An', 'Phương Anh', 'Thành Đạt', 'Thảo Nhi', 'Trung Hiếu',
];

let nextName = Math.floor(Math.random() * TEST_NAMES.length);

/** Luân phiên để nút giả lập nhiều người không lặp tên ngay trong một đợt. */
export function pickTestName(): string {
    const name = TEST_NAMES[nextName];
    nextName = (nextName + 1) % TEST_NAMES.length;
    return name;
}
