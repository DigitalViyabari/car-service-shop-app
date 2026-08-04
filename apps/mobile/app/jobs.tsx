import type { JobSheet } from "@dvcs/types";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { collection, getDocs, query, where } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MobileNav } from "../components/mobile-nav";
import { firebase } from "../lib/firebase";
import { apiGet } from "../lib/mobile-api";
import { useMobileAuth } from "../lib/mobile-auth";
import { colours, statusColours } from "../lib/theme";
import { canCreateOperations, canViewAssignedJobs, canViewWorkshopJobs } from "../lib/mobile-roles";

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

export default function JobsScreen() {
  const { user, membership, company, branch, loading: authLoading } = useMobileAuth();
  const [jobs, setJobs] = useState<JobSheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const assignedOnly = useMemo(
    () =>
      !canViewWorkshopJobs(membership, branch?.id) && canViewAssignedJobs(membership, branch?.id),
    [branch, membership],
  );
  const canView =
    canViewWorkshopJobs(membership, branch?.id) || canViewAssignedJobs(membership, branch?.id);
  const canCreate = canCreateOperations(membership, branch?.id);
  const load = useCallback(async () => {
    if (!user || !company || !branch) return;
    setLoading(true);
    setError(null);
    try {
      const loaded = assignedOnly
        ? (
            await apiGet<{ jobs: JobSheet[] }>(
              user,
              `/v1/jobs/assigned?companyId=${encodeURIComponent(company.id)}&branchId=${encodeURIComponent(branch.id)}`,
            )
          ).jobs
        : (
            await getDocs(
              query(
                collection(firebase.db, "jobSheets"),
                where("companyId", "==", company.id),
                where("branchId", "==", branch.id),
              ),
            )
          ).docs.map((item) => ({ ...item.data(), id: item.id }) as JobSheet);
      setJobs(
        loaded
          .filter(
            (job) =>
              job.companyId === company.id &&
              job.branchId === branch.id &&
              !["delivered", "cancelled"].includes(job.status),
          )
          .sort((a, b) => (a.priority === "breakdown" ? -1 : b.priority === "breakdown" ? 1 : 0)),
      );
    } catch (reason) {
      setJobs([]);
      setError(reason instanceof Error ? reason.message : "Unable to load assigned jobs.");
    } finally {
      setLoading(false);
    }
  }, [assignedOnly, branch, company, user]);
  useEffect(() => {
    if (!authLoading && !user) router.replace("/");
    if (branch) void load();
  }, [authLoading, branch, load, user]);

  if (!canView)
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Job cards are not assigned to this role.</Text>
        </View>
        <MobileNav />
      </SafeAreaView>
    );
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>
            {assignedOnly ? "MY ASSIGNED WORK" : "WORKSHOP OPERATIONS"}
          </Text>
          <Text style={styles.title}>Job Cards</Text>
          <Text style={styles.sub}>{jobs.length} active</Text>
        </View>
        <View style={styles.headerActions}>
          {canCreate ? (
            <TouchableOpacity style={styles.create} onPress={() => router.push("/create-job")}>
              <Ionicons name="add" size={27} color="#FFF" />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.refresh} onPress={() => router.replace("/home")}>
            <Ionicons name="home" size={24} color={colours.ink} />
          </TouchableOpacity>
        </View>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colours.red} />
        </View>
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="checkmark-circle" size={46} color={colours.green} />
              <Text style={styles.emptyTitle}>No active jobs</Text>
              <Text style={styles.emptyText}>
                {assignedOnly
                  ? "New assigned work will appear here."
                  : "The workshop queue is clear."}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const colour = statusColours[item.status] ?? colours.muted;
            return (
              <TouchableOpacity
                style={styles.job}
                activeOpacity={0.82}
                onPress={() => router.push({ pathname: "/job/[id]", params: { id: item.id } })}
              >
                <View style={[styles.stage, { backgroundColor: colour }]} />
                <View style={styles.jobBody}>
                  <View style={styles.jobTop}>
                    <Text style={styles.registration}>{item.registrationNumber}</Text>
                    {item.priority === "breakdown" ? (
                      <View style={styles.urgent}>
                        <Ionicons name="flash" size={14} color="#FFFFFF" />
                        <Text style={styles.urgentText}>URGENT</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.vehicle}>{item.vehicleLabel}</Text>
                  <Text style={styles.service}>{item.serviceType}</Text>
                  <View style={styles.statusRow}>
                    <View style={[styles.dot, { backgroundColor: colour }]} />
                    <Text style={[styles.status, { color: colour }]}>
                      {labels[item.status] ?? item.status}
                    </Text>
                    <Text style={styles.jobNumber}>{item.jobNumber}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={23} color={colours.muted} />
              </TouchableOpacity>
            );
          }}
        />
      )}
      <MobileNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colours.canvas },
  header: {
    padding: 20,
    paddingBottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  eyebrow: { color: colours.red, fontSize: 12, fontWeight: "900", letterSpacing: 1.1 },
  title: { color: colours.ink, fontSize: 31, fontWeight: "900", marginTop: 4 },
  sub: { color: colours.muted, fontSize: 15, fontWeight: "700", marginTop: 3 },
  refresh: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: colours.card,
    borderWidth: 1,
    borderColor: colours.line,
    alignItems: "center",
    justifyContent: "center",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 16, paddingTop: 4, paddingBottom: 96, gap: 12, flexGrow: 1 },
  headerActions: { flexDirection: "row", gap: 8 },
  create: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: colours.red,
    alignItems: "center",
    justifyContent: "center",
  },
  error: {
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 13,
    borderRadius: 12,
    backgroundColor: "#FDEBEC",
    color: "#A82024",
    fontWeight: "700",
  },
  job: {
    minHeight: 145,
    backgroundColor: colours.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colours.line,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
    paddingRight: 14,
  },
  stage: { width: 7, alignSelf: "stretch" },
  jobBody: { flex: 1, padding: 16 },
  jobTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  registration: { color: colours.ink, fontSize: 21, fontWeight: "900" },
  urgent: {
    backgroundColor: colours.red,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  urgentText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
  vehicle: { color: colours.muted, fontSize: 15, fontWeight: "700", marginTop: 5 },
  service: { color: colours.ink, fontSize: 15, marginTop: 8 },
  statusRow: { flexDirection: "row", alignItems: "center", marginTop: 12 },
  dot: { width: 9, height: 9, borderRadius: 5, marginRight: 7 },
  status: { fontSize: 13, fontWeight: "900" },
  jobNumber: { color: colours.muted, fontSize: 12, marginLeft: "auto" },
  empty: { flex: 1, minHeight: 320, alignItems: "center", justifyContent: "center", padding: 30 },
  emptyTitle: { color: colours.ink, fontSize: 22, fontWeight: "900", marginTop: 13 },
  emptyText: { color: colours.muted, fontSize: 16, textAlign: "center", marginTop: 6 },
});
