import type { InventoryItem, Invoice, JobSheet, Payment } from "@dvcs/types";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { collection, getDocs, query, where } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { MobileNav } from "../components/mobile-nav";
import { firebase } from "../lib/firebase";
import { apiGet } from "../lib/mobile-api";
import { useMobileAuth } from "../lib/mobile-auth";
import { colours } from "../lib/theme";
import {
  canCreateOperations,
  canManageCustomers,
  canViewFinance,
  canViewAssignedJobs,
  canViewInventory,
  canViewWorkshopJobs,
} from "../lib/mobile-roles";

const activeStatuses = [
  "check_in",
  "inspection",
  "estimate_pending",
  "approved",
  "in_progress",
  "quality_check",
  "ready",
];

export default function HomeScreen() {
  const { user, profile, membership, company, branch, loading, error } = useMobileAuth();
  const [jobs, setJobs] = useState<JobSheet[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]),
    [payments, setPayments] = useState<Payment[]>([]),
    [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const workshopJobs = canViewWorkshopJobs(membership, branch?.id);
  const assignedJobs = canViewAssignedJobs(membership, branch?.id);
  const technician = useMemo(() => !workshopJobs && assignedJobs, [assignedJobs, workshopJobs]);
  const canCreate = canCreateOperations(membership, branch?.id);
  const canCustomers = canManageCustomers(membership, branch?.id);
  const finance = canViewFinance(membership, branch?.id),
    inventoryAccess = canViewInventory(membership, branch?.id);

  const loadJobs = useCallback(async () => {
    if (!user || !company || !branch) return;
    const loadedJobs = technician
      ? (
          await apiGet<{ jobs: JobSheet[] }>(
            user,
            `/v1/jobs/assigned?companyId=${encodeURIComponent(company.id)}&branchId=${encodeURIComponent(branch.id)}`,
          )
        ).jobs
      : workshopJobs
        ? (
            await getDocs(
              query(
                collection(firebase.db, "jobSheets"),
                where("companyId", "==", company.id),
                where("branchId", "==", branch.id),
              ),
            )
          ).docs.map((item) => ({ ...item.data(), id: item.id }) as JobSheet)
        : [];
    setJobs(loadedJobs.filter((job) => job.companyId === company.id && job.branchId === branch.id));
    if (!technician) {
      const q = (name: string) =>
        getDocs(
          query(
            collection(firebase.db, name),
            where("companyId", "==", company.id),
            where("branchId", "==", branch.id),
          ),
        );
      const [i, p, stock] = await Promise.all([
        finance ? q("invoices") : null,
        finance ? q("payments") : null,
        inventoryAccess ? q("inventoryItems") : null,
      ]);
      setInvoices(i?.docs.map((x) => ({ ...x.data(), id: x.id }) as Invoice) ?? []);
      setPayments(p?.docs.map((x) => ({ ...x.data(), id: x.id }) as Payment) ?? []);
      setInventory(stock?.docs.map((x) => ({ ...x.data(), id: x.id }) as InventoryItem) ?? []);
    }
  }, [assignedJobs, branch, company, finance, inventoryAccess, technician, user, workshopJobs]);

  useEffect(() => {
    if (!loading && !user) router.replace("/");
    if (user && branch) void loadJobs();
  }, [branch, loadJobs, loading, user]);

  async function refresh() {
    setRefreshing(true);
    try {
      await loadJobs();
    } finally {
      setRefreshing(false);
    }
  }

  if (loading)
    return (
      <View style={styles.loading}>
        <View style={styles.loaderCar}>
          <Ionicons name="car-sport" size={36} color="#FFFFFF" />
        </View>
        <ActivityIndicator color={colours.red} size="large" />
        <Text style={styles.loadingText}>Opening workshop…</Text>
      </View>
    );

  const active = jobs.filter((job) => activeStatuses.includes(job.status)),
    ready = jobs.filter((job) => job.status === "ready").length,
    urgent = active.filter((job) => job.priority === "breakdown").length,
    inProgress = active.filter((job) => job.status === "in_progress").length,
    todayJobs = jobs.filter((job) => {
      const raw = job.checkedInAt as unknown,
        date =
          typeof raw === "object" && raw && "toDate" in raw
            ? (raw as { toDate: () => Date }).toDate()
            : new Date(String(raw));
      return date.toDateString() === new Date().toDateString();
    }).length,
    outstanding = invoices
      .filter((x) => x.status !== "void")
      .reduce((s, x) => s + x.balanceAmount, 0),
    collected = payments.filter((x) => x.status === "completed").reduce((s, x) => s + x.amount, 0),
    lowStock = inventory.filter(
      (x) => x.status === "active" && x.currentStock <= x.reorderLevel,
    ).length,
    statusCounts = Object.entries(
      active.reduce<Record<string, number>>(
        (a, x) => ({ ...a, [x.status]: (a[x.status] ?? 0) + 1 }),
        {},
      ),
    );

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
      >
        <View style={styles.topRow}>
          <View style={styles.brandMark}>
            <Ionicons name="car-sport" size={24} color="#FFFFFF" />
          </View>
          <TouchableOpacity style={styles.bell} onPress={() => router.push("/alerts")}>
            <Ionicons name="notifications-outline" size={25} color={colours.ink} />
          </TouchableOpacity>
        </View>
        <Text style={styles.greeting}>Hello, {profile?.displayName?.split(" ")[0] ?? "Team"}</Text>
        <Text style={styles.branch}>
          {company?.name} · {branch?.name}
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity style={styles.focusCard} onPress={() => router.push("/jobs")}>
          <View style={styles.focusIcon}>
            <Ionicons name="speedometer" size={28} color="#FFFFFF" />
          </View>
          <View style={styles.focusText}>
            <Text style={styles.focusLabel}>{technician ? "MY WORK" : "WORKSHOP NOW"}</Text>
            <Text style={styles.focusValue}>
              {active.length} active job{active.length === 1 ? "" : "s"}
            </Text>
            <Text style={styles.focusHint}>Tap to open job cards</Text>
          </View>
          <Ionicons name="chevron-forward" size={26} color="#FFFFFF" />
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>At a glance</Text>
        <View style={styles.metrics}>
          <Metric icon="construct" colour={colours.blue} value={inProgress} label="In Progress" />
          <Metric icon="checkmark-circle" colour={colours.green} value={ready} label="Ready" />
          <Metric icon="flash" colour={colours.red} value={urgent} label="Very Urgent" />
          <Metric icon="car" colour={colours.purple} value={active.length} label="Open Jobs" />
          <Metric
            icon="calendar"
            colour={colours.blue}
            value={todayJobs}
            label="Checked In Today"
          />
          {finance ? (
            <Metric
              icon="wallet"
              colour={outstanding ? colours.amber : colours.green}
              value={moneyShort(outstanding)}
              label="Payment Due"
            />
          ) : null}
          {finance ? (
            <Metric
              icon="cash"
              colour={colours.green}
              value={moneyShort(collected)}
              label="Collected Overall"
            />
          ) : null}
          {inventoryAccess ? (
            <Metric
              icon="cube"
              colour={lowStock ? colours.red : colours.green}
              value={lowStock}
              label="Low Stock"
            />
          ) : null}
        </View>

        <Text style={styles.sectionTitle}>Workshop Flow</Text>
        <View style={styles.flow}>
          {statusCounts.length ? (
            statusCounts.map(([status, count]) => (
              <View key={status} style={styles.flowRow}>
                <View style={[styles.flowDot, { backgroundColor: statusColour(status) }]} />
                <Text style={styles.flowLabel}>{flowLabel(status)}</Text>
                <Text style={styles.flowCount}>{count}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.allClearText}>No vehicles are currently in service.</Text>
          )}
        </View>

        <Text style={styles.sectionTitle}>What Should I Do Next?</Text>
        <View style={styles.guides}>
          {technician ? (
            <Guide
              colour={colours.blue}
              title="Open Your Assigned Work"
              hint={`${active.length} active assigned job${active.length === 1 ? "" : "s"}.`}
              onPress={() => router.push("/jobs")}
            />
          ) : (
            <>
              {urgent > 0 ? (
                <Guide
                  colour={colours.red}
                  title={`Handle ${urgent} Urgent Job${urgent === 1 ? "" : "s"}`}
                  hint="Update their workshop progress now."
                  onPress={() => router.push("/jobs")}
                />
              ) : null}
              {ready > 0 ? (
                <Guide
                  colour={colours.green}
                  title={`Deliver ${ready} Ready Vehicle${ready === 1 ? "" : "s"}`}
                  hint="Contact customers and complete delivery."
                  onPress={() => router.push("/jobs")}
                />
              ) : null}
              {finance && outstanding > 0 ? (
                <Guide
                  colour={colours.amber}
                  title="Collect Pending Payments"
                  hint={`${moneyShort(outstanding)} remains outstanding.`}
                  onPress={() => router.push("/reports")}
                />
              ) : null}
              {inventoryAccess && lowStock > 0 ? (
                <Guide
                  colour={colours.blue}
                  title={`Reorder ${lowStock} Product${lowStock === 1 ? "" : "s"}`}
                  hint="Review stock before it runs out."
                  onPress={() => router.push("/reports")}
                />
              ) : null}
              {!urgent &&
              !ready &&
              (!finance || !outstanding) &&
              (!inventoryAccess || !lowStock) ? (
                <View style={styles.allClear}>
                  <Ionicons name="checkmark-circle" size={29} color={colours.green} />
                  <View>
                    <Text style={styles.guideTitle}>Everything Looks Under Control</Text>
                    <Text style={styles.guideHint}>No urgent action is required now.</Text>
                  </View>
                </View>
              ) : null}
            </>
          )}
        </View>

        <Text style={styles.sectionTitle}>Quick actions</Text>
        {canCreate ? (
          <TouchableOpacity style={styles.action} onPress={() => router.push("/create-job")}>
            <View style={[styles.actionIcon, { backgroundColor: "#FDEBEC" }]}>
              <Ionicons name="add-circle" size={26} color={colours.red} />
            </View>
            <View style={styles.actionText}>
              <Text style={styles.actionTitle}>Create New Job</Text>
              <Text style={styles.actionHint}>Open a job card quickly</Text>
            </View>
            <Ionicons name="chevron-forward" size={23} color={colours.muted} />
          </TouchableOpacity>
        ) : null}
        {canCustomers ? (
          <TouchableOpacity style={styles.action} onPress={() => router.push("/customers")}>
            <View style={[styles.actionIcon, { backgroundColor: "#E9F7F1" }]}>
              <Ionicons name="people" size={25} color={colours.green} />
            </View>
            <View style={styles.actionText}>
              <Text style={styles.actionTitle}>Customers</Text>
              <Text style={styles.actionHint}>View or create customer</Text>
            </View>
            <Ionicons name="chevron-forward" size={23} color={colours.muted} />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={styles.action} onPress={() => router.push("/jobs")}>
          <View style={[styles.actionIcon, { backgroundColor: "#E9F2FC" }]}>
            <Ionicons name="car-sport" size={25} color={colours.blue} />
          </View>
          <View style={styles.actionText}>
            <Text style={styles.actionTitle}>{technician ? "Open My Jobs" : "Open Job Cards"}</Text>
            <Text style={styles.actionHint}>
              {technician ? "View assigned work" : "Track workshop progress"}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={23} color={colours.muted} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.action} onPress={() => router.push("/alerts")}>
          <View style={[styles.actionIcon, { backgroundColor: "#FDEBEC" }]}>
            <Ionicons name="notifications" size={25} color={colours.red} />
          </View>
          <View style={styles.actionText}>
            <Text style={styles.actionTitle}>Notifications</Text>
            <Text style={styles.actionHint}>Assignments and delays</Text>
          </View>
          <Ionicons name="chevron-forward" size={23} color={colours.muted} />
        </TouchableOpacity>
      </ScrollView>
      <MobileNav />
    </SafeAreaView>
  );
}

function Metric({
  icon,
  colour,
  value,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  colour: string;
  value: number | string;
  label: string;
}) {
  return (
    <View style={styles.metric}>
      <Ionicons name={icon} size={23} color={colour} />
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function Guide({
  colour,
  title,
  hint,
  onPress,
}: {
  colour: string;
  title: string;
  hint: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.guide, { borderLeftColor: colour }]} onPress={onPress}>
      <View style={[styles.guideNumber, { backgroundColor: colour }]}>
        <Ionicons name="arrow-forward" size={21} color="#FFF" />
      </View>
      <View style={styles.guideText}>
        <Text style={styles.guideTitle}>{title}</Text>
        <Text style={styles.guideHint}>{hint}</Text>
      </View>
    </TouchableOpacity>
  );
}
function moneyShort(value: number) {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}
function statusColour(status: string) {
  return (
    {
      check_in: colours.blue,
      inspection: colours.purple,
      estimate_pending: colours.amber,
      approved: "#1D9AA6",
      in_progress: "#E66A28",
      quality_check: "#B34D92",
      ready: colours.green,
    }[status] ?? colours.muted
  );
}
function flowLabel(status: string) {
  return (
    {
      check_in: "Checked In",
      inspection: "Under Inspection",
      estimate_pending: "Waiting For Estimate",
      approved: "Approved",
      in_progress: "Work In Progress",
      quality_check: "Quality Check",
      ready: "Ready For Delivery",
    }[status] ?? status.replaceAll("_", " ")
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colours.canvas },
  content: { padding: 20, paddingBottom: 104 },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colours.canvas,
    gap: 14,
  },
  loaderCar: {
    width: 68,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colours.ink,
  },
  loadingText: { color: colours.muted, fontSize: 16, fontWeight: "700" },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brandMark: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: colours.red,
    alignItems: "center",
    justifyContent: "center",
  },
  bell: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: colours.card,
    borderWidth: 1,
    borderColor: colours.line,
    alignItems: "center",
    justifyContent: "center",
  },
  greeting: { color: colours.ink, fontSize: 31, fontWeight: "900", marginTop: 22 },
  branch: { color: colours.muted, fontSize: 16, fontWeight: "700", marginTop: 5 },
  error: {
    color: "#A82024",
    backgroundColor: "#FDEBEC",
    padding: 14,
    borderRadius: 14,
    fontWeight: "700",
    marginTop: 16,
  },
  focusCard: {
    backgroundColor: colours.ink,
    borderRadius: 22,
    padding: 20,
    marginTop: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
  },
  focusIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: colours.red,
    alignItems: "center",
    justifyContent: "center",
  },
  focusText: { flex: 1 },
  focusLabel: { color: "#FF8F91", fontSize: 12, fontWeight: "900", letterSpacing: 1.2 },
  focusValue: { color: "#FFFFFF", fontSize: 22, fontWeight: "900", marginTop: 4 },
  focusHint: { color: "#AEB8C2", fontSize: 14, marginTop: 3 },
  sectionTitle: {
    color: colours.ink,
    fontSize: 20,
    fontWeight: "900",
    marginTop: 26,
    marginBottom: 12,
  },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  guides: { gap: 10 },
  guide: {
    minHeight: 88,
    backgroundColor: "#FFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colours.line,
    borderLeftWidth: 6,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  guideNumber: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colours.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  guideNumberText: { color: "#FFF", fontWeight: "900", fontSize: 18 },
  guideText: { flex: 1 },
  guideTitle: { color: colours.ink, fontSize: 17, fontWeight: "900" },
  guideHint: { color: colours.muted, fontSize: 14, lineHeight: 20, marginTop: 3 },
  flow: {
    backgroundColor: colours.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colours.line,
    padding: 14,
    gap: 8,
  },
  flowRow: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF0F2",
  },
  flowDot: { width: 11, height: 11, borderRadius: 6 },
  flowLabel: { flex: 1, fontSize: 15, fontWeight: "800", color: colours.ink },
  flowCount: { fontSize: 17, fontWeight: "900", color: colours.ink },
  allClear: {
    padding: 15,
    borderRadius: 17,
    backgroundColor: "#EAF8F2",
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  allClearText: { fontSize: 15, color: colours.muted },
  metric: {
    width: "48%",
    minHeight: 118,
    backgroundColor: colours.card,
    borderWidth: 1,
    borderColor: colours.line,
    borderRadius: 18,
    padding: 16,
  },
  metricValue: { color: colours.ink, fontSize: 29, fontWeight: "900", marginTop: 6 },
  metricLabel: { color: colours.muted, fontSize: 14, fontWeight: "700", marginTop: 2 },
  action: {
    minHeight: 76,
    backgroundColor: colours.card,
    borderWidth: 1,
    borderColor: colours.line,
    borderRadius: 18,
    padding: 13,
    marginBottom: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  actionIcon: {
    width: 50,
    height: 50,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: { flex: 1 },
  actionTitle: { color: colours.ink, fontSize: 17, fontWeight: "900" },
  actionHint: { color: colours.muted, fontSize: 14, marginTop: 3 },
});
