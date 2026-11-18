import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";

import { Button, Field, IconButton, Screen, Segment, useUI } from "@/src/components/ui";
import { getState, remove, upsert } from "@/src/data/store";
import type { Doc } from "@/src/data/types";
import { printHtml, wrapHtml, html as esc } from "@/src/lib/export";
import { useTheme } from "@/src/theme";

const CATS = ["SOP", "Checklist", "Template", "Administrasi"];

export default function DocEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { toast, confirm } = useUI();
  const { colors } = useTheme();
  const ex: Doc | undefined = id !== "new" ? getState().docs.find((d: Doc) => d.id === id) : undefined;
  const [title, setTitle] = useState(ex?.title ?? "");
  const [category, setCategory] = useState(ex?.category ?? "SOP");
  const [content, setContent] = useState(ex?.content ?? "");

  const save = () => {
    if (!title.trim()) return toast("Judul wajib diisi", "error");
    upsert("docs", { id: ex?.id, title: title.trim(), category, content });
    toast("Dokumen disimpan");
    router.back();
  };

  return (
    <Screen title={ex ? "Edit dokumen" : "Dokumen baru"} testID="doc-editor-screen"
      right={<>
        <IconButton icon="printer" onPress={() => printHtml(wrapHtml(title, `<h1>${esc(title)}</h1><p class="muted">${esc(category)}</p><div style="white-space:pre-wrap;font-size:13px;line-height:1.6;margin-top:16px">${esc(content)}</div>`)).catch(() => toast("Gagal mencetak", "error"))} testID="doc-print-button" label="Cetak" />
        {ex ? <IconButton icon={"trash-2" as any} color={colors.error} testID="doc-delete-button" label="Hapus" onPress={async () => {
          if (await confirm({ title: "Hapus dokumen?", message: `"${ex.title}" akan dihapus permanen.`, danger: true, confirmText: "Hapus" })) { remove("docs", ex.id); toast("Dokumen dihapus"); router.back(); }
        }} /> : null}
      </>}
      footer={<Button title="Simpan" icon="check" size="lg" onPress={save} testID="doc-save-button" />}>
      <Field label="Judul" value={title} onChangeText={setTitle} testID="doc-title-input" />
      <Segment options={CATS.map((c) => ({ key: c, label: c }))} value={category} onChange={setCategory} testIDPrefix="doc-category" />
      <Field label="Isi dokumen" value={content} onChangeText={setContent} multiline testID="doc-content-input" style={{ minHeight: 320 }} />
    </Screen>
  );
}
