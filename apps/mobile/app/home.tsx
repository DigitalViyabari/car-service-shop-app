import type { JobSheet } from "@dvcs/types";
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
import { useMobileAuth } from "../lib/mobile-auth";
import { colours } from "../lib/theme";
import { canCreateOperations, canManageCustomers, isTechnicianOnly } from "../lib/mobile-roles";

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
  const [refreshing, setRefreshing] = useState(false);
  const technician = useMemo(() => isTechnicianOnly(membership, branch?.id), [branch, membership]);
  const canCreate = canCreateOperations(membership, branch?.id);
  const canCustomers = canManageCustomers(membership, branch?.id);

  const loadJobs = useCallback(async () => {
    if (!user || !company || !branch) return;
    const snapshot = await getDocs(
      technician
        ? query(
            collection(firebase.db, "jobSheets"),
            where("assignedTechnicianIds", "array-contains", user.uid),
          )
        : query(
            collection(firebase.db, "jobSheets"),
            where("companyId", "==", company.id),
            where("branchId", "==", branch.id),
          ),
    );
    setJobs(
      snapshot.docs
        .map((item) => ({ ...item.data(), id: item.id }) as JobSheet)
        .filter((job) => job.companyId === company.id && job.branchId === branch.id),
    );
  }, [branch, company, technician, user]);

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
    inProgress = active.filter((job) => job.status === "in_progress").length;

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
        </View>

        <Text style={styles.sectionTitle}>What Should I Do Next?</Text>
        <View style={styles.guide}>
          <View style={styles.guideNumber}><Text style={styles.guideNumberText}>1</Text></View>
          <View style={styles.guideText}><Text style={styles.guideTitle}>{technician ? "Open Your Assigned Job" : urgent ? "Handle The Urgent Job" : active.length ? "Continue Active Work" : "Create The Next Job"}</Text><Text style={styles.guideHint}>{technician ? "Open Jobs and continue the current workshop stage." : urgent ? `${urgent} very urgent job${urgent===1?' needs':'s need'} attention.` : active.length ? `${active.length} job${active.length===1?' is':'s are'} waiting in the workshop.` : "The workshop queue is clear."}</Text></View>
          <Ionicons name="arrow-forward-circle" size={31} color={colours.blue}/>
        </View>

        <Text style={styles.sectionTitle}>Quick actions</Text>
        {canCreate ? <TouchableOpacity style={styles.action} onPress={() => router.push("/create-job")}>
          <View style={[styles.actionIcon,{backgroundColor:'#FDEBEC'}]}><Ionicons name="add-circle" size={26} color={colours.red}/></View><View style={styles.actionText}><Text style={styles.actionTitle}>Create New Job</Text><Text style={styles.actionHint}>Open a job card quickly</Text></View><Ionicons name="chevron-forward" size={23} color={colours.muted}/>
        </TouchableOpacity> : null}
        {canCustomers ? <TouchableOpacity style={styles.action} onPress={() => router.push("/customers")}>
          <View style={[styles.actionIcon,{backgroundColor:'#E9F7F1'}]}><Ionicons name="people" size={25} color={colours.green}/></View><View style={styles.actionText}><Text style={styles.actionTitle}>Customers</Text><Text style={styles.actionHint}>View or create customer</Text></View><Ionicons name="chevron-forward" size={23} color={colours.muted}/>
        </TouchableOpacity> : null}
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
  value: number;
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
  guide:{minHeight:98,backgroundColor:'#EAF3FC',borderRadius:18,borderLeftWidth:6,borderLeftColor:colours.blue,padding:15,flexDirection:'row',alignItems:'center',gap:12},
  guideNumber:{width:38,height:38,borderRadius:12,backgroundColor:colours.blue,alignItems:'center',justifyContent:'center'},guideNumberText:{color:'#FFF',fontWeight:'900',fontSize:18},guideText:{flex:1},guideTitle:{color:colours.ink,fontSize:17,fontWeight:'900'},guideHint:{color:colours.muted,fontSize:14,lineHeight:20,marginTop:3},
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
