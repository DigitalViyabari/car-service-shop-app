import type { InventoryItem, Invoice, JobSheet, Payment, Product } from "@dvcs/types";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { collection, getDocs, query, where } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MobileNav } from "../components/mobile-nav";
import { DateField, SelectField } from "../components/form-controls";
import { firebase } from "../lib/firebase";
import { useMobileAuth } from "../lib/mobile-auth";
import { canViewFinance } from "../lib/mobile-roles";
import { colours, statusColours } from "../lib/theme";
type Period =
  | "today"
  | "last_7"
  | "last_30"
  | "this_month"
  | "last_month"
  | "this_financial_year"
  | "last_financial_year"
  | "custom";
type Purchase = {
  billDate: unknown;
  taxableAmount: number;
  taxAmount: number;
  totalAmount: number;
};
type Expense = { expenseDate: unknown; amount: number };
const periods: Array<[Period, string]> = [
  ["today", "Today"],
  ["last_7", "Last 7 Days"],
  ["last_30", "Last 30 Days"],
  ["this_month", "This Month"],
  ["last_month", "Last Month"],
  ["this_financial_year", "This Financial Year"],
  ["last_financial_year", "Last Financial Year"],
  ["custom", "Custom"],
];
const labels: Record<string, string> = {
  check_in: "Check-In",
  inspection: "Inspection",
  estimate_pending: "Estimate Pending",
  approved: "Approved",
  in_progress: "In Progress",
  quality_check: "Quality Check",
  ready: "Ready",
  delivered: "Delivered",
  cancelled: "Cancelled",
};
const money = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
function dateOf(v: unknown) {
  if (typeof v === "object" && v && "toDate" in v) return (v as { toDate: () => Date }).toDate();
  return new Date(String(v));
}
function range(period: Period, startText: string, endText: string): [Date, Date] {
  const now = new Date(),
    today = new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    day = 86400000;
  if (period === "today") return [today, new Date(+today + day)];
  if (period === "last_7") return [new Date(+today - 6 * day), new Date(+today + day)];
  if (period === "last_30") return [new Date(+today - 29 * day), new Date(+today + day)];
  if (period === "this_month")
    return [
      new Date(now.getFullYear(), now.getMonth(), 1),
      new Date(now.getFullYear(), now.getMonth() + 1, 1),
    ];
  if (period === "last_month")
    return [
      new Date(now.getFullYear(), now.getMonth() - 1, 1),
      new Date(now.getFullYear(), now.getMonth(), 1),
    ];
  if (period === "custom") {
    const s = new Date(`${startText}T00:00:00`),
      e = new Date(`${endText}T00:00:00`);
    return [s, new Date(+e + day)];
  }
  const fy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1,
    start = period === "last_financial_year" ? fy - 1 : fy;
  return [new Date(start, 3, 1), new Date(start + 1, 3, 1)];
}
export default function ReportsScreen() {
  const { membership, company, branch } = useMobileAuth();
  const allowed = canViewFinance(membership, branch?.id);
  const [period, setPeriod] = useState<Period>("this_month"),
    [customStart, setCustomStart] = useState("2026-08-01"),
    [customEnd, setCustomEnd] = useState("2026-08-04");
  const [invoices, setInvoices] = useState<Invoice[]>([]),
    [payments, setPayments] = useState<Payment[]>([]),
    [jobs, setJobs] = useState<JobSheet[]>([]),
    [inventory, setInventory] = useState<InventoryItem[]>([]),
    [products, setProducts] = useState<Product[]>([]),
    [purchases, setPurchases] = useState<Purchase[]>([]),
    [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true),
    [refreshing, setRefreshing] = useState(false),
    [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!company || !branch || !allowed) return setLoading(false);
    setError(null);
    try {
      const qb = (name: string) =>
        getDocs(
          query(
            collection(firebase.db, name),
            where("companyId", "==", company.id),
            where("branchId", "==", branch.id),
          ),
        );
      const [i, p, j, inv, prod, pu, e] = await Promise.all([
        qb("invoices"),
        qb("payments"),
        qb("jobSheets"),
        qb("inventoryItems"),
        getDocs(query(collection(firebase.db, "products"), where("companyId", "==", company.id))),
        qb("purchaseBills"),
        qb("expenses"),
      ]);
      setInvoices(i.docs.map((x) => ({ ...x.data(), id: x.id }) as Invoice));
      setPayments(p.docs.map((x) => ({ ...x.data(), id: x.id }) as Payment));
      setJobs(j.docs.map((x) => ({ ...x.data(), id: x.id }) as JobSheet));
      setInventory(inv.docs.map((x) => ({ ...x.data(), id: x.id }) as InventoryItem));
      setProducts(prod.docs.map((x) => ({ ...x.data(), id: x.id }) as Product));
      setPurchases(pu.docs.map((x) => x.data() as Purchase));
      setExpenses(e.docs.map((x) => x.data() as Expense));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load reports.");
    } finally {
      setLoading(false);
    }
  }, [allowed, branch, company]);
  useEffect(() => {
    void load();
  }, [load]);
  const report = useMemo(() => {
    const [start, end] = range(period, customStart, customEnd),
      inside = (v: unknown) => {
        const d = dateOf(v);
        return d >= start && d < end;
      },
      i = invoices.filter((x) => inside(x.issuedAt)),
      p = payments.filter((x) => x.status === "completed" && inside(x.receivedAt)),
      j = jobs.filter((x) => inside(x.checkedInAt)),
      pu = purchases.filter((x) => inside(x.billDate)),
      e = expenses.filter((x) => inside(x.expenseDate)),
      billed = i.reduce((s, x) => s + x.totalAmount, 0),
      collected = p.reduce((s, x) => s + x.amount, 0),
      purchase = pu.reduce((s, x) => s + x.totalAmount, 0),
      expense = e.reduce((s, x) => s + x.amount, 0),
      outputGst = i.reduce((s, x) => s + x.taxAmount, 0),
      inputGst = pu.reduce((s, x) => s + x.taxAmount, 0),
      jobCounts = Object.entries(
        j.reduce<Record<string, number>>(
          (a, x) => ({ ...a, [x.status]: (a[x.status] ?? 0) + 1 }),
          {},
        ),
      ),
      serviceCounts = Object.entries(
        j.reduce<Record<string, number>>(
          (a, x) => ({
            ...a,
            [x.serviceType || "Not Specified"]: (a[x.serviceType || "Not Specified"] ?? 0) + 1,
          }),
          {},
        ),
      )
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6),
      low = inventory.filter((x) => x.status === "active" && x.currentStock <= x.reorderLevel);
    return {
      jobs: j,
      billed,
      collected,
      outstanding: i.filter((x) => x.status !== "void").reduce((s, x) => s + x.balanceAmount, 0),
      purchase,
      expense,
      netCash: collected - purchase - expense,
      netGst: Math.max(0, outputGst - inputGst),
      stockValue: inventory
        .filter((x) => x.status === "active")
        .reduce((s, x) => s + x.currentStock * x.purchasePrice, 0),
      payments: p.length,
      invoices: i.length,
      delivered: j.filter((x) => x.status === "delivered").length,
      jobCounts,
      serviceCounts,
      low,
    };
  }, [customEnd, customStart, expenses, inventory, invoices, jobs, payments, period, purchases]);
  if (!allowed)
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>Reports</Text>
        </View>
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Reports access is not assigned to this account.</Text>
        </View>
        <MobileNav />
      </SafeAreaView>
    );
  const completion = report.jobs.length
      ? Math.round((report.delivered / report.jobs.length) * 100)
      : 0,
    collectionRate = report.billed
      ? Math.min(100, Math.round((report.collected / report.billed) * 100))
      : 0,
    average = report.invoices ? report.billed / report.invoices : 0;
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
      >
        <Text style={styles.eyebrow}>BUSINESS INTELLIGENCE</Text>
        <Text style={styles.title}>Reports</Text>
        <Text style={styles.sub}>Workshop and financial performance.</Text>
        <TouchableOpacity
          style={styles.pendingButton}
          onPress={() => router.push("/pending-payments")}
        >
          <View style={styles.pendingIcon}>
            <Ionicons name="call" size={21} color="#FFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.pendingTitle}>Pending Payment Follow-Up</Text>
            <Text style={styles.pendingHint}>Call or WhatsApp customers directly</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={colours.muted} />
        </TouchableOpacity>
        <View style={styles.periodSelect}>
          <SelectField
            label="Report Period"
            value={period}
            onChange={(value) => setPeriod(value as Period)}
            options={periods.map(([value, label]) => ({ value, label }))}
          />
        </View>
        {period === "custom" ? (
          <View style={styles.custom}>
            <View style={styles.customHalf}>
              <DateField
                label="Start Date"
                value={customStart}
                onChange={setCustomStart}
                optional={false}
              />
            </View>
            <View style={styles.customHalf}>
              <DateField
                label="End Date"
                value={customEnd}
                onChange={setCustomEnd}
                optional={false}
              />
            </View>
          </View>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading ? (
          <ActivityIndicator size="large" color={colours.red} style={{ marginTop: 50 }} />
        ) : (
          <>
            <View style={styles.grid}>
              <Metric
                colour={colours.blue}
                label="Total Jobs"
                value={String(report.jobs.length)}
                hint={`${report.delivered} delivered · ${completion}% completed`}
              />
              <Metric
                colour={colours.navy}
                label="Invoiced"
                value={money(report.billed)}
                hint={`Average ${money(average)}`}
              />
              <Metric
                colour={colours.green}
                label="Collected"
                value={money(report.collected)}
                hint={`${report.payments} payments · ${collectionRate}%`}
              />
              <Metric
                colour={report.outstanding ? colours.amber : colours.green}
                label="Balance Due"
                value={money(report.outstanding)}
                hint="Payment follow-up"
              />
              <Metric
                colour={report.low.length ? colours.red : colours.green}
                label="Stock Value"
                value={money(report.stockValue)}
                hint={`${report.low.length} low-stock products`}
              />
              <Metric
                colour={colours.amber}
                label="Purchases"
                value={money(report.purchase)}
                hint="Stock bought"
              />
              <Metric
                colour={colours.red}
                label="Expenses"
                value={money(report.expense)}
                hint="Operating costs"
              />
              <Metric
                colour={report.netCash >= 0 ? colours.green : colours.red}
                label="Net Cash"
                value={money(report.netCash)}
                hint="Collected − costs"
              />
              <Metric
                colour={report.netGst ? colours.amber : colours.green}
                label="Est. GST Payable"
                value={money(report.netGst)}
                hint="Output less input GST"
              />
            </View>
            <ReportList
              title="Jobs By Status"
              values={report.jobCounts.map(([key, value]) => [
                labels[key] ?? key,
                value,
                statusColours[key] ?? colours.blue,
              ])}
            />
            <ReportList
              title="Top Service Types"
              values={report.serviceCounts.map(([key, value]) => [key, value, colours.navy])}
            />
            <View style={styles.card}>
              <Text style={styles.cardKicker}>INVENTORY ATTENTION</Text>
              <Text style={styles.cardTitle}>Low & Out Of Stock</Text>
              {report.low.length ? (
                report.low.slice(0, 10).map((item) => {
                  const product = products.find((x) => x.id === item.productId);
                  return (
                    <View key={item.id} style={styles.low}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.lowName}>{product?.name ?? "Product"}</Text>
                        <Text style={styles.lowSku}>{product?.sku ?? item.productId}</Text>
                      </View>
                      <Text style={styles.lowCount}>
                        {item.currentStock} / {item.reorderLevel}
                      </Text>
                    </View>
                  );
                })
              ) : (
                <Text style={styles.clear}>All tracked products are above reorder levels.</Text>
              )}
            </View>
          </>
        )}
      </ScrollView>
      <MobileNav />
    </SafeAreaView>
  );
}
function Metric({
  colour,
  label,
  value,
  hint,
}: {
  colour: string;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <View style={[styles.metric, { borderTopColor: colour }]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue} adjustsFontSizeToFit numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.metricHint}>{hint}</Text>
    </View>
  );
}
function ReportList({ title, values }: { title: string; values: Array<[string, number, string]> }) {
  const max = Math.max(1, ...values.map((x) => x[1]));
  return (
    <View style={styles.card}>
      <Text style={styles.cardKicker}>WORKSHOP PERFORMANCE</Text>
      <Text style={styles.cardTitle}>{title}</Text>
      {values.length ? (
        values.map(([label, value, colour]) => (
          <View key={label} style={styles.barRow}>
            <View style={styles.barLabel}>
              <Text style={styles.barText}>{label}</Text>
              <Text style={styles.barValue}>{value}</Text>
            </View>
            <View style={styles.track}>
              <View
                style={[styles.fill, { width: `${(value / max) * 100}%`, backgroundColor: colour }]}
              />
            </View>
          </View>
        ))
      ) : (
        <Text style={styles.clear}>No data in this period.</Text>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colours.canvas },
  content: { padding: 20, paddingBottom: 105 },
  header: { padding: 20 },
  eyebrow: { color: colours.red, fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  title: { fontSize: 31, fontWeight: "900", color: colours.ink, marginTop: 4 },
  sub: { fontSize: 15, color: colours.muted, fontWeight: "700", marginTop: 4 },
  pendingButton: {
    minHeight: 72,
    marginTop: 16,
    padding: 12,
    borderRadius: 17,
    backgroundColor: colours.card,
    borderWidth: 1,
    borderColor: colours.line,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  pendingIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: colours.green,
    alignItems: "center",
    justifyContent: "center",
  },
  pendingTitle: { fontSize: 16, fontWeight: "900", color: colours.ink },
  pendingHint: { fontSize: 13, color: colours.muted, marginTop: 2 },
  periods: { gap: 8, paddingVertical: 18 },
  periodSelect: { marginBottom: 4 },
  period: {
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colours.line,
    backgroundColor: colours.card,
    alignItems: "center",
    justifyContent: "center",
  },
  periodActive: { backgroundColor: colours.ink, borderColor: colours.ink },
  periodText: { fontSize: 13, fontWeight: "900", color: colours.ink },
  periodTextActive: { color: "#FFF" },
  custom: { flexDirection: "row", gap: 8, marginBottom: 12 },
  customHalf: { flex: 1 },
  date: {
    flex: 1,
    height: 50,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colours.line,
    backgroundColor: colours.card,
    paddingHorizontal: 10,
    fontSize: 13,
  },
  error: {
    padding: 13,
    borderRadius: 12,
    backgroundColor: "#FDEBEC",
    color: "#A82024",
    fontWeight: "700",
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metric: {
    width: "48%",
    minHeight: 130,
    padding: 14,
    borderRadius: 17,
    backgroundColor: colours.card,
    borderWidth: 1,
    borderColor: colours.line,
    borderTopWidth: 5,
  },
  metricLabel: { fontSize: 14, fontWeight: "800", color: colours.muted },
  metricValue: { fontSize: 23, fontWeight: "900", color: colours.ink, marginTop: 8 },
  metricHint: { fontSize: 12, lineHeight: 17, color: colours.muted, marginTop: 4 },
  card: {
    backgroundColor: colours.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colours.line,
    padding: 18,
    marginTop: 16,
  },
  cardKicker: { fontSize: 11, fontWeight: "900", letterSpacing: 1, color: colours.red },
  cardTitle: {
    fontSize: 21,
    fontWeight: "900",
    color: colours.ink,
    marginTop: 5,
    marginBottom: 14,
  },
  barRow: { marginBottom: 13 },
  barLabel: { flexDirection: "row", justifyContent: "space-between" },
  barText: { fontSize: 14, fontWeight: "800", color: colours.ink },
  barValue: { fontSize: 14, fontWeight: "900", color: colours.ink },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "#E8EBEE",
    marginTop: 7,
    overflow: "hidden",
  },
  fill: { height: 8, borderRadius: 4 },
  low: {
    minHeight: 55,
    borderTopWidth: 1,
    borderTopColor: colours.line,
    flexDirection: "row",
    alignItems: "center",
  },
  lowName: { fontSize: 15, fontWeight: "900", color: colours.ink },
  lowSku: { fontSize: 12, color: colours.muted, marginTop: 2 },
  lowCount: { fontSize: 15, fontWeight: "900", color: colours.red },
  clear: { fontSize: 15, color: colours.muted, lineHeight: 22 },
  notice: { margin: 20, padding: 25, borderRadius: 20, backgroundColor: colours.card },
  noticeTitle: { fontSize: 18, fontWeight: "900", color: colours.ink },
});
