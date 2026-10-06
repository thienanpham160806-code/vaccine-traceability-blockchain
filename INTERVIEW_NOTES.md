# Ghi chú phỏng vấn — VaxiTrust

Tài liệu này giúp bạn giải thích dự án một cách tự tin trong buổi phỏng vấn.
Mỗi phần gồm: **ý chính nói trong 30 giây**, phần giải thích sâu hơn, và các
câu interviewer hay hỏi kèm gợi ý trả lời. Mọi con số trong đây đều đo thật
trên repo (xem README → *Quality metrics*). Chỗ nào là ước tính thì ghi rõ
là ước tính.

---

## 1. Luồng chuyển giao hai bước

**30 giây:** Một lô vắc-xin chỉ đổi chủ khi *cả hai bên* xác nhận. Bên gửi
tạo yêu cầu (`createTransferRequest`), sản phẩm chuyển sang `IN_TRANSIT`.
Bên nhận quét mã tại đúng địa điểm đã khai báo (`confirmTransfer`) thì quyền
sở hữu mới chuyển sang họ. Nếu hàng hỏng hoặc sai, bên nhận từ chối
(`rejectTransfer`) và sản phẩm quay về trạng thái cũ.

### Diễn biến cụ thể

```
Bên gửi                         Blockchain                         Bên nhận
   | createTransferRequest  -->  kiểm tra: đúng chủ? role hợp lệ?
   |                             tuyến đường được phép? chưa bị recall?
   |                             => tạo PendingTransfer, status = IN_TRANSIT
   |                                                       <-- confirmTransfer
   |                             kiểm tra: đúng người nhận? đúng địa điểm?
   |                             => owner = bên nhận, status = DELIVERED,
   |                                ghi TransferRecord vào lịch sử
   |                                         (hoặc)        <-- rejectTransfer
   |                             => xoá pending, status quay về như trước
```

### Vì sao không chuyển một bước?

Chuyển một bước nghĩa là bên gửi tự ghi "đã giao cho B" mà B không cần làm gì.
Cách đó có ba vấn đề:

1. **Không có bằng chứng đã nhận hàng.** Bên gửi có thể khai "đã giao" trong
   khi hàng thất lạc, bị đánh tráo hoặc đang nằm ở kho khác. Ở luồng hai bước,
   chữ ký của bên nhận chính là biên nhận.
2. **Có thể "đẩy" hàng cho người khác.** Một nhà phân phối có thể đẩy lô
   sắp hết hạn hoặc lô có vấn đề sang một phòng khám mà phòng khám không hề
   biết. Ở luồng hai bước, người nhận phải chủ động chấp nhận.
3. **Thời gian vận chuyển là lúc rủi ro nhất** (đứt chuỗi lạnh, mất hàng).
   Trạng thái `IN_TRANSIT` cho thấy rõ hàng đang ở giữa hai bên. Nếu lô bị
   recall trong lúc đang vận chuyển, `confirmTransfer` sẽ bị chặn (có test:
   *"blocks confirming a transfer that was in transit when the batch was recalled"*).

Đây là cùng ý tưởng với *escrow* hay *two-phase commit*: tách bước "đề nghị"
khỏi bước "chấp nhận".

### Câu hỏi có thể gặp

- **"Nếu bên nhận không bao giờ xác nhận thì sao?"**
  Thành thật: hiện tại chỉ bên nhận mới huỷ được (`rejectTransfer`). Nếu bên
  nhận mất khoá, sản phẩm sẽ kẹt ở `IN_TRANSIT`. Mình đã ghi lại điểm này
  (L-3 trong `docs/security-review.md`) và đề xuất cho bên gửi được huỷ sau
  một khoảng timeout.
- **"Sao phải khai báo địa điểm nhận từ trước?"**
  Để `confirmTransfer` so khớp `receiverLocationHash` với địa điểm đã khai.
  Quét ở chỗ khác sẽ bị từ chối ("Location mismatch"). Nhờ vậy khó xác nhận
  hộ từ xa.
- **"Tốn bao nhiêu gas?"** Khoảng 276k–313k gas cho bước tạo yêu cầu và
  266k–284k gas cho bước xác nhận (đo bằng hardhat-gas-reporter).

---

## 2. Phát hiện double-scan (quét trùng)

**30 giây:** Mỗi serial lưu lần quét gần nhất (thời điểm + địa điểm). Nếu
cùng serial đó xuất hiện ở *một địa điểm khác* trong vòng **30 phút**,
contract phát event `DoubleScanDetected`. Một lọ vắc-xin thật không thể ở hai
nơi cùng lúc, nên tín hiệu này thường có nghĩa là mã QR đã bị sao chép.

### Cách hoạt động (`TransferLedger._checkDoubleScan`)

```
lastScans[serial] = { timestamp, locationHash }   // cập nhật khi tạo và khi xác nhận chuyển giao

Báo động khi đồng thời:
  - đã từng quét (timestamp != 0)
  - lần quét mới cách lần trước < 30 phút
  - địa điểm mới != địa điểm cũ
```

Ví dụ: lọ X vừa được nhận ở kho A lúc 10:00. Lúc 10:05 có người dùng lọ X
tạo yêu cầu chuyển từ kho B, nên event được bắn ra. Có 5 test cho đúng các
trường hợp: khác địa điểm (có báo), cùng địa điểm (không báo), quá 30 phút
(không báo), lần quét đầu tiên (không báo).

### Nói thật về giới hạn (interviewer sẽ đánh giá cao)

- Event chỉ **cảnh báo**, không chặn giao dịch.
- Backend hiện **chưa lắng nghe** event này (`eventListener.ts` không
  subscribe `DoubleScanDetected`), nên cảnh báo mới dừng ở on-chain. Bước
  tiếp theo hợp lý là thêm listener để gắn cờ rủi ro trong Firebase.
- Địa điểm là hash do client gửi lên, nên kẻ gian có thể khai sai địa điểm.
  Muốn chắc hơn thì cần thiết bị quét được định danh, hoặc ký bằng khoá của
  điểm quét.
- Ngưỡng 30 phút đủ an toàn trước sai lệch `block.timestamp`: sau The Merge,
  validator chỉ lệch được vài giây.

### Câu hỏi có thể gặp

- **"Sao không chặn luôn mà chỉ cảnh báo?"** Vì có trường hợp hợp lệ, ví dụ
  nhập sai địa điểm hoặc hai kho chung một khu. Chặn cứng sẽ làm tắc chuỗi
  cung ứng. Cảnh báo để người kiểm toán (auditor) xử lý thì linh hoạt hơn.
- **"Sao chọn 30 phút?"** Đó là tham số nghiệp vụ, đặt thành hằng số
  `DOUBLE_SCAN_WINDOW` để dễ chỉnh. Giá trị phù hợp phụ thuộc thời gian di
  chuyển ngắn nhất giữa hai điểm.

---

## 3. Phân quyền theo vai trò (Role-Based Access Control)

**30 giây:** Dùng `AccessControl` của OpenZeppelin với 7 vai trò: nhà sản
xuất, nhà nhập khẩu, nhà phân phối, phòng khám, nhà thuốc, kiểm toán viên,
cơ quan thu hồi. Ngoài *ai được làm gì*, còn có **ma trận tuyến đường** quy
định *ai được chuyển cho ai*, ví dụ nhà phân phối → phòng khám được phép,
phòng khám → nhà phân phối thì không.

### Ba lớp kiểm tra khi chuyển giao

1. **Vai trò có được gửi/nhận không:** `canInitiateTransfer` (sản xuất, nhập
   khẩu, phân phối) và `canReceiveTransfer` (nhập khẩu, phân phối, phòng
   khám, nhà thuốc).
2. **Tuyến có được mở không:** `isValidRoute(fromRole, toRole)` do admin cấu
   hình, ví dụ `DISTRIBUTOR → DISTRIBUTOR` đang tắt trong MVP.
3. **Đúng chủ sở hữu:** `currentOwner == msg.sender`.

Mỗi tài khoản có một **primary role**: vai trò dùng để xét tuyến đường khi
một tài khoản giữ nhiều vai trò.

### Câu chuyện "tìm ra lỗ hổng" (rất nên kể)

Khi rà soát bảo mật, mình phát hiện ba lỗi mà **Slither không bắt được**,
vì chúng nằm ở logic phân quyền trải qua nhiều contract:

- **H-1:** `ProductRegistry` chỉ kiểm tra "người gọi là TransferLedger",
  nhưng TransferLedger lại cho *bất kỳ ai* gọi các hàm về lot. Mình viết test
  chứng minh: một ví không có vai trò gì vẫn đánh dấu được một lọ thật là
  "đã tiêm", không cần Merkle proof hợp lệ. Cách làm: tạo một sub-lot giả có
  root chính là hash của lọ đó.
- **M-1:** Thu hồi (recall) lot cha không chặn được việc tiêm các lọ nằm
  trong sub-lot.
- **M-2:** Thu hồi vai trò bằng hàm `revokeRole` gốc của OpenZeppelin không
  xoá primary role, nên tài khoản bị thu hồi vẫn chuyển hàng được.

Cả ba được sửa trong một PR riêng, kèm test. Trên code cũ, 6 test khai thác
fail; sau khi sửa thì pass. Bài học: *tool tự động chỉ là bước đầu; lỗi
phân quyền phải tự đọc luồng giữa các contract.*

### Câu hỏi có thể gặp

- **"Ai là admin? Nếu khoá admin bị lộ thì sao?"** Hiện admin là một ví
  (EOA). Nếu khoá admin bị lộ, kẻ tấn công có thể cấp quyền tuỳ ý hoặc trỏ
  `transferLedger` sang địa chỉ khác. Với hệ thống thật nên dùng multisig
  (ví dụ Safe) kèm timelock (I-3 trong báo cáo bảo mật).
- **"Sao không dùng `onlyRole` của OpenZeppelin trực tiếp trong
  ProductRegistry?"** Vì quyền được quản lý tập trung ở
  `SupplyChainAccessControl`: các contract khác chỉ gọi `hasRole` sang đó,
  thay vì mỗi contract tự giữ một bảng quyền riêng. Thêm hay bớt người chỉ
  cần làm ở một chỗ.

---

## 4. Vì sao chỉ lưu hash on-chain

**30 giây:** Blockchain công khai thì **đắt** và **ai cũng đọc được**. Vì vậy
on-chain chỉ lưu dấu vân tay (hash) của dữ liệu. Dữ liệu đọc được nằm ở
IPFS/Firebase. Khi cần kiểm tra, ta băm lại dữ liệu và so với hash trên
chuỗi: chỉ cần sửa một ký tự là hash đã khác hẳn.

### Bốn lý do

1. **Chi phí:** mỗi ô lưu trữ 32 byte mới tốn khoảng 20.000 gas (phép
   `SSTORE` từ 0 sang giá trị khác 0). Lưu cả hồ sơ lô hàng (PDF, giấy phép
   nhập khẩu) lên chuỗi sẽ tốn hàng triệu gas. Hash luôn chỉ 32 byte.
2. **Riêng tư và bí mật kinh doanh:** dữ liệu on-chain công khai vĩnh viễn.
   Giá nhập, đối tác hay địa chỉ kho không nên để ai cũng đọc được.
3. **Toàn vẹn:** hash đủ để chứng minh dữ liệu chưa bị sửa (tamper-evident)
   mà không cần lộ nội dung.
4. **Sửa sai được:** nếu thông tin off-chain nhập nhầm, có thể sửa ở off-chain
   và ghi một bản ghi mới, thay vì "khắc chết" một dữ liệu sai lên chuỗi.

### Điểm tinh tế: hash không phải lúc nào cũng che giấu được

Serial có dạng dễ đoán (`VCN-2026-000001`, `…000002`, …). Nếu chỉ lưu
`keccak256(serial)`, ai cũng có thể băm thử lần lượt các serial rồi dò ngược
ra. Codebase xử lý bằng **salt**: `hashWithSalt(value, salt)` với một salt
riêng cho mỗi lot (`lotSalt`) và một salt hệ thống cho địa điểm và tác nhân
(xem `backend/src/utils/crypto.ts`).

### Câu hỏi có thể gặp

- **"Nếu Firebase bị sửa thì sao?"** Dữ liệu bị sửa sẽ không khớp với hash
  on-chain nữa, nên việc sửa bị *phát hiện* (dù không *ngăn* được). Firebase
  đóng vai trò chỉ mục và giao diện; nguồn sự thật để đối chiếu là chuỗi.
- **"Nếu IPFS mất file thì sao?"** IPFS chỉ giữ file khi còn node pin. Dự án
  pin qua Pinata, nên vẫn phụ thuộc vào dịch vụ đó. Hash on-chain vẫn còn,
  nhưng mất bản gốc thì không còn gì để đối chiếu, nên cần pin ở nhiều nơi.
- **"Merkle root dùng để làm gì?"** `commissionLot` đăng ký **cả một lot
  bằng một Merkle root**, khoảng 149k gas bất kể lot có bao nhiêu lọ. Đăng
  ký từng serial bằng `registerProduct` tốn khoảng 235k gas *mỗi lọ*. Khi
  tiêm, chỉ cần một Merkle proof (log₂n hash) là chứng minh được lọ đó thuộc
  lot.

---

## 5. Gas là gì và tối ưu ra sao

**30 giây:** Gas là đơn vị đo *công tính toán* mà một giao dịch tiêu tốn trên
Ethereum. Phí phải trả = gas dùng × giá gas. Thao tác đắt nhất thường là ghi
lưu trữ (storage), nên tối ưu chủ yếu là *ghi ít ô hơn* và *không lặp theo
dữ liệu lớn*.

### Số liệu đo thật (Hardhat network, solc 0.8.28, viaIR)

| Hàm | Gas (trung bình) |
|---|---|
| `registerProduct` | 249.525 |
| `createTransferRequest` | 298.621 |
| `confirmTransfer` | 280.394 |
| `rejectTransfer` | 70.325 |
| `recallBatch` | 79.846 (không đổi theo kích thước batch) |
| `commissionLot` (cả lot) | 149.377 |

### Những tối ưu đã có trong thiết kế

1. **Recall O(1):** `recallBatch` không lặp qua từng serial mà chỉ bật một cờ
   `recalledBatches[batchHash] = true`. Khi đọc trạng thái, contract kiểm tra
   cờ này. Đo thật: batch 1 lọ và batch 500 lọ đều khoảng 79.8k gas. Nếu lặp
   qua từng lọ, chi phí sẽ tăng tuyến tính và batch đủ lớn sẽ vượt giới hạn
   gas của một block, tức là *không thể recall được*. Với vắc-xin, đó là lỗi
   nghiêm trọng.
2. **Merkle root cho lot** (xem phần 4): đăng ký N lọ chỉ cần một giao dịch.
3. **Lưu hash thay vì dữ liệu** (xem phần 4).
4. **Phần O(n) duy nhất nằm ở hàm đọc** `getBatchSerials` (khoảng 2.275
   gas/serial). Hàm đọc không tốn phí giao dịch và không contract nào gọi nó
   on-chain, nên không chặn được recall.

### Những tối ưu còn có thể làm

- **`immutable` cho địa chỉ contract** (Slither gợi ý). Đã đo thử trên bản
  build tạm: tiết kiệm khoảng 2.1k gas mỗi lời gọi (`createTransferRequest`
  giảm 4.320). Chưa áp dụng vì phải redeploy, nên gộp vào đợt redeploy cho
  bản sửa bảo mật.
- **Gói struct (struct packing)** — *ước tính, chưa đo*: `Product.exists`
  (bool) đang chiếm riêng một ô, có thể gói chung với `currentOwner` và các
  `uint8`. Mỗi ô mới bớt được tiết kiệm khoảng 20k gas lúc đăng ký.
- **Lịch sử chuyển giao bằng event thay vì storage** — đây là một
  *trade-off*: `TransferRecord` hiện ghi vào storage (đọc được trực tiếp từ
  contract). Nếu chỉ phát event, mỗi lần xác nhận sẽ rẻ hơn nhiều, nhưng
  contract khác không đọc được lịch sử và phải dựng lại lịch sử từ log
  off-chain.

### Câu hỏi có thể gặp

- **"Gas limit và gas price khác nhau thế nào?"** Gas limit là số gas *tối
  đa* bạn cho phép giao dịch dùng; hết gas thì giao dịch revert và phần gas
  đã tiêu không được hoàn lại. Gas price (sau EIP-1559 là base fee cộng tip)
  là số tiền trả cho *mỗi* đơn vị gas.
- **"Sao lần chuyển đầu tiên đắt hơn lần sau?"** Lần đầu phải ghi vào các ô
  storage còn trống (`lastScans`), từ 0 sang khác 0 (khoảng 20k gas mỗi ô).
  Các lần sau chỉ ghi đè lên ô đã có giá trị nên rẻ hơn. Đo thật: 313k so
  với 277k.
- **"Sao đặt optimizer `runs: 1`?"** `runs` thấp ưu tiên bytecode nhỏ (deploy
  rẻ, tránh giới hạn 24KB) đổi lấy chi phí mỗi lần gọi cao hơn một chút.
  ProductRegistry khá lớn (deploy khoảng 2,9 triệu gas) nên đây là lựa chọn
  hợp lý. Nếu lượng giao dịch lớn thì nên đo lại với `runs` cao hơn.

---

## 6. Chất lượng kỹ thuật: câu trả lời cho "làm sao bạn biết nó đúng?"

- **146 test Hardhat**, coverage 100% statement/function/line và 98.70%
  branch. 5 nhánh còn lại là các kiểm tra phòng thủ không thể chạm tới; README
  giải thích từng nhánh.
- **Slither** đã chạy: 37 kết quả, phân loại từng cái (false positive kèm
  lý do, hoặc tối ưu đã đo).
- **CI GitHub Actions**: compile, test và coverage cho contract; build và
  test cho backend; build cho frontend, chạy trên mỗi push và PR.
- **Không bịa số:** mọi con số đều có lệnh để chạy lại (`npm run coverage`,
  `npm run test:gas`, `npm run gas:benchmark`).

---

## 7. Danh sách câu hỏi luyện tập nhanh

1. Kể về dự án trong 1 phút. *(Bài toán vắc-xin giả và recall chậm → giải
   pháp chuyển giao hai bước + recall O(1) + xác minh bằng QR → kết quả: Top
   10 Bảng Ươm mầm cuộc thi ATTACKER 2026, 146 test, phát hiện và sửa 3 lỗi phân quyền.)*
2. Vì sao dùng blockchain mà không dùng database thường? *(Nhiều bên không
   tin nhau, không ai muốn một bên giữ database và sửa được lịch sử; cần nhật
   ký không thể sửa lén mà các bên cùng kiểm tra được.)*
3. Điểm yếu lớn nhất của hệ thống hiện tại là gì? *(ZKP đang là mock; admin
   là một ví đơn; dữ liệu đầu vào như địa điểm vẫn do con người khai, tức bài
   toán "garbage in, garbage out" mà blockchain không tự giải được.)*
4. Nếu triển khai cho cả nước thì đổi gì? *(Lên L2 hoặc chain riêng để giảm
   phí; multisig cho admin; thiết bị quét có định danh; chạy circuit Groth16
   thật thay cho mock; thêm timeout cho pending transfer.)*
5. Reentrancy là gì, contract của bạn có bị không? *(Slither cảnh báo 3 chỗ,
   nhưng contract được gọi là ProductRegistry của chính dự án, không có
   callback và không chuyển ETH, nên là false positive. Vẫn có thể đổi thứ tự
   theo checks-effects-interactions để an toàn hơn.)*
6. Vì sao giao dịch invalid route lại revert thay vì gắn cờ? *(Code có gọi
   gắn cờ rồi mới revert, nên revert xoá luôn cờ. Mình phát hiện ra, viết
   test ghi nhận hành vi này (L-2), và để nhóm quyết định có đổi logic hay
   không.)*
7. Vai trò của bạn trong nhóm là gì? *(Tự điền, khớp với mục "Team & roles"
   trong README.)*
