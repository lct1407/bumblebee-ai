# Hướng dẫn bắt đầu với Bumblebee — từng bước

Hướng dẫn này đưa bạn từ landing page đến chạy workflow đầu tiên trong khoảng **5 phút**. Mỗi bước có ảnh chụp màn hình thật từ phiên kiểm thử E2E.

> **Self-host hay Cloud?** Hướng dẫn giả định bạn dùng Bumblebee Cloud (hoặc self-host chạy ở `localhost:3000`). Để cài đặt, xem `docs/getting-started.md`.

> **Bản tiếng Anh**: [getting-started-guide.md](./getting-started-guide.md)

## Cần chuẩn bị

- Trình duyệt hiện đại (Chrome / Firefox / Safari / Edge)
- Một địa chỉ email (hoặc tài khoản Google để đăng nhập 1-click)
- 5 phút

---

## 1. Landing page

Mở Bumblebee trên trình duyệt. Bạn sẽ thấy trang marketing.

![Landing page](./guide-screenshots/01-landing-page.png)

Bấm **Pricing** ở header để chọn gói, hoặc **Sign up** thẳng nếu đã biết muốn dùng gói Free.

---

## 2. Chọn gói (trang pricing)

Ba gói:

| Gói | Phù hợp cho | Ngân sách LLM |
|---|---|---|
| **Free** | Dùng thử, cá nhân thử nghiệm | $1/tháng (giới hạn cứng) |
| **Pro** ($20/tháng/seat) | Khối lượng thật, tích hợp MCP + Claude Code | $20/tháng/seat |
| **Team** ($100/tháng + passthrough) | Đội nhóm, cần audit/SOC2 | Không giới hạn (tính theo dùng thực) |

![Pricing page](./guide-screenshots/02-pricing-page.png)

Bấm **Start free** (hoặc **Upgrade to Pro / Talk to us**). Với gói trả phí bạn sẽ được dẫn đến Stripe Checkout sau khi onboarding xong — gói Free đi thẳng vào app.

---

## 3. Tạo tài khoản

Form đăng ký cần 3 thông tin:

- **Username** (≥3 ký tự, chữ và số)
- **Email**
- **Password** (≥8 ký tự)

![Đăng ký — form trống](./guide-screenshots/03-register-empty.png)

Hoặc bấm **Continue with Google** để đăng ký bằng 1 click (operator phải đã cấu hình `GOOGLE_CLIENT_ID` — xem `docs/security/google-oauth-setup.md`).

Điền form:

![Đăng ký — đã điền](./guide-screenshots/04-register-filled.png)

Bấm **Create account**. Bạn được chuyển vào onboarding.

---

## 4. Onboarding wizard (4 bước · ~60 giây)

### 4.1 — Tạo workspace

Workspace là container cấp cao nhất của bạn — chứa projects, issues, thành viên team và billing. Thường chỉ cần 1 cái.

![Onboard bước 1 — tên workspace](./guide-screenshots/05-onboard-step1-workspace.png)

Đặt tên hiển thị (có thể đổi sau). Slug được tự sinh.

### 4.2 — Mời team

Gõ email từng người, nhấn Enter để thêm vào danh sách. Họ sẽ nhận email mời với link tham gia (bỏ qua nếu làm 1 mình).

![Onboard bước 2 — mời](./guide-screenshots/06-onboard-step2-invites.png)

**Mẹo:** Có thể chia sẻ link mời trực tiếp từ `Settings → Members` sau này.

### 4.3 — Tạo issue đầu tiên từ template

Năm template: Fix bug · Add feature · Refactor · Investigate · Blank. Mỗi cái sẵn description với các section đúng chuẩn.

![Onboard bước 3 — chọn template](./guide-screenshots/07-onboard-step3-templates.png)

Chọn **Add: feature** để theo hướng dẫn này:

![Onboard bước 3 — đã chọn feature](./guide-screenshots/08-onboard-step3-feature-picked.png)

Tùy chỉnh title, rồi bấm **Create issue**.

### 4.4 — Xác nhận

![Onboard bước 4 — hoàn tất](./guide-screenshots/09-onboard-step4-complete.png)

Xong rồi. Với gói trả phí, nút tiếp theo đưa bạn đến Stripe Checkout; với Free đưa vào dashboard.

---

## 5. Dashboard

Trang chủ của bạn — workflow throughput, chi phí LLM, phân bố status, hoạt động gần đây, projects, issues vừa cập nhật.

![Dashboard](./guide-screenshots/10-dashboard.png)

Sidebar có:

- **Workspace switcher** (trên cùng) — đổi workspace
- **Project switcher** — đổi project trong workspace
- **Search (⌘K)** — command palette (xem bước 10)
- **Workspace nav**: Dashboard · Inbox
- **Project nav**: All issues · Active · Closed · Failed (kèm badge số)
- **System nav**: Plugins
- **Theme toggle** (chân sidebar)

---

## 6. Danh sách Issues

Bấm **All issues** (hoặc **Issues** ở nav).

![Danh sách issues](./guide-screenshots/11-issues-list.png)

Tính năng:

- **3 view**: List · Board · Stats — chuyển bằng segmented control trên toolbar
- **Filter**: Status / Priority / Type — combobox đa-chọn
- **Tìm** theo title
- **Ẩn/hiện cột**: bấm "9 selected" để ẩn/hiện cột
- **Bấm 1 row** mở sheet edit nhanh, hoặc bấm title để mở trang chi tiết đầy đủ

---

## 7. Chi tiết issue

Bấm bất kỳ row nào để mở **detail sheet** trượt vào:

![Issue detail sheet](./guide-screenshots/12-issue-detail-sheet.png)

Để xem trang đầy đủ (kèm Activity + Runs tabs), bấm "Open full detail page →" hoặc đi thẳng URL:

![Trang chi tiết issue](./guide-screenshots/13-issue-detail-page.png)

Ba tabs:

- **Overview** — description, acceptance criteria (checklist tương tác), bug diagnostics (cho bug type), AI summary, scope hints
- **Activity** — timeline mọi event (status changes, LLM calls với cost, tool uses, decisions). Nhóm theo ngày.
- **Runs** — workflow runs tổng hợp từ events với status, số LLM calls, tổng cost, duration

Sidebar phải hiển thị metadata live (status / priority / type / workflow stats / scope hints).

### 7.1 — Trigger workflow

Bấm **Trigger workflow** (góc phải trên trang chi tiết) để chạy `simple-fix-flow` mặc định. Chuyển sang tab **Activity** để xem events stream về realtime:

![Tab Activity](./guide-screenshots/14-issue-activity-tab.png)

Panel live ở đầu tab Activity hiển thị streaming từng token từ Claude CLI (khi `BUMBLEBEE_PROVIDER=claude-cli`).

---

## 8. Workspace settings · Members

Vào `Settings → Members` (chân sidebar hoặc qua workspace switcher).

![Trang Members](./guide-screenshots/15-settings-members.png)

Roles: **owner** · **admin** · **member** · **viewer**. Admin+ có thể mời, đổi role, xóa (owner miễn trừ). Khi mời, bạn nhận được URL chia sẻ làm fallback nếu email không gửi tới.

---

## 9. Billing

`Settings → Billing` hiển thị plan + đồng hồ usage live + lịch sử invoice.

![Trang Billing](./guide-screenshots/16-settings-billing.png)

Ở gói Free bạn thấy các card upgrade. Sau khi upgrade Pro:

- Stripe Checkout (hosted) mở để nhập thẻ
- Khi thành công, webhook update `workspace.plan` thành `pro`
- Quota cap nâng từ $1 lên $20/seat/tháng
- Đồng hồ usage đổi màu xanh → cam → đỏ ở 70 / 90% cap

Cancel-at-period-end dành cho owner; bạn vẫn được dùng đến hết chu kỳ hiện tại, rồi rớt về Free.

---

## 10. Người dùng nâng cao: Command palette

Nhấn `Cmd+K` (Mac) hoặc `Ctrl+K` (Win/Linux) ở bất kỳ đâu trong app.

![Command palette](./guide-screenshots/17-command-palette.png)

Điều hướng · nhảy đến issue · chuyển project · trigger action. Fuzzy-search trên toàn catalog.

Phím tắt:
- `↑ ↓` di chuyển · `↵` chọn · `Esc` đóng
- `G D` (trong palette) → Dashboard · `G I` → Issues · v.v.

---

## 11. Đăng nhập lại

Đăng xuất, rồi đăng nhập lại qua `/login`:

![Trang Login](./guide-screenshots/18-login-page.png)

Username + password HOẶC Google. Token lưu trong `localStorage` đến khi bạn bấm đăng xuất.

---

## Tiếp theo nên đọc gì?

- **Tích hợp MCP** → `docs/mcp-integration.md` — nối Bumblebee vào Claude Code / Desktop / Cursor
- **Kiến trúc streaming** → `docs/streaming-architecture.md` — agent output live đi từ CLI tới UI như thế nào
- **Design system** → `docs/design-system.md` — tokens, components, quy tắc theme
- **Chính sách bảo mật** → `docs/security/security-policy.md` — cái gì được mã hóa, cái gì được log
- **Khôi phục thảm họa** → `docs/disaster-recovery.md` — quy trình backup + restore
- **Kiến trúc tổng quan** → `docs/architecture-overview.md` — giải thích Bumblebee theo khái niệm AI agent framework chuẩn
- **Cấu trúc source** → `docs/source-layout.md` — cây thư mục + cheat sheet "muốn làm X → mở file nào"

## Xử lý sự cố

| Triệu chứng | Cách khắc phục |
|---|---|
| Đăng ký trả về 409 | Username đã tồn tại — thử username khác |
| Google sign-in báo "google_oauth_not_configured" | Operator: set `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` trong `.env`, restart API |
| Workflow trigger trả về 402 | Hết ngân sách gói — upgrade hoặc đợi reset hàng tháng |
| Workspace switcher trống | Tài khoản mới — refresh hoặc quay lại `/onboard` |
| Tab Activity không có event nào | Workflow chưa được trigger — bấm "Trigger workflow" |
| Đăng nhập thành công nhưng bị redirect lại /login | `API_SECRET_KEY` đã đổi → mọi session bị invalidate; xóa cookies + đăng nhập lại |

## Thuật ngữ nhanh

| Tiếng Anh | Tiếng Việt | Giải thích |
|---|---|---|
| Workspace | Workspace | Ranh giới khách hàng cấp cao nhất. Tài khoản của bạn. Chứa projects, members, billing. |
| Project | Project | Một repo/codebase trong workspace. Có numbering riêng cho issues, agents, workflows. |
| Issue | Issue / Vấn đề | Đơn vị công việc. Đánh số trong project (BB-1, BB-2, …). |
| Workflow | Workflow / Quy trình | YAML LangGraph định nghĩa agent nào chạy theo thứ tự nào (ví dụ `simple-fix-flow`). |
| Agent | Agent | Vai trò AI (Triager, Implementer, Reviewer, …) — mỗi vai trò có prompt YAML riêng. |
| Trigger workflow | Trigger workflow | Khởi động workflow — agents bắt đầu xử lý issue. |
| Scope hint | Scope hint | Glob pattern (vd `bumblebee/auth/**`) chỉ cho agent biết tập trung sửa file nào. |
| MCP | MCP | Model Context Protocol — chuẩn Anthropic để expose tools cho LLM ngoài (Claude Code, Cursor). |
| Quota | Hạn mức | Giới hạn chi phí LLM của workspace. Vượt → workflow bị tạm dừng đến khi reset hoặc upgrade. |
