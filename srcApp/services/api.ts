import * as FileSystem from 'expo-file-system/legacy';

/**
 * Quick Tunnel.
 * Mỗi lần dừng rồi chạy lại cloudflared, địa chỉ này có thể thay đổi.
 */
export const API_BASE_URL =
"https://api.quocnguyeniuh.io.vn";

type ApiOptions = RequestInit & {
  timeoutMs?: number;
};

export async function apiRequest(
  path: string,
  options: ApiOptions = {},
  token?: string | null
) {
  const { timeoutMs = 15000, ...fetchOptions } = options;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(fetchOptions.headers as Record<string, string> | undefined),
  };

  if (!(fetchOptions.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const requestUrl =
    `${API_BASE_URL}${path}`;

  console.log(
    'API REQUEST:',
    requestUrl
  );

  try {
    const response = await fetch(
    requestUrl, {
      ...fetchOptions,
      headers,
      signal: controller.signal,
    });

    const text = await response.text();
    console.log(
      'API STATUS:',
      response.status
    );

    console.log(
      'API RESPONSE:',
      text
    );

    let data: any = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = {
        success: false,
        message: text || `HTTP ${response.status}`,
      };
    }

    if (!response.ok) {
      throw new Error(
        data?.detail ||
          data?.message ||
          `Yêu cầu thất bại, mã lỗi ${response.status}`
      );
    }

    return data;
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error('Server phản hồi quá lâu. Vui lòng thử lại.');
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Gửi ảnh khuôn mặt bằng multipart/form-data.
 */
export async function uploadFaceImage(
  path: string,
  imageUri: string,
  token: string
) {
  const uri =
    imageUri.startsWith('file://') ||
    imageUri.startsWith('content://')
      ? imageUri
      : `file://${imageUri}`;

  const result = await FileSystem.uploadAsync(
    `${API_BASE_URL}${path}`,
    uri,
    {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: 'image',
      mimeType: 'image/jpeg',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    }
  );

  let data: any = null;

  try {
    data = result.body ? JSON.parse(result.body) : null;
  } catch {
    data = {
      success: false,
      message: result.body || `HTTP ${result.status}`,
    };
  }

  if (result.status < 200 || result.status >= 300) {
    throw new Error(
      data?.detail ||
        data?.message ||
        `Tải ảnh thất bại, mã lỗi ${result.status}`
    );
  }

  return data;
}