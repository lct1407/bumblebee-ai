import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/providers/auth-provider';

export default function SettingsScreen() {
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView className="flex-1 px-6 pt-6">
        <Text className="text-2xl font-bold mb-6">Settings</Text>

        <View className="mb-6">
          <Text className="text-sm font-semibold text-gray-500 uppercase mb-3">
            Account
          </Text>
          <View className="bg-gray-50 rounded-xl p-4">
            <Text className="text-base text-gray-700 mb-2">
              Username: {user?.username}
            </Text>
            <Text className="text-base text-gray-700">Email: {user?.email}</Text>
          </View>
        </View>

        <View className="mt-8">
          <Pressable
            className="bg-red-600 rounded-xl py-3 items-center"
            onPress={handleLogout}
          >
            <Text className="text-white font-semibold text-base">Logout</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
