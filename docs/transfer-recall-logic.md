# VaxiTrust transfer and recall logic

## 1. Nguồn sự thật

Smart contract là nguồn quyết định cuối cùng cho các thao tác on-chain:

- `ProductRegistry.currentOwner(serial)` quyết định ai được tạo lệnh chuyển.
- `TransferLedger.pendingTransfers(serial).receiver` quyết định ai được xác nhận hoặc từ chối.
- `ProductRegistry.status(serial)` quyết định sản phẩm có được chuyển hoặc thu hồi tiếp hay không.

Firebase chỉ là lớp lưu dữ liệu để UI hiển thị nhanh hơn. Nếu Firebase và contract lệch nhau, contract luôn thắng.

## 2. Tạo lệnh chuyển giao

Điều kiện on-chain trong `TransferLedger.createTransferRequest`:

1. Serial phải tồn tại trong `ProductRegistry`.
2. Serial chưa có pending transfer.
3. Người ký giao dịch phải là `currentOwner` on-chain.
4. Trạng thái sản phẩm không được là `IN_TRANSIT`, `FLAGGED`, `RECALLED`.
5. Role người gửi và người nhận phải được AccessControl cấp quyền.
6. Route role phải hợp lệ, ví dụ:
   - `MANUFACTURER -> IMPORTER`
   - `MANUFACTURER -> DISTRIBUTOR`
   - `IMPORTER -> DISTRIBUTOR`
   - `DISTRIBUTOR -> DISTRIBUTOR | CLINIC | PHARMACY`

Backend hiện kiểm tra sớm các điều kiện quan trọng trước khi gửi transaction:

- Có pending on-chain không.
- Signer của role gửi có đúng là owner on-chain không.
- Status on-chain có phải `VERIFIED` hoặc `DELIVERED` không.

Nếu một role thấy có lô trong UI nhưng tạo lệnh fail, hãy kiểm tra `currentOwner` on-chain, không chỉ nhìn `currentOwner` trong Firebase.

## 3. Xác nhận hoặc từ chối lệnh

Điều kiện on-chain trong `TransferLedger.confirmTransfer` và `rejectTransfer`:

1. Serial phải có pending transfer.
2. Người ký giao dịch phải đúng bằng `pending.receiver`.
3. Confirm yêu cầu sản phẩm đang `IN_TRANSIT`.
4. Confirm yêu cầu `receiverLocationHash` khớp pending transfer.
5. Reject yêu cầu `reason` không rỗng.

Điểm dễ nhầm:

- App role `DISTRIBUTOR` không đủ để ký reject.
- Ví MetaMask đang chọn phải đúng địa chỉ `pending.receiver`.
- Nếu lệnh được tạo cho ví demo distributor, ví MetaMask distributor khác sẽ không reject được bằng MetaMask.

Logic frontend hiện tại:

- Nếu đăng nhập MetaMask và ví hiện tại đúng `transfer.toAddress`, UI sẽ gọi contract bằng MetaMask rồi sync backend.
- Nếu đăng nhập MetaMask nhưng `transfer.toAddress` là ví demo hoặc ví khác, UI sẽ gọi backend để backend ký bằng private key đúng receiver nếu backend có key đó.
- Nếu backend không có private key của receiver, thao tác phải được thực hiện bằng đúng ví receiver trên MetaMask.

## 4. Vì sao từng bị lỗi `missing revert data`

Lỗi này thường xuất hiện khi RPC không trả revert reason rõ ràng. Với transfer, nguyên nhân thực tế thường là:

- Ví đang ký không phải `pending.receiver`.
- Serial không còn pending transfer on-chain.
- Product không còn `IN_TRANSIT` khi confirm/reject.
- Lệnh Firebase còn tồn tại nhưng pending on-chain đã bị confirm/reject trước đó.
- Frontend dùng role đúng nhưng địa chỉ ví khác receiver on-chain.

Backend đã được chỉnh để trả lỗi rõ hơn trước khi gửi transaction ở các nhánh có thể kiểm tra được.

## 5. Recall lô

Điều kiện on-chain trong `ProductRegistry.recallBatch`:

1. Người ký phải có `RECALL_AUTHORITY`.
2. `batchHash` không rỗng.
3. `reasonHash` không rỗng.
4. Batch chưa từng bị recall.
5. Batch phải có serial trong `ProductRegistry`.

Logic frontend/backend:

- Nếu dùng demo/backend signer, backend gọi `recallBatch`.
- Nếu dùng MetaMask, ví recall authority gọi `recallBatch`, backend chỉ kiểm tra transaction emit `BatchRecalled` rồi sync Firebase.

Nếu recall fail, kiểm tra:

- Ví hoặc backend private key có thật sự được cấp `RECALL_AUTHORITY` trên AccessControl không.
- Batch hash nhập vào có đúng hash đã đăng ký on-chain không.
- Batch đó có serial on-chain không.
- Batch đã bị recall trước đó chưa.

## 6. Checklist debug nhanh

Khi chuyển giao không được:

1. Mở product detail, xem `currentOwner`.
2. Mở transfer detail, xem `fromAddress`, `toAddress`, `status`.
3. Nếu đang dùng MetaMask, kiểm tra ví đang chọn có trùng `fromAddress` khi tạo lệnh hoặc `toAddress` khi confirm/reject không.
4. Nếu không trùng, dùng đúng ví receiver hoặc để backend ký nếu đó là ví demo đã cấu hình private key.

Khi từ chối không được:

1. Transfer phải đang `PENDING`.
2. Product phải đang `IN_TRANSIT` on-chain.
3. Người ký phải là `transfer.toAddress`.
4. Lý do từ chối không được rỗng.

Khi recall không được:

1. Role phải là `RECALL_AUTHORITY` hoặc `ADMIN`.
2. Signer on-chain phải có quyền recall authority.
3. Batch hash phải đúng batch on-chain, không chỉ batch id hiển thị trong Firebase.
