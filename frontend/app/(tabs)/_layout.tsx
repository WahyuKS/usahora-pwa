import { Tabs } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { Platform } from "react-native";

import { Icon, type IconName } from "@/src/components/ui";
import { usesNativeTabs } from "@/src/navigation";
import { fonts, useTheme } from "@/src/theme";

const TABS: { name: string; title: string; icon: IconName; sf: string }[] = [
  { name: "index", title: "Beranda", icon: "house", sf: "house.fill" },
  { name: "pos", title: "Kasir", icon: "shopping-cart", sf: "cart.fill" },
  { name: "products", title: "Produk", icon: "package", sf: "shippingbox.fill" },
  { name: "more", title: "Lainnya", icon: "menu", sf: "square.grid.2x2.fill" },
];

export default function TabsLayout() {
  const { colors } = useTheme();
  if (usesNativeTabs) {
    return (
      <NativeTabs tintColor={colors.brandPrimary}>
        {TABS.map((t) => (
          <NativeTabs.Trigger key={t.name} name={t.name}>
            <NativeTabs.Trigger.Icon sf={t.sf as any} />
            <NativeTabs.Trigger.Label>{t.title}</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
        ))}
      </NativeTabs>
    );
  }
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, ...(Platform.OS === "web" ? { height: 64 } : {}) },
        tabBarItemStyle: { alignSelf: "center" },
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 11 },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen key={t.name} name={t.name} options={{ title: t.title, tabBarButtonTestID: `tab-${t.name}`, tabBarIcon: ({ color }) => <Icon name={t.icon} size={22} color={color as string} /> }} />
      ))}
    </Tabs>
  );
}
