#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// ======================================================
// WIFI
// ======================================================

const char* WIFI_SSID = "7neem";
const char* WIFI_PASS = "matkhaugi";

// ======================================================
// SERVER
// ======================================================

// Không thêm "/" ở cuối.
const char* SERVER_BASE_URL =
  "https://rational-roberts-mechanics-feet.trycloudflare.com";

// Phải giống ESP32_DEVKIT_KEY trong .env server.
const char* ESP32_DEVKIT_KEY =
  "SMARTDOOR_DEVKIT_SECRET_2026";

const char* DEVICE_ID =
  "ESP32_DEVKIT_01";

// ======================================================
// OLED SSD1306
// ======================================================

#define OLED_SDA 21
#define OLED_SCL 22

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_ADDR 0x3C

Adafruit_SSD1306 display(
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
  &Wire,
  -1
);

bool oledAvailable = false;

// ======================================================
// GPIO
// ======================================================

#define RELAY_PIN        25
#define DOOR_SENSOR_PIN  26
#define EXIT_BUTTON_PIN  27

/*
  Relay module hiện tại kích HIGH.

  Nếu relay của bạn kích LOW thì đổi thành false.
*/
#define RELAY_ACTIVE_HIGH true

/*
  Nút Exit:
  - INPUT_PULLUP
  - nhấn nối GPIO27 xuống GND
*/
#define EXIT_BUTTON_PRESSED LOW

/*
  MC-38:

  Cửa đóng, nam châm gần:
  GPIO26 nối GND → LOW.

  Nếu thực tế hiển thị ngược,
  đổi LOW thành HIGH.
*/
#define DOOR_CLOSED_LEVEL LOW

// ======================================================
// TIME CONFIG
// ======================================================

// Khóa chỉ được cấp điện tối đa 5 giây.
const unsigned long UNLOCK_TIME_MS = 5000;

// Poll command mặc định mỗi 1 giây.
unsigned long commandPollMs = 1000;

// Heartbeat mặc định mỗi 30 giây.
unsigned long heartbeatIntervalMs = 30000;

// Timeout Internet.
const unsigned long HTTP_CONNECT_TIMEOUT_MS = 5000;
const unsigned long HTTP_TIMEOUT_MS = 8000;

// Debounce.
const unsigned long BUTTON_DEBOUNCE_MS = 50;
const unsigned long SENSOR_DEBOUNCE_MS = 100;

// Wi-Fi reconnect.
const unsigned long WIFI_RETRY_INTERVAL_MS = 10000;

// Thời gian thông báo OLED tạm.
const unsigned long OLED_MESSAGE_TIME_MS = 2000;

// Khi report lỗi, chờ 3 giây mới thử lại.
const unsigned long REPORT_RETRY_MS = 3000;

// ======================================================
// TIME STATE
// ======================================================

unsigned long lastCommandMs = 0;
unsigned long lastHeartbeatMs = 0;
unsigned long lastWiFiRetryMs = 0;
unsigned long lastReportAttemptMs = 0;

unsigned long unlockStartMs = 0;
unsigned long temporaryMessageStartMs = 0;

// ======================================================
// SYSTEM STATE
// ======================================================

bool relayOpening = false;
bool temporaryMessageActive = false;

bool pendingServerReport = false;

String unlockSource = "";
String pendingReportMessage = "";

// Exit debounce.
bool exitLastRaw = HIGH;
bool exitStableState = HIGH;
unsigned long exitLastChangeMs = 0;

// MC-38 debounce.
bool doorLastRawClosed = false;
bool doorStableClosed = false;
unsigned long doorLastChangeMs = 0;

// OLED cache.
String lastOLEDLine1 = "";
String lastOLEDLine2 = "";
String lastOLEDLine3 = "";

// ======================================================
// URL
// ======================================================

String makeUrl(const String& path) {
  return String(SERVER_BASE_URL) + path;
}

// ======================================================
// OLED
// ======================================================

void drawOLED(
  const String& line1,
  const String& line2,
  const String& line3 = ""
) {
  if (!oledAvailable) {
    return;
  }

  if (
    line1 == lastOLEDLine1 &&
    line2 == lastOLEDLine2 &&
    line3 == lastOLEDLine3
  ) {
    return;
  }

  lastOLEDLine1 = line1;
  lastOLEDLine2 = line2;
  lastOLEDLine3 = line3;

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println(line1);

  display.setTextSize(2);
  display.setCursor(0, 20);
  display.println(line2);

  display.setTextSize(1);
  display.setCursor(0, 54);
  display.println(line3);

  display.display();
}

void showTemporaryOLED(
  const String& line1,
  const String& line2,
  const String& line3 = ""
) {
  temporaryMessageActive = true;

  temporaryMessageStartMs =
    millis();

  drawOLED(
    line1,
    line2,
    line3
  );
}

void showNormalOLED() {
  if (relayOpening) {
    unsigned long elapsed =
      millis() - unlockStartMs;

    unsigned long remainMs =
      elapsed < UNLOCK_TIME_MS
        ? UNLOCK_TIME_MS - elapsed
        : 0;

    unsigned long remainSeconds =
      (remainMs + 999) / 1000;

    String sourceText =
      unlockSource == "EXIT"
        ? "Exit button"
        : "Face / QR";

    drawOLED(
      "ACCESS GRANTED",
      "UNLOCK",
      sourceText + " " +
        String(remainSeconds) + "s"
    );

    return;
  }

  if (!doorStableClosed) {
    drawOLED(
      "SMART DOOR",
      "DOOR OPEN",
      "Please close"
    );

    return;
  }

  if (WiFi.status() == WL_CONNECTED) {
    drawOLED(
      "SMART DOOR",
      "LOCKED",
      "Internet online"
    );
  } else {
    drawOLED(
      "SMART DOOR",
      "LOCKED",
      "Internet offline"
    );
  }
}

void updateOLED() {
  if (temporaryMessageActive) {
    if (
      millis() - temporaryMessageStartMs <
      OLED_MESSAGE_TIME_MS
    ) {
      return;
    }

    temporaryMessageActive = false;
  }

  showNormalOLED();
}

// ======================================================
// RELAY
// ======================================================

void setRelay(bool on) {
  if (RELAY_ACTIVE_HIGH) {
    digitalWrite(
      RELAY_PIN,
      on ? HIGH : LOW
    );
  } else {
    digitalWrite(
      RELAY_PIN,
      on ? LOW : HIGH
    );
  }
}

void openDoor(const String& source) {
  if (relayOpening) {
    Serial.println(
      "Bo qua lenh mo moi: relay dang bat"
    );

    return;
  }

  relayOpening = true;

  unlockStartMs =
    millis();

  unlockSource =
    source;

  temporaryMessageActive = false;

  setRelay(true);

  Serial.print("MO KHOA - nguon: ");
  Serial.println(source);

  showNormalOLED();
}

void closeDoorRelay() {
  /*
    Ngắt relay ngay trước khi thực hiện bất kỳ
    công việc mạng nào.
  */
  setRelay(false);

  relayOpening = false;

  Serial.println(
    "HET 5 GIAY -> TAT RELAY"
  );

  pendingServerReport = true;

  if (unlockSource == "SERVER") {
    pendingReportMessage =
      "Door unlocked by server for 5 seconds";
  } else if (unlockSource == "EXIT") {
    pendingReportMessage =
      "Door unlocked by exit button for 5 seconds";
  } else {
    pendingReportMessage =
      "Door unlocked for 5 seconds";
  }

  unlockSource = "";

  showNormalOLED();
}

void updateRelay() {
  if (!relayOpening) {
    return;
  }

  if (
    millis() - unlockStartMs >=
    UNLOCK_TIME_MS
  ) {
    closeDoorRelay();
  }
}

// ======================================================
// EXIT BUTTON
// ======================================================

void updateExitButton() {
  bool raw =
    digitalRead(EXIT_BUTTON_PIN);

  if (raw != exitLastRaw) {
    exitLastRaw = raw;

    exitLastChangeMs =
      millis();
  }

  if (
    millis() - exitLastChangeMs <
    BUTTON_DEBOUNCE_MS
  ) {
    return;
  }

  if (raw == exitStableState) {
    return;
  }

  exitStableState = raw;

  if (
    exitStableState ==
    EXIT_BUTTON_PRESSED
  ) {
    Serial.println(
      "DA NHAN NUT EXIT"
    );

    /*
      Nút Exit hoạt động cục bộ,
      không phụ thuộc Wi-Fi/server.
    */
    openDoor("EXIT");
  }
}

// ======================================================
// MC-38
// ======================================================

bool readDoorClosedRaw() {
  return (
    digitalRead(DOOR_SENSOR_PIN) ==
    DOOR_CLOSED_LEVEL
  );
}

void updateDoorSensor() {
  bool rawClosed =
    readDoorClosedRaw();

  if (
    rawClosed !=
    doorLastRawClosed
  ) {
    doorLastRawClosed =
      rawClosed;

    doorLastChangeMs =
      millis();
  }

  if (
    millis() - doorLastChangeMs <
    SENSOR_DEBOUNCE_MS
  ) {
    return;
  }

  if (
    rawClosed ==
    doorStableClosed
  ) {
    return;
  }

  doorStableClosed =
    rawClosed;

  if (doorStableClosed) {
    Serial.println(
      "MC38: CUA DA DONG"
    );
  } else {
    Serial.println(
      "MC38: CUA DANG MO"
    );
  }

  /*
    Gửi trạng thái cửa lên server khi có thay đổi.

    Report chỉ được gửi sau, ngoài hàm này,
    để không làm nghẽn xử lý cảm biến.
  */
  pendingServerReport = true;

  pendingReportMessage =
    doorStableClosed
      ? "Physical door closed"
      : "Physical door opened";

  if (!relayOpening) {
    showNormalOLED();
  }
}

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

  WiFi.disconnect(
    false,
    false
  );

  WiFi.begin(
    WIFI_SSID,
    WIFI_PASS
  );

  lastWiFiRetryMs =
    millis();
}

void updateWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  if (
    millis() - lastWiFiRetryMs >=
    WIFI_RETRY_INTERVAL_MS
  ) {
    beginWiFi();
  }
}

// ======================================================
// HTTP HELPERS
// ======================================================

void configureHttp(
  HTTPClient& http
) {
  http.setConnectTimeout(
    HTTP_CONNECT_TIMEOUT_MS
  );

  http.setTimeout(
    HTTP_TIMEOUT_MS
  );
}

void addDeviceHeaders(
  HTTPClient& http,
  bool jsonContent
) {
  http.addHeader(
    "Accept",
    "application/json"
  );

  http.addHeader(
    "X-Device-Key",
    ESP32_DEVKIT_KEY
  );

  if (jsonContent) {
    http.addHeader(
      "Content-Type",
      "application/json"
    );
  }
}

// ======================================================
// SERVER CONFIG
// ======================================================

void getConfigFromServer() {
  if (
    WiFi.status() != WL_CONNECTED ||
    relayOpening
  ) {
    return;
  }

  WiFiClientSecure secureClient;
  HTTPClient http;

  secureClient.setInsecure();

  String url =
    makeUrl("/esp32/config");

  if (!http.begin(secureClient, url)) {
    Serial.println(
      "Khong khoi tao duoc config HTTPS"
    );

    return;
  }

  configureHttp(http);
  addDeviceHeaders(http, false);

  int httpCode =
    http.GET();

  Serial.print("Config HTTP Code: ");
  Serial.println(httpCode);

  if (httpCode == 200) {
    String response =
      http.getString();

    StaticJsonDocument<512> doc;

    DeserializationError error =
      deserializeJson(
        doc,
        response
      );

    if (
      !error &&
      doc["success"] == true
    ) {
      commandPollMs =
        doc["command_poll_ms"] |
        1000;

      heartbeatIntervalMs =
        doc["heartbeat_interval_ms"] |
        30000;

      /*
        Giới hạn an toàn.

        Không cho server yêu cầu poll quá nhanh
        hoặc heartbeat quá thường xuyên.
      */
      if (commandPollMs < 500) {
        commandPollMs = 500;
      }

      if (commandPollMs > 10000) {
        commandPollMs = 10000;
      }

      if (heartbeatIntervalMs < 10000) {
        heartbeatIntervalMs = 10000;
      }

      Serial.print("commandPollMs: ");
      Serial.println(commandPollMs);

      Serial.print("heartbeatIntervalMs: ");
      Serial.println(
        heartbeatIntervalMs
      );
    }
  }

  http.end();
}

// ======================================================
// HEARTBEAT
// ======================================================

bool sendHeartbeat() {
  if (
    WiFi.status() != WL_CONNECTED ||
    relayOpening
  ) {
    return false;
  }

  WiFiClientSecure secureClient;
  HTTPClient http;

  secureClient.setInsecure();

  String url =
    makeUrl("/esp32/heartbeat");

  if (!http.begin(secureClient, url)) {
    Serial.println(
      "Khong khoi tao duoc heartbeat HTTPS"
    );

    return false;
  }

  configureHttp(http);
  addDeviceHeaders(http, true);

  StaticJsonDocument<384> doc;

  doc["device"] = DEVICE_ID;
  doc["ip"] = WiFi.localIP().toString();
  doc["rssi"] = WiFi.RSSI();
  doc["uptime"] = millis() / 1000;

  doc["door_status"] =
    doorStableClosed
      ? "closed"
      : "open";

  doc["relay_status"] =
    relayOpening
      ? "ON"
      : "OFF";

  String body;

  serializeJson(
    doc,
    body
  );

  int httpCode =
    http.POST(body);

  Serial.print("Heartbeat HTTP Code: ");
  Serial.println(httpCode);

  if (httpCode > 0) {
    String response =
      http.getString();

    Serial.print("Heartbeat Response: ");
    Serial.println(response);
  } else {
    Serial.print("Heartbeat Error: ");
    Serial.println(
      http.errorToString(httpCode)
    );
  }

  http.end();

  return (
    httpCode >= 200 &&
    httpCode < 300
  );
}

// ======================================================
// REPORT
// ======================================================

bool sendReport(
  const String& message
) {
  if (
    WiFi.status() != WL_CONNECTED ||
    relayOpening
  ) {
    return false;
  }

  WiFiClientSecure secureClient;
  HTTPClient http;

  secureClient.setInsecure();

  String url =
    makeUrl("/esp32/report");

  if (!http.begin(secureClient, url)) {
    Serial.println(
      "Khong khoi tao duoc report HTTPS"
    );

    return false;
  }

  configureHttp(http);
  addDeviceHeaders(http, true);

  StaticJsonDocument<384> doc;

  doc["device"] =
    DEVICE_ID;

  doc["door_status"] =
    doorStableClosed
      ? "closed"
      : "open";

  doc["relay_status"] =
    relayOpening
      ? "ON"
      : "OFF";

  doc["message"] =
    message;

  String body;

  serializeJson(
    doc,
    body
  );

  int httpCode =
    http.POST(body);

  Serial.print("Report HTTP Code: ");
  Serial.println(httpCode);

  if (httpCode > 0) {
    String response =
      http.getString();

    Serial.print("Report Response: ");
    Serial.println(response);
  } else {
    Serial.print("Report Error: ");
    Serial.println(
      http.errorToString(httpCode)
    );
  }

  bool success =
    httpCode >= 200 &&
    httpCode < 300;

  http.end();

  return success;
}

// ======================================================
// COMMAND
// ======================================================

void checkServerCommand() {
  if (
    WiFi.status() != WL_CONNECTED ||
    relayOpening
  ) {
    return;
  }

  WiFiClientSecure secureClient;
  HTTPClient http;

  secureClient.setInsecure();

  String url =
    makeUrl("/esp32/command");

  if (!http.begin(secureClient, url)) {
    Serial.println(
      "Khong khoi tao duoc command HTTPS"
    );

    return;
  }

  configureHttp(http);
  addDeviceHeaders(http, false);

  int httpCode =
    http.GET();

  if (httpCode != 200) {
    if (httpCode <= 0) {
      Serial.print("Command Error: ");
      Serial.println(
        http.errorToString(httpCode)
      );
    } else {
      Serial.print("Command HTTP Code: ");
      Serial.println(httpCode);

      Serial.print("Response: ");
      Serial.println(http.getString());
    }

    http.end();

    return;
  }

  String response =
    http.getString();

  StaticJsonDocument<384> doc;

  DeserializationError error =
    deserializeJson(
      doc,
      response
    );

  if (error) {
    Serial.print("Loi JSON command: ");
    Serial.println(error.c_str());

    http.end();

    return;
  }

  bool success =
    doc["success"] | false;

  String command =
    doc["command"] | "NONE";

  if (!success) {
    Serial.print(
      "Server command khong thanh cong: "
    );

    Serial.println(response);

    http.end();

    return;
  }

  if (command != "NONE") {
    Serial.print("Command: ");
    Serial.println(command);
  }

  /*
    Mở cửa bằng QR hoặc khuôn mặt đều được
    FastAPI chuyển thành OPEN_DOOR.
  */
  if (command == "OPEN_DOOR") {
    openDoor("SERVER");
  }

  http.end();
}

// ======================================================
// SETUP
// ======================================================

void setup() {
  Serial.begin(115200);
  delay(300);

  Serial.println();
  Serial.println("==============================");
  Serial.println("ESP32 DEVKIT SMART DOOR");
  Serial.println("==============================");

  // Relay mặc định tắt.
  pinMode(
    RELAY_PIN,
    OUTPUT
  );

  setRelay(false);

  pinMode(
    EXIT_BUTTON_PIN,
    INPUT_PULLUP
  );

  pinMode(
    DOOR_SENSOR_PIN,
    INPUT_PULLUP
  );

  exitLastRaw =
    digitalRead(EXIT_BUTTON_PIN);

  exitStableState =
    exitLastRaw;

  doorLastRawClosed =
    readDoorClosedRaw();

  doorStableClosed =
    doorLastRawClosed;

  Wire.begin(
    OLED_SDA,
    OLED_SCL
  );

  oledAvailable =
    display.begin(
      SSD1306_SWITCHCAPVCC,
      OLED_ADDR
    );

  if (oledAvailable) {
    drawOLED(
      "SMART DOOR",
      "START",
      "Booting..."
    );
  } else {
    Serial.println(
      "OLED FAIL - he thong van chay"
    );
  }

  beginWiFi();

  /*
    Chờ Wi-Fi tối đa 5 giây.

    Trong lúc chờ vẫn xử lý Exit,
    MC-38 và relay.
  */
  unsigned long waitStart =
    millis();

  while (
    millis() - waitStart < 5000 &&
    WiFi.status() != WL_CONNECTED
  ) {
    updateExitButton();
    updateDoorSensor();
    updateRelay();

    delay(5);
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("WiFi OK: ");
    Serial.println(WiFi.localIP());

    Serial.print("RSSI: ");
    Serial.println(WiFi.RSSI());

    showTemporaryOLED(
      "SMART DOOR",
      "WIFI OK",
      WiFi.localIP().toString()
    );

    getConfigFromServer();

    sendHeartbeat();

    lastHeartbeatMs =
      millis();
  } else {
    Serial.println(
      "WiFi offline - Exit van hoat dong"
    );

    showTemporaryOLED(
      "SMART DOOR",
      "OFFLINE",
      "Exit still works"
    );
  }
}

// ======================================================
// LOOP
// ======================================================

void loop() {
  unsigned long now =
    millis();

  /*
    Xử lý phần cứng trước để relay luôn được
    ngắt đúng sau 5 giây, kể cả HTTP bị chậm.
  */
  updateExitButton();
  updateDoorSensor();
  updateRelay();
  updateOLED();
  updateWiFi();

  if (
    !relayOpening &&
    WiFi.status() == WL_CONNECTED
  ) {
    /*
      Gửi báo cáo đang chờ.

      Nếu thất bại, giữ lại và thử lại sau.
    */
    if (
      pendingServerReport &&
      now - lastReportAttemptMs >=
        REPORT_RETRY_MS
    ) {
      lastReportAttemptMs = now;

      bool sent =
        sendReport(
          pendingReportMessage
        );

      if (sent) {
        pendingServerReport = false;
        pendingReportMessage = "";
      }
    }

    if (
      now - lastCommandMs >=
      commandPollMs
    ) {
      lastCommandMs = now;

      checkServerCommand();
    }

    if (
      now - lastHeartbeatMs >=
      heartbeatIntervalMs
    ) {
      lastHeartbeatMs = now;

      sendHeartbeat();
    }
  }

  delay(2);
}