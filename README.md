# 📚 Web Học Bản Chất & Ôn Tập Trắc Nghiệm Quản Trị Nguồn Nhân Lực (HRM)

Ứng dụng web học tập tương tác giúp sinh viên và người đi làm **hiểu sâu bản chất môn học Quản trị Nguồn Nhân Lực (HRM)** kết hợp hệ thống ôn luyện **491 câu hỏi trắc nghiệm** chia đều qua **8 chương**, chuẩn giáo trình **Đại học Ngân hàng TP.HCM (HUB) - PGS.TS. Trần Kim Dung**.

---

## 🌟 Tính Năng Nổi Bật

1. **Hiểu Bản Chất Trước – Luyện Trắc Nghiệm Sau:**
   - **35 chuyên đề lý thuyết chuyên sâu:** Tóm tắt bản chất cốt lõi, bảng so sánh trực quan các khái niệm dễ gây nhầm lẫn (Thuyết X vs. Y vs. Z, Job Description vs. Job Specification, Đào tạo vs. Phát triển, 5 phương pháp đánh giá hiệu suất, Compa-ratio, Công thái học...).
   - **Nút luyện tập tức thì:** Đọc xong chủ đề nào, bấm làm ngay các câu trắc nghiệm thuộc chủ đề đó.

2. **Luyện Tập 491 Câu Trắc Nghiệm (Có Giải Thích Chi Tiết):**
   - Đáp án chấm điểm ngay lập tức.
   - Mỗi câu đều có hộp **💡 Giải thích bản chất** liên kết chặt chẽ với giáo trình.
   - Nút **📖 Đối chiếu lý thuyết** mở nhanh kiến thức liên quan mà không mất dấu câu đang làm.
   - 2 chế độ hiển thị: **Danh sách** (lướt nhanh) và **Từng câu** (tập trung, hỗ trợ phím tắt `1/2/3/4` hoặc `A/B/C/D`, mũi tên `← / →`).

3. **Sổ Tay Ôn Lỗi Sai & Đánh Dấu (Smart Mistakes Notebook):**
   - Tự động lưu tất cả câu trả lời sai vào mục **⚠️ Câu làm sai cần ôn lại**.
   - Làm lại đúng sẽ tự động được gỡ khỏi danh sách câu sai.
   - Tính năng đánh dấu sao (★) để lưu các câu quan trọng cần xem lại.

4. **Mô Phỏng Thi Thử Cuối Kỳ (Exam Simulator):**
   - Rút ngẫu nhiên 20, 40, 60 hoặc 80 câu từ các chương tự chọn.
   - Có đồng hồ đếm ngược, chấm điểm thang 10 và biểu đồ phân tích mức độ hiểu bài theo từng chương.

5. **Tra Cứu Nhanh (Instant Search):**
   - Tìm kiếm từ khóa theo thời gian thực (ví dụ: `VIRO`, `Delphi`, `BARS`, `MBO`, `Compa-ratio`...) trên cả nội dung lý thuyết và ngân hàng câu hỏi.

6. **Hoàn Toàn Offline & Lưu Trữ Cục Bộ:**
   - Dùng thuần HTML/CSS/JavaScript (Vanilla), không cần cài đặt Node.js hay cơ sở dữ liệu.
   - Tiến độ học và lịch sử làm bài được lưu tự động trên `localStorage` của trình duyệt.

---

## 🚀 Cấu Trúc Dự Án

```
hrm-study-web/
├── index.html          # Giao diện chính ứng dụng
├── styles.css          # Giao diện responsive, hiện đại (tối ưu Desktop & Mobile)
├── app.js              # Xử lý logic học tập, lọc, chấm điểm, thi thử, modal
├── data.js             # Dữ liệu 8 chương, 35 chủ đề lý thuyết & 491 câu hỏi có giải thích
├── package.json        # Thông tin dự án
├── vercel.json         # Cấu hình tối ưu deploy Vercel
└── README.md           # Tài liệu hướng dẫn
```

---

## 🌐 Hướng Dẫn Deploy Lên Vercel (Trong 1 Phút)

### Cách 1: Deploy qua GitHub (Khuyên dùng)
1. Đẩy mã nguồn này lên một kho lưu trữ (Repository) trên GitHub:
   ```bash
   git init
   git add .
   git commit -m "feat: initial commit HRM study web app"
   git branch -M main
   git remote add origin https://github.com/<tai-khoan-cua-ban>/<ten-repo>.git
   git push -u origin main
   ```
2. Truy cập [vercel.com](https://vercel.com) và đăng nhập bằng tài khoản GitHub.
3. Chọn **Add New...** → **Project** → Chọn repository vừa tạo.
4. Ở mục **Framework Preset**, chọn **Other** (hoặc để mặc định).
5. Nhấn **Deploy**. Chỉ mất 10-20 giây là trang web sẽ chạy online với tên miền miễn phí dạng `https://<ten-du-an>.vercel.app`!

### Cách 2: Deploy trực tiếp bằng Vercel CLI
Nếu máy có cài đặt Node.js / npm:
```bash
npm i -g vercel
vercel
```

---

## 💻 Chạy Trực Tiếp Offline Trên Máy
Không cần mạng internet hay cài đặt bất cứ phần mềm gì:
- Nhấp đúp chuột vào file `index.html` (hoặc file `Mo_Web_Hoc_Bai.bat`).
- Trang web sẽ tự động mở trên trình duyệt (Chrome, Edge, Cốc Cốc, Brave,...).

---

## 📖 Tài Liệu Tham Khảo Học Thuật
- **Giáo trình Quản trị nguồn nhân lực** – PGS.TS. Trần Kim Dung (Giáo trình chuẩn Trường Đại học Ngân hàng TP.HCM - HUB).
- **Human Resource Management** – Gary Dessler.
- **Human Resource Management: Functions, Applications, and Skill Development** – Robert N. Lussier & John R. Hendon.
