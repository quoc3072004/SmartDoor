CHẠY SERVER SMART DOOR + INSIGHTFACE

1) Cài thư viện:
python -m pip install -r requirements.txt

Nếu Windows lỗi khi cài insightface, chạy thêm:
python -m pip install --upgrade pip setuptools wheel
python -m pip install insightface onnxruntime

2) Chạy server:
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

3) Test Swagger:
http://localhost:8000/docs

Thứ tự test:
POST /init
POST /login với username admin, password 123456
Bấm Authorize, nhập: Bearer <token>
POST /face/register: upload ảnh mặt mẫu
POST /face/open-door: upload ảnh mặt cần xác thực
POST /qr/generate
POST /qr/verify
GET /door/status
GET /history

Lưu ý:
- Lần đầu chạy InsightFace có thể tải model buffalo_l nên hơi lâu.
- App điện thoại phải dùng IP LAN của máy tính, không dùng localhost.
Ví dụ API_BASE_URL = http://192.168.1.10:8000
