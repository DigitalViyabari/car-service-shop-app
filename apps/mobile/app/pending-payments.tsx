import type { PaymentMethod } from "@dvcs/types";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SelectField } from "../components/form-controls";
import { apiGet, apiRequest } from "../lib/mobile-api";
import { useMobileAuth } from "../lib/mobile-auth";
import { canViewFinance } from "../lib/mobile-roles";
import { colours } from "../lib/theme";

type Pending = {
  id: string;
  invoiceNumber: string;
  jobNumber: string;
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
    [refreshing, setRefreshing] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [whatsappSent, setWhatsappSent] = useState<Record<string, number>>({});
  const [clock, setClock] = useState(Date.now());
  const [paymentItem, setPaymentItem] = useState<Pending | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [paymentReference, setPaymentReference] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [receiptNumber, setReceiptNumber] = useState("");
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
  function openPayment(item: Pending) {
    setPaymentItem(item);
    setPaymentAmount("");
    setPaymentMethod("cash");
    setPaymentReference("");
    setPaymentError(null);
  }
  async function recordPayment() {
    if (!user || !company || !branch || !paymentItem) return;
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > paymentItem.balanceAmount + 0.001) {
      setPaymentError(`Enter an amount between ₹0.01 and ${money(paymentItem.balanceAmount)}.`);
      return;
    }
    setSavingPayment(true);
    setPaymentError(null);
    try {
      const result = await apiRequest<{ receiptNumber: string }>(user, "/v1/payments/record", {
        companyId: company.id,
        branchId: branch.id,
        invoiceId: paymentItem.id,
        amount,
        method: paymentMethod,
        reference: paymentReference.trim(),
        notes: "Payment received from mobile app",
      });
      setReceiptNumber(result.receiptNumber);
      setPaymentItem(null);
      await load();
    } catch (reason) {
      setPaymentError(reason instanceof Error ? reason.message : "Unable to record payment.");
    } finally {
      setSavingPayment(false);
    }
  }
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={25} color={colours.ink} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>COLLECTION FOLLOW-UP</Text>
          <Text style={styles.title}>Pending Payments</Text>
        </View>
        <TouchableOpacity
          style={styles.refresh}
          accessibilityLabel="Refresh pending payments"
          onPress={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        >
          {refreshing ? (
            <ActivityIndicator color={colours.ink} />
          ) : (
            <Ionicons name="refresh" size={24} color={colours.ink} />
          )}
        </TouchableOpacity>
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
          {receiptNumber ? (
            <View style={styles.receiptNotice}>
              <Ionicons name="checkmark-circle" size={23} color={colours.green} />
              <Text style={styles.receiptText}>Payment recorded · {receiptNumber}</Text>
            </View>
          ) : null}
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
                  {item.jobNumber ? (
                    <Text style={styles.jobCard}>Job Card · {item.jobNumber}</Text>
                  ) : null}
                </View>
                <Text style={styles.balance}>{money(item.balanceAmount)}</Text>
              </View>
              <View style={styles.amounts}>
                <Text style={styles.amountText}>Invoice {money(item.totalAmount)}</Text>
                <Text style={styles.amountText}>Paid {money(item.paidAmount)}</Text>
              </View>
              <TouchableOpacity style={styles.receive} onPress={() => openPayment(item)}>
                <Ionicons name="wallet" size={21} color="#FFF" />
                <Text style={styles.actionText}>Receive Payment</Text>
              </TouchableOpacity>
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
      <Modal visible={Boolean(paymentItem)} transparent animationType="fade">
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.modalScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.eyebrow}>PAYMENT RECEIVED</Text>
                  <Text style={styles.modalTitle}>Record Payment</Text>
                  <Text style={styles.modalInvoice}>{paymentItem?.invoiceNumber}</Text>
                </View>
                <TouchableOpacity style={styles.close} onPress={() => setPaymentItem(null)}>
                  <Ionicons name="close" size={25} color={colours.ink} />
                </TouchableOpacity>
              </View>
              {paymentError ? <Text style={styles.error}>{paymentError}</Text> : null}
              <Text style={styles.fieldLabel}>Amount Received *</Text>
              <View style={styles.amountInputRow}>
                <Text style={styles.rupee}>₹</Text>
                <TextInput
                  style={styles.amountInput}
                  value={paymentAmount}
                  onChangeText={setPaymentAmount}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor="#AAB2BC"
                />
              </View>
              <View style={styles.balanceLine}>
                <Text style={styles.balanceHint}>
                  Balance {money(paymentItem?.balanceAmount ?? 0)}
                </Text>
                <TouchableOpacity
                  onPress={() => setPaymentAmount(String(paymentItem?.balanceAmount ?? ""))}
                >
                  <Text style={styles.fullBalance}>Use Full Balance</Text>
                </TouchableOpacity>
              </View>
              <SelectField
                label="Payment Method"
                value={paymentMethod}
                onChange={(value) => setPaymentMethod(value as PaymentMethod)}
                options={[
                  { value: "cash", label: "Cash" },
                  { value: "upi", label: "UPI" },
                  { value: "card", label: "Card" },
                  { value: "bank_transfer", label: "Bank Transfer" },
                  { value: "cheque", label: "Cheque" },
                  { value: "other", label: "Other" },
                ]}
              />
              <Text style={styles.fieldLabel}>Transaction / Reference (Optional)</Text>
              <TextInput
                style={styles.referenceInput}
                value={paymentReference}
                onChangeText={setPaymentReference}
                placeholder="UPI, card, bank or cheque reference"
                placeholderTextColor="#AAB2BC"
              />
              {Number(paymentAmount) > 0 && paymentItem ? (
                <View style={styles.paymentSummary}>
                  <Text style={styles.paymentSummaryTitle}>
                    {Number(paymentAmount) >= paymentItem.balanceAmount
                      ? "Full Payment"
                      : "Partial Payment"}
                  </Text>
                  <Text style={styles.paymentSummaryText}>
                    Remaining{" "}
                    {money(Math.max(0, paymentItem.balanceAmount - Number(paymentAmount)))}
                  </Text>
                </View>
              ) : null}
              <TouchableOpacity
                style={styles.recordButton}
                onPress={() => void recordPayment()}
                disabled={savingPayment}
              >
                {savingPayment ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.recordButtonText}>Record & Generate Receipt</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
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
  refresh: {
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
  receiptNotice: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#EAF8F2",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  receiptText: { flex: 1, color: "#176C48", fontSize: 14, fontWeight: "800" },
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
  receive: {
    height: 54,
    borderRadius: 14,
    backgroundColor: colours.ink,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 9,
  },
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(4, 9, 14, 0.66)",
  },
  modalScroll: { flexGrow: 1, justifyContent: "center", padding: 18 },
  modalCard: { backgroundColor: colours.card, borderRadius: 24, padding: 20 },
  modalHeader: { flexDirection: "row", alignItems: "flex-start", marginBottom: 16 },
  modalTitle: { fontSize: 26, fontWeight: "900", color: colours.ink, marginTop: 2 },
  modalInvoice: { color: colours.muted, fontSize: 14, fontWeight: "700", marginTop: 3 },
  close: {
    width: 46,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colours.line,
    alignItems: "center",
    justifyContent: "center",
  },
  fieldLabel: {
    fontSize: 15,
    fontWeight: "800",
    color: colours.ink,
    marginTop: 14,
    marginBottom: 7,
  },
  amountInputRow: {
    height: 60,
    borderWidth: 1.5,
    borderColor: colours.line,
    borderRadius: 15,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
  },
  rupee: { fontSize: 23, fontWeight: "900", color: colours.ink },
  amountInput: { flex: 1, height: 58, paddingHorizontal: 8, fontSize: 22, fontWeight: "900" },
  balanceLine: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  balanceHint: { color: colours.muted, fontWeight: "700" },
  fullBalance: { color: colours.blue, fontWeight: "900" },
  referenceInput: {
    height: 56,
    borderWidth: 1.5,
    borderColor: colours.line,
    borderRadius: 14,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  paymentSummary: { backgroundColor: "#FFF4DF", borderRadius: 14, padding: 13, marginTop: 14 },
  paymentSummaryTitle: { color: "#8A5A00", fontWeight: "900", fontSize: 15 },
  paymentSummaryText: { color: "#8A5A00", marginTop: 2 },
  recordButton: {
    height: 60,
    borderRadius: 16,
    backgroundColor: colours.red,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 18,
  },
  recordButtonText: { color: "#FFF", fontSize: 16, fontWeight: "900" },
});
