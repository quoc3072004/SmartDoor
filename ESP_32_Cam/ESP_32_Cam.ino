#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <ESP32QRCodeReader.h>
#include "esp_camera.h"

// ======================================================
// CẤU HÌNH 
// ======================================================

const char* WIFI_SSID = "7neem";
const char* WIFI_PASS = "matkhaugi";

// ======================================================
// SERVER
// ======================================================

// Không thêm dấu "/" ở cuối.
const char* SERVER_BASE_URL =
  "https://rational-roberts-mechanics-feet.trycloudflare.com";

// Phải giống ESP32_CAM_KEY trong file .env của server.
const char* ESP32_CAM_KEY =
  "SMARTDOOR_CAM_SECRET_2026";

const char* DEVICE_ID =
  "ESP32_CAM_01";
// ======================================================
// QUẢN LÝ CHẾ ĐỘ (GIAI ĐOẠN 1)
// ======================================================

enum CamMode {
  MODE_QR_SCAN,
  MODE_CAMERA_STREAM
};

const char* modeToString(CamMode m) {
  return (m == MODE_CAMERA_STREAM) ? "CAMERA_STREAM" : "QR_SCAN";
}

CamMode currentMode = MODE_QR_SCAN;   // chế độ camera đang thực sự chạy
CamMode desiredMode = MODE_QR_SCAN;   // chế độ server yêu cầu

// Polling lệnh từ server
const unsigned long POLL_INTERVAL_QR_MS     = 1500;
const unsigned long POLL_INTERVAL_STREAM_MS = 1000;

// Failsafe phía thiết bị: tự về QR_SCAN nếu mất liên lạc hoặc stream quá lâu
const unsigned long STREAM_SERVER_LOSS_TIMEOUT_MS = 15000;
const unsigned long STREAM_MAX_LOCAL_MS           = 330000;  // > MAX_SESSION của server (300 giây)

// Sau khi bật camera thất bại, không thử lại ngay
const unsigned long STREAM_RETRY_BLOCK_MS = 20000;

unsigned long lastCommandPoll = 0;
unsigned long lastServerOkTime = 0;
unsigned long streamStartedAt = 0;
unsigned long streamBlockUntil = 0;

bool ackPending = true;       // true -> cần báo chế độ thực tế lên server
String lastError = "";

// ======================================================
// QR READER
// ======================================================

ESP32QRCodeReader reader(CAMERA_MODEL_AI_THINKER);

const unsigned long SCAN_INTERVAL_MS = 300;
const unsigned long SAME_QR_COOLDOWN_MS = 10000;
const unsigned long WIFI_RETRY_INTERVAL_MS = 10000;
const unsigned long HTTP_CONNECT_TIMEOUT_MS = 5000;
const unsigned long HTTP_TIMEOUT_MS = 10000;

String lastSuccessfulToken = "";
unsigned long lastSuccessfulTokenTime = 0;
unsigned long lastScanTime = 0;
unsigned long lastWiFiRetryTime = 0;

// ======================================================
// WIFI
// ======================================================

void beginWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  Serial.print("Dang ket noi WiFi: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.disconnect(false, false);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  lastWiFiRetryTime = millis();
}

void updateWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  if (millis() - lastWiFiRetryTime >= WIFI_RETRY_INTERVAL_MS) {
    beginWiFi();
  }
}

// ======================================================
// CAMERA: QR <-> JPEG
// Chỉ một chế độ giữ camera tại một thời điểm.
// ======================================================

bool startQrMode() {
  QRCodeReaderSetupErr setupErr = reader.setup();

  if (setupErr != SETUP_OK) {
    Serial.print("Loi setup camera QR: ");
    Serial.println(setupErr);
    return false;
  }

  reader.beginOnCore(1);

  lastScanTime = millis();

  Serial.println("QRCode Reader Ready");
  return true;
}

void stopQrMode() {
  // Nếu bản thư viện của bạn không có end(), báo lại để mình sửa.
  reader.end();

  // Phòng trường hợp thư viện chưa giải phóng camera.
  // Gọi khi camera đã deinit chỉ trả lỗi INVALID_STATE, không sao.
  esp_camera_deinit();

  delay(100);
}

bool startStreamMode() {
  camera_config_t config;

  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer   = LEDC_TIMER_0;

  // Chân của AI Thinker ESP32-CAM
  config.pin_d0       = 5;
  config.pin_d1       = 18;
  config.pin_d2       = 19;
  config.pin_d3       = 21;
  config.pin_d4       = 36;
  config.pin_d5       = 39;
  config.pin_d6       = 34;
  config.pin_d7       = 35;
  config.pin_xclk     = 0;
  config.pin_pclk     = 22;
  config.pin_vsync    = 25;
  config.pin_href     = 23;
  config.pin_sccb_sda = 26;
  config.pin_sccb_scl = 27;
  config.pin_pwdn     = 32;
  config.pin_reset    = -1;

  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size   = FRAMESIZE_QVGA;   // 320x240, hợp với truyền qua tunnel
  config.jpeg_quality = 15;               // 10 (đẹp, nặng) ... 63 (xấu, nhẹ)

  if (psramFound()) {
    config.fb_count    = 2;
    config.fb_location = CAMERA_FB_IN_PSRAM;
    config.grab_mode   = CAMERA_GRAB_LATEST;
  } else {
    config.fb_count    = 1;
    config.fb_location = CAMERA_FB_IN_DRAM;
    config.grab_mode   = CAMERA_GRAB_WHEN_EMPTY;
  }

  esp_err_t err = esp_camera_init(&config);

  if (err != ESP_OK) {
    Serial.printf("Loi init camera JPEG: 0x%x\n", err);
    return false;
  }

  return true;
}

void stopStreamMode() {
  esp_camera_deinit();
  delay(100);
}

// Chuyển chế độ. Trả về true nếu đã vào đúng chế độ yêu cầu.
bool switchTo(CamMode target) {
  if (target == currentMode) {
    return true;
  }

  Serial.println();
  Serial.printf(
    "Chuyen che do: %s -> %s (heap=%u)\n",
    modeToString(currentMode),
    modeToString(target),
    ESP.getFreeHeap()
  );

  if (target == MODE_CAMERA_STREAM) {
    stopQrMode();

    if (!startStreamMode()) {
      // Không bật được camera JPEG: quay về QR ngay.
      esp_camera_deinit();

      lastError = "camera_init_failed";
      streamBlockUntil = millis() + STREAM_RETRY_BLOCK_MS;

      if (!startQrMode()) {
        // Không khôi phục được QR: khởi động lại, máy luôn boot vào QR_SCAN.
        Serial.println("Khong khoi phuc duoc QR, restart...");
        delay(500);
        ESP.restart();
      }

      currentMode = MODE_QR_SCAN;
      desiredMode = MODE_QR_SCAN;
      ackPending = true;
      return false;
    }

    currentMode = MODE_CAMERA_STREAM;
    streamStartedAt = millis();
    lastServerOkTime = millis();
    lastError = "";
    ackPending = true;

    Serial.println("Da vao CAMERA_STREAM");
    return true;
  }

  // target == MODE_QR_SCAN
  stopStreamMode();

  if (!startQrMode()) {
    Serial.println("Khong bat lai duoc QR, restart...");
    delay(500);
    ESP.restart();
  }

  currentMode = MODE_QR_SCAN;
  ackPending = true;

  Serial.println("Da quay ve QR_SCAN");
  return true;
}

// ======================================================
// POLLING LỆNH + BÁO TRẠNG THÁI
// ======================================================

bool pollCommand() {
  if (WiFi.status() != WL_CONNECTED) {
    return false;
  }

  // Giữ kết nối HTTPS để không phải bắt tay TLS mỗi giây.
  static WiFiClientSecure pollClient;
  static HTTPClient pollHttp;
  static bool initialized = false;

  if (!initialized) {
    pollClient.setInsecure();   // Demo. Bản hoàn thiện nên dùng CA certificate.
    pollHttp.setReuse(true);
    initialized = true;
  }

  String url = String(SERVER_BASE_URL) + "/esp32cam/command";

  if (!pollHttp.begin(pollClient, url)) {
    return false;
  }

  pollHttp.setConnectTimeout(HTTP_CONNECT_TIMEOUT_MS);
  pollHttp.setTimeout(HTTP_TIMEOUT_MS);
  pollHttp.addHeader("Accept", "application/json");
  pollHttp.addHeader("X-Device-Key", ESP32_CAM_KEY);

  int httpCode = pollHttp.GET();

  if (httpCode != 200) {
    Serial.printf("Poll that bai, HTTP %d\n", httpCode);

    if (httpCode <= 0) {
      pollClient.stop();   // ép kết nối lại lần sau
    }

    pollHttp.end();
    return false;
  }

  String response = pollHttp.getString();
  pollHttp.end();

  StaticJsonDocument<256> doc;

  if (deserializeJson(doc, response)) {
    Serial.println("Poll: JSON loi");
    return false;
  }

  String mode = doc["mode"] | "QR_SCAN";

  desiredMode =
    (mode == "CAMERA_STREAM") ? MODE_CAMERA_STREAM : MODE_QR_SCAN;

  lastServerOkTime = millis();
  return true;
}

void pollCommandIfDue() {
  unsigned long interval =
    (currentMode == MODE_CAMERA_STREAM)
      ? POLL_INTERVAL_STREAM_MS
      : POLL_INTERVAL_QR_MS;

  if (millis() - lastCommandPoll < interval) {
    return;
  }

  lastCommandPoll = millis();
  pollCommand();
}

bool sendAck() {
  if (WiFi.status() != WL_CONNECTED) {
    return false;
  }

  WiFiClientSecure client;
  HTTPClient http;

  client.setInsecure();

  String url = String(SERVER_BASE_URL) + "/esp32cam/ack";

  if (!http.begin(client, url)) {
    return false;
  }

  http.setConnectTimeout(HTTP_CONNECT_TIMEOUT_MS);
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", ESP32_CAM_KEY);

  StaticJsonDocument<256> doc;

  doc["mode"] = modeToString(currentMode);
  doc["free_heap"] = ESP.getFreeHeap();

  if (lastError.length() > 0) {
    doc["error"] = lastError;
  }

  String body;
  serializeJson(doc, body);

  int httpCode = http.POST(body);
  http.end();

  bool ok = (httpCode >= 200 && httpCode < 300);

  Serial.printf(
    "Ack %s -> HTTP %d\n",
    modeToString(currentMode),
    httpCode
  );

  if (ok) {
    lastError = "";   // đã báo lỗi xong, xóa
  }

  return ok;
}

void retryAckIfNeeded() {
  static unsigned long lastAckTry = 0;

  if (!ackPending) {
    return;
  }

  if (millis() - lastAckTry < 2000) {
    return;
  }

  lastAckTry = millis();

  if (sendAck()) {
    ackPending = false;
  }
}

// ======================================================
// QUYẾT ĐỊNH CHUYỂN CHẾ ĐỘ
// ======================================================

void reconcileMode() {
  // Failsafe 1: đang stream mà mất liên lạc với server.
  if (
    currentMode == MODE_CAMERA_STREAM &&
    millis() - lastServerOkTime > STREAM_SERVER_LOSS_TIMEOUT_MS
  ) {
    Serial.println("Mat lien lac server -> ve QR_SCAN");
    desiredMode = MODE_QR_SCAN;
  }

  // Failsafe 2: stream quá lâu (phòng server lỗi lease).
  if (
    currentMode == MODE_CAMERA_STREAM &&
    millis() - streamStartedAt > STREAM_MAX_LOCAL_MS
  ) {
    Serial.println("Het thoi gian giam sat toi da -> ve QR_SCAN");
    desiredMode = MODE_QR_SCAN;
  }

  if (desiredMode == currentMode) {
    return;
  }

  if (
    desiredMode == MODE_CAMERA_STREAM &&
    millis() < streamBlockUntil
  ) {
    return;   // vừa thất bại, chờ một lúc
  }

  switchTo(desiredMode);
}

// ======================================================
// QR TOKEN
// ======================================================

bool isRecentlySentToken(const String& token) {
  return (
    token == lastSuccessfulToken &&
    millis() - lastSuccessfulTokenTime < SAME_QR_COOLDOWN_MS
  );
}

bool sendTokenToServer(const String& token) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi chua ket noi, khong gui QR");
    return false;
  }

  WiFiClientSecure secureClient;
  HTTPClient http;

  // Demo: bỏ xác minh chứng chỉ HTTPS.
  secureClient.setInsecure();

  String url = String(SERVER_BASE_URL) + "/qr/verify";

  Serial.print("POST: ");
  Serial.println(url);

  if (!http.begin(secureClient, url)) {
    Serial.println("Khong khoi tao duoc HTTPS");
    return false;
  }

  http.setConnectTimeout(HTTP_CONNECT_TIMEOUT_MS);
  http.setTimeout(HTTP_TIMEOUT_MS);

  http.addHeader("Content-Type", "application/json");
  http.addHeader("Accept", "application/json");
  http.addHeader("X-Device-Key", ESP32_CAM_KEY);

  StaticJsonDocument<256> requestDoc;

  requestDoc["token"] = token;
  requestDoc["device_id"] = DEVICE_ID;

  String requestBody;
  serializeJson(requestDoc, requestBody);

  Serial.print("Body: ");
  Serial.println(requestBody);

  int httpCode = http.POST(requestBody);

  Serial.print("HTTP Code: ");
  Serial.println(httpCode);

  if (httpCode <= 0) {
    Serial.print("Loi HTTP: ");
    Serial.println(http.errorToString(httpCode));
    http.end();
    return false;
  }

  String response = http.getString();

  Serial.print("Server Response: ");
  Serial.println(response);

  bool requestAccepted = false;

  StaticJsonDocument<512> responseDoc;

  DeserializationError error = deserializeJson(responseDoc, response);

  if (error) {
    Serial.print("Loi JSON response: ");
    Serial.println(error.c_str());
  } else {
    bool success = responseDoc["success"] | false;
    String message = responseDoc["message"] | "Khong co thong bao";
    String command = responseDoc["command"] | "DENY";

    Serial.print("Success: ");
    Serial.println(success ? "true" : "false");

    Serial.print("Message: ");
    Serial.println(message);

    Serial.print("Command: ");
    Serial.println(command);

    // Chỉ coi là đã gửi thành công khi server trả HTTP 2xx.
    // QR không hợp lệ hoặc đã dùng vẫn là request đã xử lý.
    requestAccepted = httpCode >= 200 && httpCode < 300;
  }

  http.end();

  return requestAccepted;
}

// ======================================================
// TICK THEO TỪNG CHẾ ĐỘ
// ======================================================

void qrScanTick() {
  unsigned long now = millis();

  if (now - lastScanTime < SCAN_INTERVAL_MS) {
    delay(5);
    return;
  }

  lastScanTime = now;

  QRCodeData qrCodeData;

  // receiveQrCode chờ tối đa 100 ms để không làm chậm xử lý Wi-Fi.
  if (!reader.receiveQrCode(&qrCodeData, 100)) {
    delay(5);
    return;
  }

  if (!qrCodeData.valid) {
    Serial.println("Phat hien QR nhung du lieu khong hop le");
    return;
  }

  String token = String((const char*)qrCodeData.payload);
  token.trim();

  if (token.length() == 0) {
    Serial.println("QR rong");
    return;
  }

  if (token.length() > 255) {
    Serial.println("QR token qua dai");
    return;
  }

  if (isRecentlySentToken(token)) {
    Serial.println("QR vua duoc xu ly, tam bo qua");
    return;
  }

  Serial.println();
  Serial.println("------------------------------");
  Serial.print("QR Token: ");
  Serial.println(token);

  bool sent = sendTokenToServer(token);

  if (sent) {
    lastSuccessfulToken = token;
    lastSuccessfulTokenTime = millis();
    Serial.println("Server da xu ly QR");
  } else {
    // Không lưu token khi lỗi mạng để có thể gửi lại.
    Serial.println("Gui QR that bai, cho phep thu lai");
  }

  Serial.println("------------------------------");
}

void cameraStreamTick() {
  /*
    GIAI ĐOẠN 1: chưa truyền hình ảnh.
    Chỉ chụp thử một khung mỗi 2 giây và in kích thước ra Serial
    để chứng minh camera ở chế độ JPEG hoạt động sau khi chuyển.
    Giai đoạn 4 sẽ thay phần này bằng gửi khung hình lên server.
  */
  static unsigned long lastFrameTime = 0;

  if (millis() - lastFrameTime < 2000) {
    delay(5);
    return;
  }

  lastFrameTime = millis();

  camera_fb_t* fb = esp_camera_fb_get();

  if (!fb) {
    Serial.println("Chup khung hinh that bai");
    return;
  }

  Serial.printf(
    "Frame: %ux%u, %u bytes\n",
    fb->width,
    fb->height,
    (unsigned)fb->len
  );

  esp_camera_fb_return(fb);
}

// ======================================================
// SETUP / LOOP
// ======================================================

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("==============================");
  Serial.println("ESP32-CAM: QR SCAN + CAMERA MONITOR");
  Serial.println("==============================");

  beginWiFi();

  unsigned long wifiWaitStart = millis();

  while (
    WiFi.status() != WL_CONNECTED &&
    millis() - wifiWaitStart < 10000
  ) {
    delay(300);
    Serial.print(".");
  }

  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("WiFi connected");
    Serial.print("ESP32-CAM IP: ");
    Serial.println(WiFi.localIP());
    Serial.print("RSSI: ");
    Serial.println(WiFi.RSSI());
  } else {
    Serial.println("WiFi chua ket noi, se thu lai trong loop");
  }

  // Luôn khởi động ở chế độ QR_SCAN.
  if (!startQrMode()) {
    while (true) {
      delay(1000);
    }
  }

  currentMode = MODE_QR_SCAN;
  desiredMode = MODE_QR_SCAN;
  ackPending = true;   // báo server biết thiết bị đang ở QR_SCAN
}

void loop() {
  updateWiFi();

  pollCommandIfDue();
  reconcileMode();
  retryAckIfNeeded();

  if (currentMode == MODE_QR_SCAN) {
    qrScanTick();
  } else {
    cameraStreamTick();
  }
}
