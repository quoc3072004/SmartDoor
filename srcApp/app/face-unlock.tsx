import { Ionicons } from '@expo/vector-icons';
import {
  CameraType,
  CameraView,
  useCameraPermissions,
} from 'expo-camera';
import { router } from 'expo-router';
import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { AuthContext } from '../contexts/AuthContext';
import * as ImageManipulator from 'expo-image-manipulator';

type ScanStatus =
  | 'requesting_permission'
  | 'camera_ready'
  | 'preparing'
  | 'capturing'
  | 'verifying'
  | 'success'
  | 'failed'
  | 'locked';

const AUTO_CAPTURE_DELAY_MS = 1400;
const RETRY_DELAY_MS = 2200;
const MAX_ATTEMPTS = 3;

export default function FaceUnlockScreen() {
  const {
    openDoorByFaceImage,
    faceFailCount,
  } = useContext(AuthContext);

  const cameraRef = useRef<CameraView | null>(null);
  const captureTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const retryTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const processingRef = useRef(false);
  const mountedRef = useRef(true);

  const [permission, requestPermission] =
    useCameraPermissions();

  const [cameraReady, setCameraReady] =
    useState(false);

  const [status, setStatus] =
    useState<ScanStatus>('requesting_permission');

  const [message, setMessage] = useState(
    'Đang kiểm tra quyền truy cập camera...'
  );

  const [attemptCount, setAttemptCount] =
    useState(0);

  const clearTimers = useCallback(() => {
    if (captureTimerRef.current) {
      clearTimeout(captureTimerRef.current);
      captureTimerRef.current = null;
    }

    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      processingRef.current = false;
      clearTimers();
    };
  }, [clearTimers]);

  useEffect(() => {
    if (!permission) {
      setStatus('requesting_permission');
      setMessage('Đang kiểm tra quyền truy cập camera...');
      return;
    }

    if (!permission.granted) {
      setStatus('requesting_permission');
      setMessage(
        'Ứng dụng cần quyền camera để nhận diện khuôn mặt.'
      );
      return;
    }

    if (!cameraReady) {
      setStatus('camera_ready');
      setMessage('Đang khởi động camera...');
    }
  }, [permission, cameraReady]);

  const scheduleCapture = useCallback(
    (delay = AUTO_CAPTURE_DELAY_MS) => {
      clearTimers();

      if (
        !permission?.granted ||
        !cameraReady ||
        processingRef.current
      ) {
        return;
      }

      if (attemptCount >= MAX_ATTEMPTS) {
        setStatus('locked');
        setMessage(
          'Đã nhận diện thất bại 3 lần. Vui lòng thử lại.'
        );
        return;
      }

      setStatus('preparing');
      setMessage(
        'Đưa khuôn mặt vào giữa khung và nhìn thẳng camera.'
      );

      captureTimerRef.current = setTimeout(() => {
        void captureAndVerify();
      }, delay);
    },
    [
      attemptCount,
      cameraReady,
      clearTimers,
      permission?.granted,
    ]
  );

  const captureAndVerify = useCallback(async () => {
    if (
      processingRef.current ||
      !cameraRef.current ||
      !cameraReady
    ) {
      return;
    }

    processingRef.current = true;
    clearTimers();

    const currentAttempt = attemptCount + 1;
    setAttemptCount(currentAttempt);

    try {
      setStatus('capturing');
      setMessage('Đang chụp ảnh khuôn mặt...');

      const photo =
        await cameraRef.current.takePictureAsync({
          quality: 0.5,
          skipProcessing: false,
          shutterSound: false,
        });

      if (!photo?.uri) {
        throw new Error('Không lấy được ảnh từ camera');
      }

      const compressedImage =
        await ImageManipulator.manipulateAsync(
          photo.uri,
          [
            {
              resize: {
                width: 720,
              },
            },
          ],
          {
            compress: 0.6,
            format: ImageManipulator.SaveFormat.JPEG,
          }
        );

      if (!mountedRef.current) return;

      setStatus('verifying');
      setMessage('Đang xác thực khuôn mặt...');

      const result =
        await openDoorByFaceImage(
          compressedImage.uri
        );

      if (!mountedRef.current) return;

      if (result.ok) {
        setStatus('success');
        setMessage(
          result.message || 'Mở cửa thành công'
        );

        processingRef.current = false;
        return;
      }

      setStatus('failed');
      setMessage(
        result.message ||
          'Không nhận diện được khuôn mặt'
      );

      processingRef.current = false;

      if (currentAttempt < MAX_ATTEMPTS) {
        retryTimerRef.current = setTimeout(() => {
          if (!mountedRef.current) return;

          scheduleCapture(800);
        }, RETRY_DELAY_MS);
      } else {
        setStatus('locked');
        setMessage(
          'Đã nhận diện thất bại 3 lần. Vui lòng thử lại.'
        );
      }
    } catch (error: any) {
      if (!mountedRef.current) return;

      processingRef.current = false;

      setStatus('failed');
      setMessage(
        error?.message ||
          'Không thể xử lý ảnh khuôn mặt'
      );

      if (currentAttempt < MAX_ATTEMPTS) {
        retryTimerRef.current = setTimeout(() => {
          if (!mountedRef.current) return;

          scheduleCapture(800);
        }, RETRY_DELAY_MS);
      } else {
        setStatus('locked');
      }
    }
  }, [
    attemptCount,
    cameraReady,
    clearTimers,
    openDoorByFaceImage,
    scheduleCapture,
  ]);

  const handleCameraReady = () => {
    setCameraReady(true);
    setStatus('camera_ready');
    setMessage('Camera đã sẵn sàng');
  };

  useEffect(() => {
    if (
      permission?.granted &&
      cameraReady &&
      attemptCount === 0 &&
      !processingRef.current
    ) {
      scheduleCapture();
    }
  }, [
    permission?.granted,
    cameraReady,
    attemptCount,
    scheduleCapture,
  ]);

  const handleRetry = () => {
    clearTimers();
    processingRef.current = false;
    setAttemptCount(0);
    setStatus('preparing');
    setMessage(
      'Đưa khuôn mặt vào giữa khung và nhìn thẳng camera.'
    );

    setTimeout(() => {
      scheduleCapture();
    }, 300);
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'success':
        return 'checkmark-circle';
      case 'failed':
      case 'locked':
        return 'alert-circle';
      case 'verifying':
      case 'capturing':
      case 'preparing':
        return 'scan-circle-outline';
      default:
        return 'camera-outline';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'success':
        return '#42F5E8';
      case 'failed':
      case 'locked':
        return '#FF6B6B';
      default:
        return '#FFFFFF';
    }
  };

  if (!permission) {
    return (
      <View style={styles.permissionScreen}>
        <ActivityIndicator
          size="large"
          color="#42F5E8"
        />

        <Text style={styles.permissionText}>
          Đang kiểm tra quyền camera...
        </Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionScreen}>
        <Ionicons
          name="camera-outline"
          size={64}
          color="#42F5E8"
        />

        <Text style={styles.permissionTitle}>
          Cần quyền truy cập camera
        </Text>

        <Text style={styles.permissionText}>
          Camera trước được sử dụng để chụp và xác
          thực khuôn mặt mở cửa.
        </Text>

        <TouchableOpacity
          style={styles.permissionButton}
          onPress={requestPermission}
        >
          <Text style={styles.permissionButtonText}>
            Cấp quyền camera
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => router.back()}
        >
          <Text style={styles.cancelText}>
            Quay lại
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={'front' as CameraType}
        mirror
        animateShutter={false}
        onCameraReady={handleCameraReady}
      />

      <View style={styles.darkOverlay} />

      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons
            name="chevron-back"
            size={27}
            color="#42F5E8"
          />
        </TouchableOpacity>

        <View style={styles.securityBadge}>
          <Ionicons
            name="shield-checkmark-outline"
            size={17}
            color="#42F5E8"
          />

          <Text style={styles.securityText}>
            Bảo mật khuôn mặt
          </Text>
        </View>
      </View>

      <View style={styles.header}>
        <Text style={styles.brand}>
          ⌂ Smart Door
        </Text>

        <Text style={styles.title}>
          Nhận diện khuôn mặt
        </Text>

        <Text style={styles.subtitle}>
          Hệ thống sẽ tự động chụp và xác thực khi
          camera sẵn sàng.
        </Text>
      </View>

      <View style={styles.faceGuideContainer}>
        <View
          style={[
            styles.faceGuide,
            status === 'success' &&
              styles.faceGuideSuccess,
            (status === 'failed' ||
              status === 'locked') &&
              styles.faceGuideFailed,
          ]}
        >
          <View
            style={[
              styles.corner,
              styles.cornerTopLeft,
            ]}
          />

          <View
            style={[
              styles.corner,
              styles.cornerTopRight,
            ]}
          />

          <View
            style={[
              styles.corner,
              styles.cornerBottomLeft,
            ]}
          />

          <View
            style={[
              styles.corner,
              styles.cornerBottomRight,
            ]}
          />

          {(status === 'capturing' ||
            status === 'verifying') && (
            <View style={styles.processingOverlay}>
              <ActivityIndicator
                size="large"
                color="#42F5E8"
              />
            </View>
          )}

          {status === 'success' && (
            <View style={styles.resultOverlay}>
              <Ionicons
                name="checkmark-circle"
                size={78}
                color="#42F5E8"
              />
            </View>
          )}
        </View>
      </View>

      <View style={styles.bottomPanel}>
        <View style={styles.statusRow}>
          <Ionicons
            name={getStatusIcon()}
            size={25}
            color={getStatusColor()}
          />

          <View style={styles.statusContent}>
            <Text
              style={[
                styles.statusTitle,
                { color: getStatusColor() },
              ]}
            >
              {status === 'success'
                ? 'Xác thực thành công'
                : status === 'verifying'
                  ? 'Đang xác thực'
                  : status === 'capturing'
                    ? 'Đang chụp ảnh'
                    : status === 'locked'
                      ? 'Tạm dừng nhận diện'
                      : 'Sẵn sàng nhận diện'}
            </Text>

            <Text style={styles.statusMessage}>
              {message}
            </Text>
          </View>
        </View>

        <View style={styles.attemptRow}>
          <Text style={styles.attemptText}>
            Số lần thử: {attemptCount}/{MAX_ATTEMPTS}
          </Text>

          <Text style={styles.attemptText}>
            Lỗi hệ thống: {faceFailCount}/3
          </Text>
        </View>

        {(status === 'failed' ||
          status === 'locked') && (
          <TouchableOpacity
            style={styles.retryButton}
            onPress={handleRetry}
          >
            <Ionicons
              name="refresh"
              size={19}
              color="#001E1A"
            />

            <Text style={styles.retryText}>
              Thử nhận diện lại
            </Text>
          </TouchableOpacity>
        )}

        {status === 'success' && (
          <TouchableOpacity
            style={styles.doneButton}
            onPress={() => router.replace('/home')}
          >
            <Text style={styles.doneText}>
              Trở về trang chủ
            </Text>
          </TouchableOpacity>
        )}

        <Text style={styles.note}>
          Không cần nhấn nút chụp. Giữ khuôn mặt nằm
          trong khung và tránh ngược sáng.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000000',
  },

  darkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 12, 10, 0.25)',
  },

  topBar: {
    position: 'absolute',
    top: 56,
    left: 20,
    right: 20,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  backButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 28, 24, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(66, 245, 232, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  securityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(0, 36, 31, 0.90)',
    borderWidth: 1,
    borderColor: 'rgba(66, 245, 232, 0.28)',
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },

  securityText: {
    color: '#DFFFFB',
    fontSize: 12,
    fontWeight: '800',
  },

  header: {
    position: 'absolute',
    top: 125,
    left: 24,
    right: 24,
    zIndex: 5,
  },

  brand: {
    color: '#42F5E8',
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 12,
  },

  title: {
    color: '#FFFFFF',
    fontSize: 31,
    fontWeight: '900',
  },

  subtitle: {
    color: '#D2E4E1',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    maxWidth: 330,
  },

  faceGuideContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
    paddingBottom: 185,
  },

  faceGuide: {
    width: 252,
    height: 330,
    borderRadius: 130,
    borderWidth: 2,
    borderColor: 'rgba(66, 245, 232, 0.75)',
    backgroundColor: 'rgba(0, 24, 20, 0.06)',
    overflow: 'hidden',
  },

  faceGuideSuccess: {
    borderColor: '#42F5E8',
    borderWidth: 4,
  },

  faceGuideFailed: {
    borderColor: '#FF6B6B',
  },

  corner: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderColor: '#42F5E8',
  },

  cornerTopLeft: {
    top: 19,
    left: 19,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 12,
  },

  cornerTopRight: {
    top: 19,
    right: 19,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 12,
  },

  cornerBottomLeft: {
    bottom: 19,
    left: 19,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 12,
  },

  cornerBottomRight: {
    right: 19,
    bottom: 19,
    borderRightWidth: 4,
    borderBottomWidth: 4,
    borderBottomRightRadius: 12,
  },

  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 31, 27, 0.42)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  resultOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 47, 40, 0.62)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  bottomPanel: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 24,
    backgroundColor: 'rgba(0, 34, 29, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(66, 245, 232, 0.25)',
    borderRadius: 28,
    padding: 19,
  },

  statusRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },

  statusContent: {
    flex: 1,
  },

  statusTitle: {
    fontSize: 17,
    fontWeight: '900',
  },

  statusMessage: {
    color: '#B7CAC6',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
  },

  attemptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
  },

  attemptText: {
    color: '#7FA39D',
    fontSize: 11,
    fontWeight: '700',
  },

  retryButton: {
    marginTop: 15,
    backgroundColor: '#42F5E8',
    borderRadius: 16,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },

  retryText: {
    color: '#001E1A',
    fontSize: 14,
    fontWeight: '900',
  },

  doneButton: {
    marginTop: 15,
    backgroundColor: '#42F5E8',
    borderRadius: 16,
    paddingVertical: 14,
  },

  doneText: {
    color: '#001E1A',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },

  note: {
    color: '#73958F',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 13,
  },

  permissionScreen: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },

  permissionTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 22,
  },

  permissionText: {
    color: '#A8BDB9',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 12,
  },

  permissionButton: {
    width: '100%',
    backgroundColor: '#42F5E8',
    borderRadius: 18,
    paddingVertical: 16,
    marginTop: 28,
  },

  permissionButtonText: {
    color: '#001E1A',
    textAlign: 'center',
    fontWeight: '900',
    fontSize: 15,
  },

  cancelButton: {
    paddingVertical: 15,
    paddingHorizontal: 30,
    marginTop: 8,
  },

  cancelText: {
    color: '#A8BDB9',
    fontWeight: '800',
  },
});