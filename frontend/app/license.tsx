import { Screen } from "@/src/components/ui";
import { LicensePanel } from "@/src/license/ui";

export default function LicenseScreen() {
  return (
    <Screen title="Lisensi" subtitle="Bayar sekali, tanpa langganan" testID="license-screen">
      <LicensePanel />
    </Screen>
  );
}
