#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <ESP32QRCodeReader.h>

// ======================================================
// WIFI
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
// QR READER
// ======================================================

ESP32QRCodeReader reader(CAMERA_MODEL_AI_THINKER);

// Thời gian chờ giữa các lượt lấy dữ liệu QR.
const unsigned long SCAN_INTERVAL_MS = 300;

// Không gửi lại cùng một QR liên tục trong 10 giây.
const unsigned long SAME_QR_COOLDOWN_MS = 10000;

// Thử nối lại Wi-Fi mỗi 10 giây.
const unsigned long WIFI_RETRY_INTERVAL_MS = 10000;

// Timeout HTTP khi gửi qua Internet.
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

  WiFi.begin(
    WIFI_SSID,
    WIFI_PASS
  );

  lastWiFiRetryTime = millis();
}

void updateWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  if (
    millis() - lastWiFiRetryTime >=
    WIFI_RETRY_INTERVAL_MS
  ) {
    beginWiFi();
  }
}

// ======================================================
// QR TOKEN
// ======================================================

bool isRecentlySentToken(const String& token) {
  return (
    token == lastSuccessfulToken &&
    millis() - lastSuccessfulTokenTime <
      SAME_QR_COOLDOWN_MS
  );
}

// ======================================================
// SEND QR TO SERVER
// ======================================================

bool sendTokenToServer(const String& token) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println(
      "WiFi chua ket noi, khong gui QR"
    );

    return false;
  }

  WiFiClientSecure secureClient;
  HTTPClient http;

  /*
    Demo: bỏ xác minh chứng chỉ HTTPS.

    Bản hoàn thiện nên cài CA certificate
    thay vì setInsecure().
  */
  secureClient.setInsecure();

  String url =
    String(SERVER_BASE_URL) +
    "/qr/verify";

  Serial.print("POST: ");
  Serial.println(url);

  if (!http.begin(secureClient, url)) {
    Serial.println(
      "Khong khoi tao duoc HTTPS"
    );

    return false;
  }

  http.setConnectTimeout(
    HTTP_CONNECT_TIMEOUT_MS
  );

  http.setTimeout(
    HTTP_TIMEOUT_MS
  );

  http.addHeader(
    "Content-Type",
    "application/json"
  );

  http.addHeader(
    "Accept",
    "application/json"
  );

  http.addHeader(
    "X-Device-Key",
    ESP32_CAM_KEY
  );

  StaticJsonDocument<256> requestDoc;

  requestDoc["token"] = token;
  requestDoc["device_id"] = DEVICE_ID;

  String requestBody;

  serializeJson(
    requestDoc,
    requestBody
  );

  Serial.print("Body: ");
  Serial.println(requestBody);

  int httpCode =
    http.POST(requestBody);

  Serial.print("HTTP Code: ");
  Serial.println(httpCode);

  if (httpCode <= 0) {
    Serial.print("Loi HTTP: ");
    Serial.println(
      http.errorToString(httpCode)
    );

    http.end();

    return false;
  }

  String response =
    http.getString();

  Serial.print("Server Response: ");
  Serial.println(response);

  bool requestAccepted = false;

  StaticJsonDocument<512> responseDoc;

  DeserializationError error =
    deserializeJson(
      responseDoc,
      response
    );

  if (error) {
    Serial.print("Loi JSON response: ");
    Serial.println(error.c_str());
  } else {
    bool success =
      responseDoc["success"] | false;

    String message =
      responseDoc["message"] |
      "Khong co thong bao";

    String command =
      responseDoc["command"] |
      "DENY";

    Serial.print("Success: ");
    Serial.println(
      success ? "true" : "false"
    );

    Serial.print("Message: ");
    Serial.println(message);

    Serial.print("Command: ");
    Serial.println(command);

    /*
      Chỉ coi là đã gửi thành công khi server
      thực sự nhận request và phản hồi HTTP 200.

      QR không hợp lệ hoặc đã dùng vẫn được xem
      là request đã xử lý để tránh gửi liên tục.
    */
    requestAccepted =
      httpCode >= 200 &&
      httpCode < 300;
  }

  http.end();

  return requestAccepted;
}

// ======================================================
// SETUP
// ======================================================

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("==============================");
  Serial.println("ESP32-CAM QR SCANNER");
  Serial.println("==============================");

  beginWiFi();

  unsigned long wifiWaitStart =
    millis();

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
    Serial.println(
      "WiFi chua ket noi, se thu lai trong loop"
    );
  }

  QRCodeReaderSetupErr setupErr =
    reader.setup();

  if (setupErr != SETUP_OK) {
    Serial.print("Loi setup camera: ");
    Serial.println(setupErr);

    while (true) {
      delay(1000);
    }
  }

  reader.beginOnCore(1);

  Serial.println("QRCode Reader Ready");
}

// ======================================================
// LOOP
// ======================================================

void loop() {
  updateWiFi();

  unsigned long now =
    millis();

  if (
    now - lastScanTime <
    SCAN_INTERVAL_MS
  ) {
    delay(5);
    return;
  }

  lastScanTime = now;

  QRCodeData qrCodeData;

  /*
    receiveQrCode chờ tối đa 100 ms.
    Không nên chờ 1000 ms vì sẽ làm xử lý Wi-Fi chậm.
  */
  if (
    !reader.receiveQrCode(
      &qrCodeData,
      100
    )
  ) {
    delay(5);
    return;
  }

  if (!qrCodeData.valid) {
    Serial.println(
      "Phat hien QR nhung du lieu khong hop le"
    );

    return;
  }

  String token =
    String(
      (const char*)qrCodeData.payload
    );

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
    Serial.println(
      "QR vua duoc xu ly, tam bo qua"
    );

    return;
  }

  Serial.println();
  Serial.println("------------------------------");
  Serial.print("QR Token: ");
  Serial.println(token);

  bool sent =
    sendTokenToServer(token);

  if (sent) {
    lastSuccessfulToken = token;

    lastSuccessfulTokenTime =
      millis();

    Serial.println(
      "Server da xu ly QR"
    );
  } else {
    /*
      Không lưu lastToken nếu request lỗi mạng.

      Nhờ vậy QR có thể được gửi lại khi mạng
      hoặc server hoạt động trở lại.
    */
    Serial.println(
      "Gui QR that bai, cho phep thu lai"
    );
  }

  Serial.println("------------------------------");
}