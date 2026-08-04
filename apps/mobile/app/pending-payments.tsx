import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { apiGet } from "../lib/mobile-api";
import { useMobileAuth } from "../lib/mobile-auth";
import { canViewFinance } from "../lib/mobile-roles";
import { colours } from "../lib/theme";

type Pending = {
  id: string;
  invoiceNumber: string;
  jobId: string;
  customerName: string;
  phone: string;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
};
const money = (value: number) =>
  `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function whatsappNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  return digits.startsWith("0") && digits.length === 11 ? `91${digits.slice(1)}` : digits;
}

export default function PendingPaymentsScreen() {
  const { user, membership, company, branch } = useMobileAuth();
  const allowed = canViewFinance(membership, branch?.id);
  const [items, setItems] = useState<Pending[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string | null>(null);
  const [whatsappSent, setWhatsappSent] = useState<Record<string, number>>({});
  const [clock, setClock] = useState(Date.now());
  const whatsappHistoryKey = user ? `dvcs.whatsappFollowUp.${user.uid}` : "";
  const load = useCallback(async () => {
    if (!user || !company || !branch || !allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await apiGet<{ pending: Pending[] }>(
        user,
        `/v1/payments/pending?companyId=${encodeURIComponent(company.id)}&branchId=${encodeURIComponent(branch.id)}`,
      );
      setItems(result.pending);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load pending payments.");
    } finally {
      setLoading(false);
    }
  }, [allowed, branch, company, user]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!whatsappHistoryKey) return;
    void AsyncStorage.getItem(whatsappHistoryKey).then((stored) => {
      if (!stored) return;
      try {
        setWhatsappSent(JSON.parse(stored) as Record<string, number>);
      } catch {
        setWhatsappSent({});
      }
    });
    const timer = setInterval(() => setClock(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, [whatsappHistoryKey]);
  async function call(phone: string) {
    if (phone) await Linking.openURL(`tel:${phone.replace(/[^\d+]/g, "")}`);
  }
  async function whatsapp(item: Pending) {
    const phone = whatsappNumber(item.phone);
    const message = `Hello ${item.customerName}, this is a friendly payment reminder from ${company?.name ?? "our workshop"}. A balance of ${money(item.balanceAmount)} is pending for invoice ${item.invoiceNumber}. Kindly arrange the payment at your convenience. Thank you.`;
    await Linking.openURL(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`);
    const nextHistory = { ...whatsappSent, [item.id]: Date.now() };
    setWhatsappSent(nextHistory);
    if (whatsappHistoryKey)
      await AsyncStorage.setItem(whatsappHistoryKey, JSON.stringify(nextHistory));
  }
  const sentWithin24Hours = (invoiceId: string) =>
    clock - (whatsappSent[invoiceId] ?? 0) < 24 * 60 * 60 * 1000;
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={25} color={colours.ink} />
        </TouchableOpacity>
        <View>
          <Text style={styles.eyebrow}>COLLECTION FOLLOW-UP</Text>
          <Text style={styles.title}>Pending Payments</Text>
        </View>
      </View>
      {!allowed ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Payment follow-up is not assigned to this role.</Text>
        </View>
      ) : loading ? (
        <ActivityIndicator size="large" color={colours.red} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.summary}>
            <Text style={styles.summaryLabel}>TOTAL TO COLLECT</Text>
            <Text style={styles.summaryValue}>
              {money(items.reduce((sum, item) => sum + item.balanceAmount, 0))}
            </Text>
            <Text style={styles.summaryHint}>
              {items.length} pending invoice{items.length === 1 ? "" : "s"}
            </Text>
          </View>
          {items.map((item) => (
            <View key={item.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.customerName}</Text>
                  <Text style={styles.invoice}>Invoice · {item.invoiceNumber}</Text>
                  {item.jobId ? <Text style={styles.jobCard}>Job Card · {item.jobId}</Text> : null}
                </View>
                <Text style={styles.balance}>{money(item.balanceAmount)}</Text>
              </View>
              <View style={styles.amounts}>
                <Text style={styles.amountText}>Invoice {money(item.totalAmount)}</Text>
                <Text style={styles.amountText}>Paid {money(item.paidAmount)}</Text>
              </View>
              {item.phone ? (
                <View style={styles.actions}>
                  <TouchableOpacity style={styles.call} onPress={() => void call(item.phone)}>
                    <Ionicons name="call" size={21} color="#FFF" />
                    <Text style={styles.actionText}>Call</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.whatsapp, sentWithin24Hours(item.id) && styles.whatsappRecent]}
                    onPress={() => void whatsapp(item)}
                  >
                    <Ionicons name="logo-whatsapp" size={23} color="#FFF" />
                    <Text style={styles.actionText}>
                      {sentWithin24Hours(item.id) ? "Sent · Send Again" : "WhatsApp"}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={styles.noPhone}>No customer phone number recorded.</Text>
              )}
            </View>
          ))}
          {!items.length ? (
            <View style={styles.empty}>
              <Ionicons name="checkmark-circle" size={44} color={colours.green} />
              <Text style={styles.emptyTitle}>No pending payments</Text>
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colours.canvas },
  header: { padding: 20, flexDirection: "row", alignItems: "center", gap: 13 },
  back: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: colours.card,
    borderWidth: 1,
    borderColor: colours.line,
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: { fontSize: 11, fontWeight: "900", letterSpacing: 1, color: colours.red },
  title: { fontSize: 25, fontWeight: "900", color: colours.ink },
  content: { padding: 18, paddingBottom: 40, gap: 12 },
  error: {
    padding: 14,
    borderRadius: 13,
    backgroundColor: "#FDEBEC",
    color: "#A82024",
    fontWeight: "800",
  },
  summary: { padding: 20, borderRadius: 20, backgroundColor: colours.ink },
  summaryLabel: { fontSize: 11, fontWeight: "900", letterSpacing: 1, color: "#B8C0C8" },
  summaryValue: { fontSize: 32, fontWeight: "900", color: "#FFF", marginTop: 7 },
  summaryHint: { fontSize: 14, color: "#B8C0C8", marginTop: 4 },
  card: {
    padding: 17,
    borderRadius: 18,
    backgroundColor: colours.card,
    borderWidth: 1,
    borderColor: colours.line,
  },
  cardTop: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  name: { fontSize: 18, fontWeight: "900", color: colours.ink },
  invoice: { fontSize: 13, color: colours.muted, marginTop: 4 },
  jobCard: { fontSize: 12, color: colours.muted, marginTop: 3 },
  balance: { fontSize: 20, fontWeight: "900", color: colours.red },
  amounts: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 13,
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: colours.line,
  },
  amountText: { fontSize: 13, fontWeight: "700", color: colours.muted },
  actions: { flexDirection: "row", gap: 9 },
  call: {
    height: 52,
    flex: 1,
    borderRadius: 14,
    backgroundColor: colours.blue,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  whatsapp: {
    height: 52,
    flex: 1.4,
    borderRadius: 14,
    backgroundColor: "#148A53",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  whatsappRecent: { backgroundColor: "#799B89" },
  actionText: { fontSize: 15, fontWeight: "900", color: "#FFF" },
  noPhone: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#FFF3DC",
    color: "#8A5A00",
    fontWeight: "700",
  },
  empty: {
    margin: 20,
    padding: 28,
    borderRadius: 20,
    backgroundColor: colours.card,
    alignItems: "center",
    gap: 10,
  },
  emptyTitle: { fontSize: 18, fontWeight: "900", color: colours.ink },
});
