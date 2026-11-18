import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { useAuth } from "@/src/auth";
import { Card, Chips, Divider, EmptyState, IconButton, ListRow, Screen } from "@/src/components/ui";
import { useDB } from "@/src/data/store";
import type { Doc } from "@/src/data/types";

import { spacing, useTheme } from "@/src/theme";

export default function Docs() {
  const db = useDB();
  const router = useRouter();
  const { colors } = useTheme();
  const { isOwner } = useAuth();
  const [cat, setCat] = useState("all");
  const docs: Doc[] = db.docs;
  const cats = [{ key: "all", label: "Semua" }, ...[...new Set(docs.map((d) => d.category))].map((c) => ({ key: c, label: c }))];
  const list = docs.filter((d) => cat === "all" || d.category === cat).sort((a, b) => a.title.localeCompare(b.title));
  return (
    <Screen title="Dokumen & SOP" subtitle="Template yang bisa dibaca dan diedit" testID="docs-screen"
      right={isOwner && <IconButton icon="plus" bg={colors.brandPrimary} color={colors.onBrandPrimary} onPress={() => router.push("/doc/new")} testID="docs-add-button" label="Dokumen baru" />}
      headerExtra={<Chips options={cats} value={cat} onChange={setCat} testIDPrefix="docs-category" style={{ marginHorizontal: -spacing.sm }} />}>
      {list.length === 0 ? <EmptyState icon="book-open" title="Belum ada dokumen" message="Buat SOP atau checklist untuk usaha Anda." action="Dokumen baru" onAction={() => router.push("/doc/new")} /> : (
        <Card style={{ paddingVertical: spacing.xs }}>
          {list.map((d, i) => (
            <View key={d.id}>
              {i ? <Divider /> : null}
              <ListRow testID={`doc-row-${i}`} icon={d.category === "Checklist" ? "list-checks" as any : "book-open"} title={d.title} subtitle={d.category} onPress={() => router.push(`/doc/${d.id}`)} />
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}
