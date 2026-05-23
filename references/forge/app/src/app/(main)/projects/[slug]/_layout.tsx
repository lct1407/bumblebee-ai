import { Stack } from 'expo-router';
import { useLocalSearchParams } from 'expo-router';

export default function ProjectLayout() {
  const { slug } = useLocalSearchParams<{ slug: string }>();

  return (
    <Stack
      screenOptions={{
        headerTitle: slug || 'Project',
      }}
    />
  );
}
