import {
  createContext,
  ReactNode,
  useCallback,
  useMemo,
  useState,
} from 'react';
import { apiRequest, uploadFaceImage } from '../services/api';

type Role = 'admin' | 'user';
type DoorStatus = 'OPEN' | 'CLOSED';

export type User = {
  id: number;
  fullName: string;
  account: string;
  role: Role;
  isActive: boolean;
  hasFace: boolean;
};

export type AppUser = {
  id: number;
  name: string;
  account: string;
  role: Role;
  isActive: boolean;
  hasEmbedding: boolean;
};

export type AccessLog = {
  id: string;
  time: string;
  title: string;
  detail: string;
  type: 'success' | 'failed' | 'warning' | 'info';
};

export type QRToken = {
  id: string;
  token: string;
  guestName: string;
  expiredAt: number;
  used: boolean;
  usedAt?: number | null;
  qrImageUrl?: string;
};

type ActionResult = {
  ok: boolean;
  message: string;
};

type AuthContextType = {
  user: User | null;
  token: string | null;
  isAdmin: boolean;

  doorStatus: DoorStatus;
  accessLogs: AccessLog[];
  qrTokens: QRToken[];
  appUsers: AppUser[];
  alerts: string[];

  faceFailCount: number;
  qrFailCount: number;
  usersLoading: boolean;

  login: (account: string, password: string) => Promise<ActionResult>;
  logout: () => void;

  refreshDoorStatus: () => Promise<void>;
  loadHistory: () => Promise<void>;

  openDoorByFaceImage: (
    imageUri: string
  ) => Promise<ActionResult>;

  loadUsers: () => Promise<void>;

  addUser: (
    name: string,
    account: string,
    password: string
  ) => Promise<ActionResult>;

  removeUser: (id: number) => Promise<ActionResult>;

  registerUserFace: (
    userId: number,
    imageUri: string
  ) => Promise<ActionResult>;

  deleteUserFace: (
    userId: number
  ) => Promise<ActionResult>;

  createGuestQR: (
    guestName: string,
    minutes: number
  ) => Promise<QRToken>;

  cleanupExpiredQR: () => Promise<number>;

  closeDoor: () => Promise<void>;
};

const nowTime = () =>
  new Date().toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  });

const makeId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;

function logTypeFromResult(
  result?: string
): AccessLog['type'] {
  const normalized = String(result || '').toUpperCase();

  if (normalized === 'SUCCESS') return 'success';
  if (
    normalized === 'FAIL' ||
    normalized === 'FAILED' ||
    normalized === 'ERROR'
  ) {
    return 'failed';
  }

  return 'info';
}

function formatHistoryTitle(
  method?: string,
  action?: string,
  result?: string
) {
  const methodMap: Record<string, string> = {
    AUTH: 'Đăng nhập',
    LOGIN: 'Đăng nhập',
    FACE: 'Khuôn mặt',
    FACE_REGISTER: 'Đăng ký khuôn mặt',
    QR: 'Mã QR',
    USER: 'Người dùng',
    ESP32: 'Thiết bị',
    DOOR: 'Cửa',
  };

  const actionMap: Record<string, string> = {
    LOGIN: 'đăng nhập',
    UNLOCK: 'mở cửa',
    CREATE_QR: 'tạo mã',
    CREATE_USER: 'thêm mới',
    UPDATE_USER: 'cập nhật',
    DELETE_USER: 'xóa',
    REGISTER_FACE: 'đăng ký',
    DELETE_FACE: 'xóa khuôn mặt',
    DOOR_STATUS: 'cập nhật trạng thái',
  };

  const resultMap: Record<string, string> = {
    SUCCESS: 'thành công',
    FAIL: 'thất bại',
    FAILED: 'thất bại',
    ERROR: 'lỗi',
  };

  const methodText =
    methodMap[String(method || '').toUpperCase()] ||
    method ||
    'Hoạt động';

  const actionText =
    actionMap[String(action || '').toUpperCase()] || '';

  const resultText =
    resultMap[String(result || '').toUpperCase()] ||
    result ||
    '';

  return [methodText, actionText, resultText]
    .filter(Boolean)
    .join(' ');
}

function mapServerUser(raw: any): User {
  return {
    id: Number(raw?.id),
    fullName:
      raw?.name ||
      raw?.fullName ||
      raw?.username ||
      'Người dùng',
    account:
      raw?.username ||
      raw?.account ||
      '',
    role: raw?.role === 'admin' ? 'admin' : 'user',
    isActive:
      raw?.is_active !== undefined
        ? Boolean(raw.is_active)
        : true,
    hasFace: Boolean(
      raw?.has_face ?? raw?.hasFace
    ),
  };
}

function mapAppUser(raw: any): AppUser {
  return {
    id: Number(raw?.id),
    name:
      raw?.name ||
      raw?.username ||
      'Người dùng',
    account:
      raw?.username ||
      raw?.account ||
      '',
    role: raw?.role === 'admin' ? 'admin' : 'user',
    isActive:
      raw?.is_active !== undefined
        ? Boolean(raw.is_active)
        : true,
    hasEmbedding: Boolean(
      raw?.has_face ??
        raw?.hasEmbedding ??
        raw?.hasFace
    ),
  };
}

export const AuthContext =
  createContext<AuthContextType>({
    user: null,
    token: null,
    isAdmin: false,

    doorStatus: 'CLOSED',
    accessLogs: [],
    qrTokens: [],
    appUsers: [],
    alerts: [],

    faceFailCount: 0,
    qrFailCount: 0,
    usersLoading: false,

    login: async () => ({
      ok: false,
      message: 'Chưa thể đăng nhập',
    }),
    logout: () => {},

    refreshDoorStatus: async () => {},
    loadHistory: async () => {},

    openDoorByFaceImage: async () => ({
      ok: false,
      message: '',
    }),

    loadUsers: async () => {},

    addUser: async () => ({
      ok: false,
      message: '',
    }),

    removeUser: async () => ({
      ok: false,
      message: '',
    }),

    registerUserFace: async () => ({
      ok: false,
      message: '',
    }),

    deleteUserFace: async () => ({
      ok: false,
      message: '',
    }),

    createGuestQR: async () => ({
      id: '',
      token: '',
      guestName: '',
      expiredAt: 0,
      used: false,
    }),

    cleanupExpiredQR: async () => 0,

    closeDoor: async () => {},
  });

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [user, setUser] =
    useState<User | null>(null);

  const [token, setToken] =
    useState<string | null>(null);

  const [doorStatus, setDoorStatus] =
    useState<DoorStatus>('CLOSED');

  const [accessLogs, setAccessLogs] =
    useState<AccessLog[]>([]);

  const [qrTokens, setQrTokens] =
    useState<QRToken[]>([]);

  const [appUsers, setAppUsers] =
    useState<AppUser[]>([]);

  const [alerts, setAlerts] =
    useState<string[]>([]);

  const [faceFailCount, setFaceFailCount] =
    useState(0);

  const [qrFailCount, setQrFailCount] =
    useState(0);

  const [usersLoading, setUsersLoading] =
    useState(false);

  const addLocalLog = useCallback(
    (
      title: string,
      detail: string,
      type: AccessLog['type']
    ) => {
      const log: AccessLog = {
        id: makeId('log'),
        time: nowTime(),
        title,
        detail,
        type,
      };

      setAccessLogs(previous => [
        log,
        ...previous,
      ].slice(0, 50));
    },
    []
  );

  const addAlert = useCallback(
    (message: string) => {
      setAlerts(previous => [
        message,
        ...previous,
      ].slice(0, 10));

      addLocalLog(
        'Cảnh báo',
        message,
        'warning'
      );
    },
    [addLocalLog]
  );

  const login = async (
    account: string,
    password: string
  ): Promise<ActionResult> => {
    const username = account.trim();

    if (!username || !password) {
      return {
        ok: false,
        message: 'Vui lòng nhập tài khoản và mật khẩu',
      };
    }

    try {
      console.log(
        'LOGIN URL:',
        'https://api.quocnguyeniuh.io.vn/login'
      );

      const response = await apiRequest(
        '/login',
        {
          method: 'POST',
          timeoutMs: 20000,
          body: JSON.stringify({
            username,
            password,
          }),
        }
      );

      console.log('LOGIN RESPONSE:', response);

      if (!response?.success) {
        const message =
          response?.message ||
          'Sai tài khoản hoặc mật khẩu';

        addLocalLog(
          'Đăng nhập thất bại',
          message,
          'failed'
        );

        return {
          ok: false,
          message,
        };
      }

      if (!response?.token || !response?.user) {
        return {
          ok: false,
          message:
            'Server trả về dữ liệu đăng nhập không hợp lệ',
        };
      }

      const loggedUser = mapServerUser(
        response.user
      );

      setToken(response.token);
      setUser(loggedUser);

      addLocalLog(
        'Đăng nhập thành công',
        `${loggedUser.fullName} đăng nhập thành công`,
        'success'
      );

      return {
        ok: true,
        message:
          response.message ||
          'Đăng nhập thành công',
      };
    } catch (error: any) {
      const rawMessage =
        error?.message ||
        'Không xác định được lỗi';

      console.error(
        'LOGIN NETWORK ERROR:',
        rawMessage
      );

      let message =
        'Không thể kết nối tới máy chủ';

      if (
        rawMessage.includes(
          'Server phản hồi quá lâu'
        )
      ) {
        message =
          'Máy chủ phản hồi quá lâu. Hãy kiểm tra Internet và thử lại.';
      } else if (
        rawMessage.includes(
          'Network request failed'
        ) ||
        rawMessage.includes('Failed to fetch')
      ) {
        message =
          'Không có kết nối tới máy chủ. Hãy kiểm tra Wi-Fi, dữ liệu di động hoặc Cloudflare Tunnel.';
      } else {
        message = rawMessage;
      }

      addAlert(message);

      return {
        ok: false,
        message,
      };
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    setDoorStatus('CLOSED');
    setAccessLogs([]);
    setQrTokens([]);
    setAppUsers([]);
    setAlerts([]);
    setFaceFailCount(0);
    setQrFailCount(0);
  };

  const refreshDoorStatus =
    useCallback(async () => {
      try {
        const response = await apiRequest(
          '/door/status'
        );

        if (response?.success) {
          setDoorStatus(
            String(response.status).toLowerCase() ===
              'open'
              ? 'OPEN'
              : 'CLOSED'
          );
        }
      } catch (error: any) {
        addAlert(
          `Không lấy được trạng thái cửa: ${
            error?.message ||
            'Lỗi không xác định'
          }`
        );
      }
    }, [addAlert]);

  const loadHistory =
    useCallback(async () => {
      if (!token) return;

      try {
        const response = await apiRequest(
          '/history',
          {
            method: 'GET',
          },
          token
        );

        if (!response?.success) return;

        const logs: AccessLog[] = (
          response.data || []
        ).map((item: any) => ({
          id: String(item.id),
          time: item.created_at
            ? new Date(
                item.created_at
              ).toLocaleString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
                day: '2-digit',
                month: '2-digit',
              })
            : nowTime(),
          title: formatHistoryTitle(
            item.method,
            item.action,
            item.result
          ),
          detail:
            item.message ||
            'Không có nội dung',
          type: logTypeFromResult(
            item.result
          ),
        }));

        setAccessLogs(logs);
      } catch (error: any) {
        addAlert(
          `Không tải được lịch sử: ${
            error?.message ||
            'Lỗi không xác định'
          }`
        );
      }
    }, [token, addAlert]);

  const loadUsers = useCallback(async () => {
    if (!token) return;

    try {
      setUsersLoading(true);

      const response = await apiRequest(
        '/users',
        {
          method: 'GET',
        },
        token
      );

      if (!response?.success) {
        throw new Error(
          response?.message ||
            'Không tải được người dùng'
        );
      }

      setAppUsers(
        (response.data || []).map(mapAppUser)
      );
    } catch (error: any) {
      addAlert(
        `Không tải được danh sách người dùng: ${
          error?.message ||
          'Lỗi không xác định'
        }`
      );
    } finally {
      setUsersLoading(false);
    }
  }, [token, addAlert]);

  const addUser = async (
    name: string,
    account: string,
    password: string
  ): Promise<ActionResult> => {
    if (!token) {
      return {
        ok: false,
        message: 'Bạn chưa đăng nhập',
      };
    }

    try {
      const response = await apiRequest(
        '/users',
        {
          method: 'POST',
          body: JSON.stringify({
            name: name.trim(),
            username: account.trim(),
            password,
          }),
        },
        token
      );

      if (!response?.success) {
        return {
          ok: false,
          message:
            response?.message ||
            'Không thể thêm người dùng',
        };
      }

      await loadUsers();

      addLocalLog(
        'Thêm người dùng',
        response.message,
        'success'
      );

      return {
        ok: true,
        message: response.message,
      };
    } catch (error: any) {
      return {
        ok: false,
        message:
          error?.message ||
          'Không thể thêm người dùng',
      };
    }
  };

  const removeUser = async (
    id: number
  ): Promise<ActionResult> => {
    if (!token) {
      return {
        ok: false,
        message: 'Bạn chưa đăng nhập',
      };
    }

    try {
      const response = await apiRequest(
        `/users/${id}`,
        {
          method: 'DELETE',
        },
        token
      );

      if (!response?.success) {
        return {
          ok: false,
          message:
            response?.message ||
            'Không thể xóa người dùng',
        };
      }

      setAppUsers(previous =>
        previous.filter(item => item.id !== id)
      );

      return {
        ok: true,
        message: response.message,
      };
    } catch (error: any) {
      return {
        ok: false,
        message:
          error?.message ||
          'Không thể xóa người dùng',
      };
    }
  };

  const registerUserFace = async (
    userId: number,
    imageUri: string
  ): Promise<ActionResult> => {
    if (!token) {
      return {
        ok: false,
        message: 'Bạn chưa đăng nhập',
      };
    }

    try {
      const response = await uploadFaceImage(
        `/users/${userId}/face`,
        imageUri,
        token
      );

      if (!response?.success) {
        return {
          ok: false,
          message:
            response?.message ||
            'Đăng ký khuôn mặt thất bại',
        };
      }

      setAppUsers(previous =>
        previous.map(item =>
          item.id === userId
            ? {
                ...item,
                hasEmbedding: true,
              }
            : item
        )
      );

      return {
        ok: true,
        message: response.message,
      };
    } catch (error: any) {
      return {
        ok: false,
        message:
          error?.message ||
          'Đăng ký khuôn mặt thất bại',
      };
    }
  };

  const deleteUserFace = async (
    userId: number
  ): Promise<ActionResult> => {
    if (!token) {
      return {
        ok: false,
        message: 'Bạn chưa đăng nhập',
      };
    }

    try {
      const response = await apiRequest(
        `/users/${userId}/face`,
        {
          method: 'DELETE',
        },
        token
      );

      if (!response?.success) {
        return {
          ok: false,
          message:
            response?.message ||
            'Không thể xóa khuôn mặt',
        };
      }

      setAppUsers(previous =>
        previous.map(item =>
          item.id === userId
            ? {
                ...item,
                hasEmbedding: false,
              }
            : item
        )
      );

      return {
        ok: true,
        message: response.message,
      };
    } catch (error: any) {
      return {
        ok: false,
        message:
          error?.message ||
          'Không thể xóa khuôn mặt',
      };
    }
  };

  const openDoorByFaceImage = async (
    imageUri: string
  ): Promise<ActionResult> => {
    if (!token) {
      return {
        ok: false,
        message: 'Bạn chưa đăng nhập',
      };
    }

    try {
      const response = await uploadFaceImage(
        '/face/open-door',
        imageUri,
        token
      );

      if (response?.success) {
        setDoorStatus('OPEN');
        setFaceFailCount(0);

        addLocalLog(
          'Mở cửa bằng khuôn mặt',
          response.message,
          'success'
        );

        return {
          ok: true,
          message: response.message,
        };
      }

      const nextFailCount =
        faceFailCount + 1;

      setFaceFailCount(nextFailCount);

      if (nextFailCount >= 3) {
        addAlert(
          'Nhận diện khuôn mặt thất bại 3 lần liên tiếp'
        );
      }

      return {
        ok: false,
        message:
          response?.message ||
          'Không nhận diện được khuôn mặt',
      };
    } catch (error: any) {
      const nextFailCount =
        faceFailCount + 1;

      setFaceFailCount(nextFailCount);

      return {
        ok: false,
        message:
          error?.message ||
          'Không nhận diện được khuôn mặt',
      };
    }
  };

  const createGuestQR = async (
    guestName: string,
    minutes: number
  ): Promise<QRToken> => {
    if (!token) {
      throw new Error('Bạn chưa đăng nhập');
    }

    const response = await apiRequest(
      '/qr/generate',
      {
        method: 'POST',
        body: JSON.stringify({
          guest_name:
            guestName.trim() || 'Khách',
          expires_in_minutes: minutes,
        }),
      },
      token
    );

    if (!response?.success || !response?.qr) {
      throw new Error(
        response?.message ||
          'Tạo mã QR thất bại'
      );
    }

    const rawQR = response.qr;

    const qr: QRToken = {
      id: String(rawQR.id),
      token: rawQR.token,
      guestName:
        rawQR.guest_name || 'Khách',
      expiredAt: new Date(
        rawQR.expired_at
      ).getTime(),
      used: Boolean(rawQR.used),
      usedAt: rawQR.used_at
        ? new Date(rawQR.used_at).getTime()
        : null,
      qrImageUrl: rawQR.qr_image_url,
    };

    setQrTokens(previous => [
      qr,
      ...previous,
    ]);

    return qr;
  };

  const cleanupExpiredQR =
    async (): Promise<number> => {
      if (!token) return 0;

      try {
        const response = await apiRequest(
          '/qr/expired',
          {
            method: 'DELETE',
          },
          token
        );

        const now = Date.now();

        setQrTokens(previous =>
          previous.filter(
            item =>
              item.used ||
              item.expiredAt >= now
          )
        );

        return Number(
          response?.deleted_count || 0
        );
      } catch {
        return 0;
      }
    };

  const closeDoor = async () => {
    /*
     * Khóa điện tự trở lại sau 5 giây do ESP32 xử lý.
     * App không cần gọi endpoint đóng cửa thủ công.
     */
    setDoorStatus('CLOSED');
  };

  const value = useMemo(
    () => ({
      user,
      token,
      isAdmin: user?.role === 'admin',

      doorStatus,
      accessLogs,
      qrTokens,
      appUsers,
      alerts,

      faceFailCount,
      qrFailCount,
      usersLoading,

      login,
      logout,

      refreshDoorStatus,
      loadHistory,

      openDoorByFaceImage,

      loadUsers,
      addUser,
      removeUser,
      registerUserFace,
      deleteUserFace,

      createGuestQR,
      cleanupExpiredQR,

      closeDoor,
    }),
    [
      user,
      token,
      doorStatus,
      accessLogs,
      qrTokens,
      appUsers,
      alerts,
      faceFailCount,
      qrFailCount,
      usersLoading,
      refreshDoorStatus,
      loadHistory,
      loadUsers,
      addAlert,
      addLocalLog,
    ]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}