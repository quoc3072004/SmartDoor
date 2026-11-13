import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import {
  useContext,
  useEffect,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { AuthContext } from '../contexts/AuthContext';
import * as ImageManipulator from 'expo-image-manipulator';

export default function ProfileScreen() {
  const {
    user,
    isAdmin,
    appUsers,
    usersLoading,
    logout,
    loadUsers,
    addUser,
    removeUser,
    registerUserFace,
    deleteUserFace,
  } = useContext(AuthContext);

  const [name, setName] = useState('');
  const [account, setAccount] = useState('');
  const [password, setPassword] =
    useState('123456');

  const [processingUserId, setProcessingUserId] =
    useState<number | null>(null);

  useEffect(() => {
    if (isAdmin) {
      loadUsers();
    }
  }, [isAdmin, loadUsers]);

  const handleLogout = () => {
    logout();
    router.replace('/');
  };

  const handleAddUser = async () => {
    if (!name.trim()) {
      Alert.alert(
        'Thiếu thông tin',
        'Vui lòng nhập tên người dùng.'
      );
      return;
    }

    if (!account.trim()) {
      Alert.alert(
        'Thiếu thông tin',
        'Vui lòng nhập tài khoản.'
      );
      return;
    }

    if (password.length < 6) {
      Alert.alert(
        'Mật khẩu không hợp lệ',
        'Mật khẩu phải có ít nhất 6 ký tự.'
      );
      return;
    }

    try {
      setProcessingUserId(-1);

      const result = await addUser(
        name,
        account,
        password
      );

      Alert.alert(
        result.ok ? 'Thành công' : 'Thất bại',
        result.message
      );

      if (result.ok) {
        setName('');
        setAccount('');
        setPassword('123456');
      }
    } finally {
      setProcessingUserId(null);
    }
  };

  const captureFace = async (
    userId: number
  ) => {
    const permission =
      await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        'Chưa cấp quyền',
        'Vui lòng cấp quyền camera để đăng ký khuôn mặt.'
      );
      return;
    }

    const result =
      await ImagePicker.launchCameraAsync({
        cameraType:
          ImagePicker.CameraType.front,
        allowsEditing: false,
        quality: 0.8,
      });

    if (result.canceled) return;

    const imageUri = result.assets[0]?.uri;

    if (!imageUri) {
      Alert.alert(
        'Lỗi',
        'Không lấy được ảnh khuôn mặt.'
      );
      return;
    }

    const compressedImage =
      await ImageManipulator.manipulateAsync(
        imageUri,
        [
          {
            resize: {
              width: 720,
            },
          },
        ],
        {
          compress: 0.65,
          format:
            ImageManipulator.SaveFormat.JPEG,
        }
      );

    try {
      setProcessingUserId(userId);

      const response =
        await registerUserFace(
          userId,
          compressedImage.uri
        );

      Alert.alert(
        response.ok
          ? 'Đăng ký thành công'
          : 'Đăng ký thất bại',
        response.message
      );
    } finally {
      setProcessingUserId(null);
    }
  };

  const confirmDeleteFace = (
    userId: number,
    userName: string
  ) => {
    Alert.alert(
      'Xóa khuôn mặt',
      `Bạn có chắc muốn xóa dữ liệu khuôn mặt của ${userName}?`,
      [
        {
          text: 'Hủy',
          style: 'cancel',
        },
        {
          text: 'Xóa',
          style: 'destructive',
          onPress: async () => {
            try {
              setProcessingUserId(userId);

              const result =
                await deleteUserFace(userId);

              Alert.alert(
                result.ok
                  ? 'Thành công'
                  : 'Thất bại',
                result.message
              );
            } finally {
              setProcessingUserId(null);
            }
          },
        },
      ]
    );
  };

  const confirmDeleteUser = (
    userId: number,
    userName: string
  ) => {
    Alert.alert(
      'Xóa người dùng',
      `Xóa ${userName} và dữ liệu khuôn mặt liên quan?`,
      [
        {
          text: 'Hủy',
          style: 'cancel',
        },
        {
          text: 'Xóa',
          style: 'destructive',
          onPress: async () => {
            try {
              setProcessingUserId(userId);

              const result =
                await removeUser(userId);

              Alert.alert(
                result.ok
                  ? 'Thành công'
                  : 'Thất bại',
                result.message
              );
            } finally {
              setProcessingUserId(null);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons
            name="chevron-back"
            size={26}
            color="#42F5E8"
          />
        </TouchableOpacity>

        <Text style={styles.logo}>
          ⌂ Smart Door
        </Text>

        <Text style={styles.title}>
          Cài đặt
        </Text>

        <Text style={styles.subTitle}>
          Quản lý tài khoản và khuôn mặt của
          các thành viên trong gia đình.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            Thông tin tài khoản
          </Text>

          <View style={styles.infoRow}>
            <Text style={styles.label}>
              Tên người dùng
            </Text>

            <Text style={styles.value}>
              {user?.fullName ||
                'Không xác định'}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.label}>
              Tài khoản
            </Text>

            <Text style={styles.value}>
              {user?.account ||
                'Không xác định'}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.label}>
              Quyền truy cập
            </Text>

            <Text style={styles.value}>
              {isAdmin
                ? 'Quản trị viên'
                : 'Người dùng'}
            </Text>
          </View>
        </View>

        {isAdmin && (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                Thêm thành viên
              </Text>

              <TextInput
                style={styles.input}
                placeholder="Tên thành viên"
                placeholderTextColor="#7C928E"
                value={name}
                onChangeText={setName}
              />

              <TextInput
                style={styles.input}
                placeholder="Tên đăng nhập"
                placeholderTextColor="#7C928E"
                value={account}
                onChangeText={setAccount}
                autoCapitalize="none"
              />

              <TextInput
                style={styles.input}
                placeholder="Mật khẩu ban đầu"
                placeholderTextColor="#7C928E"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />

              <TouchableOpacity
                style={[
                  styles.addButton,
                  processingUserId === -1 &&
                    styles.disabledButton,
                ]}
                onPress={handleAddUser}
                disabled={
                  processingUserId !== null
                }
              >
                {processingUserId === -1 ? (
                  <ActivityIndicator
                    color="#001E1A"
                  />
                ) : (
                  <Text style={styles.addText}>
                    Thêm thành viên
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <Text style={styles.cardTitle}>
                  Thành viên gia đình
                </Text>

                <TouchableOpacity
                  style={styles.refreshButton}
                  onPress={loadUsers}
                  disabled={usersLoading}
                >
                  <Ionicons
                    name="refresh"
                    size={18}
                    color="#42F5E8"
                  />
                </TouchableOpacity>
              </View>

              {usersLoading &&
              appUsers.length === 0 ? (
                <View style={styles.loadingBox}>
                  <ActivityIndicator
                    color="#42F5E8"
                  />

                  <Text
                    style={styles.loadingText}
                  >
                    Đang tải người dùng...
                  </Text>
                </View>
              ) : appUsers.length === 0 ? (
                <Text style={styles.emptyText}>
                  Chưa có người dùng.
                </Text>
              ) : (
                appUsers.map(item => {
                  const processing =
                    processingUserId === item.id;

                  return (
                    <View
                      key={item.id}
                      style={styles.userItem}
                    >
                      <View style={styles.avatar}>
                        <Ionicons
                          name="person"
                          size={20}
                          color="#42F5E8"
                        />
                      </View>

                      <View style={styles.userInfo}>
                        <Text
                          style={styles.userName}
                        >
                          {item.name}
                        </Text>

                        <Text
                          style={
                            styles.userAccount
                          }
                        >
                          {item.account}
                        </Text>

                        <Text
                          style={[
                            styles.embedding,
                            item.hasEmbedding &&
                              styles.embeddingActive,
                          ]}
                        >
                          {item.hasEmbedding
                            ? 'Đã đăng ký khuôn mặt'
                            : 'Chưa đăng ký khuôn mặt'}
                        </Text>

                        {!item.isActive && (
                          <Text
                            style={
                              styles.inactiveText
                            }
                          >
                            Tài khoản đã bị khóa
                          </Text>
                        )}
                      </View>

                      {processing ? (
                        <ActivityIndicator
                          color="#42F5E8"
                        />
                      ) : (
                        <View
                          style={styles.actions}
                        >
                          <TouchableOpacity
                            style={
                              styles.faceButton
                            }
                            onPress={() =>
                              captureFace(
                                item.id
                              )
                            }
                          >
                            <Text
                              style={
                                styles.faceButtonText
                              }
                            >
                              {item.hasEmbedding
                                ? 'Cập nhật mặt'
                                : 'Đăng ký mặt'}
                            </Text>
                          </TouchableOpacity>

                          {item.hasEmbedding && (
                            <TouchableOpacity
                              style={
                                styles.removeFaceButton
                              }
                              onPress={() =>
                                confirmDeleteFace(
                                  item.id,
                                  item.name
                                )
                              }
                            >
                              <Text
                                style={
                                  styles.removeFaceText
                                }
                              >
                                Xóa mặt
                              </Text>
                            </TouchableOpacity>
                          )}

                          {item.id !== user?.id && (
                            <TouchableOpacity
                              style={
                                styles.deleteButton
                              }
                              onPress={() =>
                                confirmDeleteUser(
                                  item.id,
                                  item.name
                                )
                              }
                            >
                              <Text
                                style={
                                  styles.deleteText
                                }
                              >
                                Xóa user
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </View>
          </>
        )}

        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
        >
          <Ionicons
            name="log-out-outline"
            size={20}
            color="#FF6B6B"
          />

          <Text style={styles.logoutText}>
            Đăng xuất
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000000',
  },

  content: {
    paddingTop: 64,
    paddingHorizontal: 22,
    paddingBottom: 40,
  },

  backButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#132824',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },

  logo: {
    color: '#42F5E8',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 26,
  },

  title: {
    color: '#FFFFFF',
    fontSize: 38,
    fontWeight: '900',
  },

  subTitle: {
    color: '#A8BDB9',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
    marginBottom: 28,
  },

  card: {
    backgroundColor: '#002F28',
    borderWidth: 1,
    borderColor: '#075F55',
    borderRadius: 28,
    padding: 20,
    marginBottom: 18,
  },

  cardTitle: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '900',
    marginBottom: 18,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#133B35',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },

  infoRow: {
    backgroundColor: '#16332E',
    borderWidth: 1,
    borderColor: '#244A43',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
  },

  label: {
    color: '#A8BDB9',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },

  value: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
  },

  input: {
    backgroundColor: '#16332E',
    borderWidth: 1,
    borderColor: '#244A43',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 15,
    color: '#FFFFFF',
    fontSize: 15,
    marginBottom: 12,
  },

  addButton: {
    backgroundColor: '#42F5E8',
    borderRadius: 18,
    paddingVertical: 16,
    marginTop: 4,
  },

  disabledButton: {
    opacity: 0.55,
  },

  addText: {
    color: '#001E1A',
    textAlign: 'center',
    fontWeight: '900',
    fontSize: 15,
  },

  loadingBox: {
    paddingVertical: 28,
    alignItems: 'center',
    gap: 12,
  },

  loadingText: {
    color: '#A8BDB9',
  },

  emptyText: {
    color: '#A8BDB9',
    textAlign: 'center',
    paddingVertical: 18,
  },

  userItem: {
    backgroundColor: '#062A25',
    borderWidth: 1,
    borderColor: '#164B43',
    padding: 14,
    borderRadius: 20,
    marginBottom: 12,
  },

  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#10564F',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },

  userInfo: {
    marginBottom: 12,
  },

  userName: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 16,
  },

  userAccount: {
    color: '#A8BDB9',
    marginTop: 4,
    fontSize: 13,
  },

  embedding: {
    color: '#FF8989',
    marginTop: 6,
    fontWeight: '800',
    fontSize: 12,
  },

  embeddingActive: {
    color: '#42F5E8',
  },

  inactiveText: {
    color: '#FCA5A5',
    marginTop: 5,
    fontWeight: '800',
    fontSize: 12,
  },

  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  faceButton: {
    backgroundColor: '#42F5E8',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },

  faceButtonText: {
    color: '#001E1A',
    fontWeight: '900',
    fontSize: 12,
  },

  removeFaceButton: {
    backgroundColor: '#352D16',
    borderWidth: 1,
    borderColor: '#675724',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },

  removeFaceText: {
    color: '#FDE68A',
    fontWeight: '900',
    fontSize: 12,
  },

  deleteButton: {
    backgroundColor: '#381717',
    borderWidth: 1,
    borderColor: '#682929',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },

  deleteText: {
    color: '#FCA5A5',
    fontWeight: '900',
    fontSize: 12,
  },

  logoutButton: {
    backgroundColor: '#2A1414',
    borderWidth: 1,
    borderColor: '#5E2525',
    paddingVertical: 17,
    borderRadius: 18,
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },

  logoutText: {
    color: '#FF6B6B',
    textAlign: 'center',
    fontWeight: '900',
    fontSize: 15,
  },
});