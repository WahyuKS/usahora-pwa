import { useRouter, type Href } from "expo-router";
import { View } from "react-native";

import { useAuth } from "@/src/auth";
import { BusinessAvatar } from "@/src/components/media";
import { Badge, BrandLogo, Card, Divider, ListRow, Screen, SyncPill, T, useUI, type IconName } from "@/src/components/ui";
import { billsDue } from "@/src/data/selectors";
import { useDB } from "@/src/data/store";
import { spacing } from "@/src/theme";

const CASHIER_MENU = ["/sales", "/customers", "/docs", "/hpp", "/settings"];
type Item = { title: string; sub: string; icon: IconName; href: Href; badge?: number };

export default function More() {
  const db = useDB();
  const router = useRouter();
  const { user, logout, business, isOwner, isLocal } = useAuth();
  const { confirm } = useUI();
  const due = billsDue(db).length;
  const groups: { title: string; items: Item[] }[] = [
    {
      title: "Operasional",
      items: [
        { title: "Riwayat Penjualan", sub: "Penjualan per tanggal & pelunasan", icon: "receipt", href: "/sales" },
        { title: "Penagihan", sub: "Piutang pelanggan & janji bayar", icon: "hand-coins", href: "/collections" },
        { title: "Pembelian", sub: "Pembelian barang & penerimaan stok", icon: "truck", href: "/purchases" },
        { title: "Supplier", sub: "Data pemasok", icon: "store", href: "/suppliers" },
        { title: "Pelanggan", sub: "Data, riwayat, dan piutang", icon: "users", href: "/customers" },
      ],
    },
    {
      title: "Keuangan",
      items: [
        { title: "Keuangan", sub: "Pendapatan, pengeluaran, arus kas", icon: "wallet", href: "/finance" },
        { title: "Invoice & Quotation", sub: "Buat, cetak, dan bagikan dokumen", icon: "file-text", href: "/invoices" },
        { title: "Tagihan & Pengingat", sub: "Tagihan rutin dan jatuh tempo", icon: "bell", href: "/bills", badge: due },
        { title: "Kalkulator HPP", sub: "Hitung modal dan harga jual", icon: "calculator", href: "/hpp" },
      ],
    },
    {
      title: "Lainnya",
      items: [
        { title: "Laporan", sub: "Penjualan, laba rugi, stok, ekspor", icon: "chart-column", href: "/reports" },
        { title: "Riwayat Aktivitas", sub: "Semua catatan per tanggal", icon: "history", href: "/activities" },
        { title: "Dokumen & SOP", sub: "Template SOP dan checklist", icon: "book-open", href: "/docs" },
        { title: "Pengaturan", sub: "Profil usaha dan cadangan data", icon: "settings", href: "/settings" },
        ...(isLocal ? [{ title: "Lisensi", sub: "Status lisensi perangkat ini", icon: "key-round" as IconName, href: "/license" as Href }] : []),
      ],
    },
  ];
  return (
    <Screen tab back={false} title="Lainnya" subtitle={user?.email || business?.name} right={<SyncPill />} testID="more-screen">
      <Card style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.lg }} testID="profile-card" onPress={isOwner ? () => router.push("/profile") : undefined}>
        <BusinessAvatar business={business} size={56} testID="profile-card-logo" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T v="h3" numberOfLines={1} testID="profile-business-name">{business?.name ?? "USAHORA"}</T>
          <T v="caption" numberOfLines={1}>{user?.name} · {isOwner ? "Pemilik" : "Kasir"}</T>
        </View>
        <Badge label={isOwner ? "Pemilik" : "Kasir"} tone={isOwner ? "brand" : "neutral"} testID="profile-role-badge" />
      </Card>
      {groups.map((g) => ({ ...g, items: isOwner ? g.items : g.items.filter((it) => CASHIER_MENU.includes(String(it.href))) })).filter((g) => g.items.length).map((g) => (
        <View key={g.title} style={{ marginBottom: spacing.lg }}>
          <T v="caption" weight="semibold" style={{ marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.6 }}>{g.title}</T>
          <Card style={{ paddingVertical: spacing.xs }}>
            {g.items.map((it, i) => (
              <View key={it.title}>
                {i ? <Divider /> : null}
                <ListRow icon={it.icon} title={it.title} subtitle={it.sub} onPress={() => router.push(it.href)} testID={`menu-${String(it.href).slice(1)}`}
                  rightSub={it.badge ? <Badge label={`${it.badge} jatuh tempo`} tone="warning" /> : undefined} />
              </View>
            ))}
          </Card>
        </View>
      ))}
      <Card style={{ paddingVertical: spacing.xs }}>
        <ListRow icon="log-out" tone="error" title="Keluar" subtitle="Data lokal tetap tersimpan di perangkat ini" testID="menu-logout"
          onPress={async () => {
            const pending = db.outbox.length;
            const ok = await confirm({ title: "Keluar dari akun?", message: pending ? `Masih ada ${pending} perubahan yang belum tersinkron. Perubahan tetap tersimpan di perangkat ini dan akan disinkronkan saat Anda masuk kembali.` : "Anda bisa masuk kembali kapan saja.", confirmText: "Keluar", danger: true });
            if (ok) logout();
          }} />
      </Card>
      <View style={{ alignItems: "center", marginTop: spacing.xl, gap: spacing.xs }}>
        <BrandLogo height={26} plate align="center" />
        <T v="caption" align="center">Manage smarter. Grow further.</T>
      </View>
    </Screen>
  );
}
