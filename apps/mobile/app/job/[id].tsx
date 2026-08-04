import type { JobSheet, JobStatus } from "@dvcs/types";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { apiGet, apiRequest } from "../../lib/mobile-api";
import { useMobileAuth } from "../../lib/mobile-auth";
import { canViewAssignedJobs, canViewWorkshopJobs } from "../../lib/mobile-roles";
import { firebase } from "../../lib/firebase";
import { colours, statusColours } from "../../lib/theme";

const stages: Array<[JobStatus, string]> = [
  ["check_in", "Check-In"],
  ["inspection", "Inspection"],
  ["estimate_pending", "Estimate Pending"],
  ["approved", "Approved"],
  ["in_progress", "In Progress"],
  ["quality_check", "Quality Check"],
  ["ready", "Ready"],
  ["delivered", "Delivered"],
];
const technicianStages: JobStatus[] = [
  "inspection",
  "estimate_pending",
  "in_progress",
  "quality_check",
];

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, membership, company, branch } = useMobileAuth();
  const workshopAccess = canViewWorkshopJobs(membership, branch?.id);
  const assignedAccess = canViewAssignedJobs(membership, branch?.id);
  const technicianOnly = !workshopAccess && assignedAccess;
  const [job, setJob] = useState<JobSheet | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id || !user || !company || !branch) return;
    setLoading(true);
    setError(null);
    try {
      if (technicianOnly) {
        const result = await apiGet<{ jobs: JobSheet[] }>(
          user,
          `/v1/jobs/assigned?companyId=${encodeURIComponent(company.id)}&branchId=${encodeURIComponent(branch.id)}`,
        );
        const found = result.jobs.find((item) => item.id === id);
        if (!found) throw new Error("This job is not assigned to you.");
        setJob(found);
      } else {
        const snapshot = await getDoc(doc(firebase.db, "jobSheets", id));
        if (!snapshot.exists()) throw new Error("Job card not found.");
        setJob({ ...snapshot.data(), id: snapshot.id } as JobSheet);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to open this job.");
    } finally {
      setLoading(false);
    }
  }, [branch, company, id, technicianOnly, user]);
  useEffect(() => {
    void load();
  }, [load]);

  const next = useMemo(() => {
    if (!job) return null;
    const index = stages.findIndex(([status]) => status === job.status);
    return index >= 0 ? stages[index + 1] : undefined;
  }, [job]);
  const canAdvance = Boolean(
    next &&
    (workshopAccess || (technicianOnly && technicianStages.includes(next[0]))) &&
    !(next?.[0] === "in_progress" && !job?.assignedTechnicianIds?.length),
  );

  async function advance() {
    if (!user || !company || !branch || !job || !next) return;
    if (next[0] === "ready" && note.trim().length < 3) {
      setError("Enter a short quality-check note before marking the vehicle ready.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiRequest(user, "/v1/jobs/status", {
        companyId: company.id,
        branchId: branch.id,
        jobId: job.id,
        status: next[0],
        qualityNotes: next[0] === "ready" ? note.trim() : "",
        cancellationReason: "",
        deliveryNotes: "",
        nextServiceDueAt: null,
        nextServiceDueKm: null,
      });
      setNote("");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update the job status.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={25} color={colours.ink} />
        </TouchableOpacity>
        <View>
          <Text style={styles.eyebrow}>JOB CARD</Text>
          <Text style={styles.title}>{job?.jobNumber ?? "Job Details"}</Text>
        </View>
      </View>
      {loading ? (
        <ActivityIndicator size="large" color={colours.red} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {job ? (
            <>
              <View
                style={[
                  styles.hero,
                  { borderLeftColor: statusColours[job.status] ?? colours.blue },
                ]}
              >
                <Text style={styles.registration}>{job.registrationNumber}</Text>
                <Text style={styles.vehicle}>{job.vehicleLabel}</Text>
                <View style={styles.statusRow}>
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: statusColours[job.status] ?? colours.blue },
                    ]}
                  />
                  <Text style={styles.status}>
                    {stages.find(([value]) => value === job.status)?.[1] ?? job.status}
                  </Text>
                </View>
              </View>
              <View style={styles.card}>
                <Info label="Service Type" value={job.serviceType} />
                <Info
                  label="Priority"
                  value={
                    job.priority === "breakdown"
                      ? "Very Urgent"
                      : job.priority === "urgent"
                        ? "Priority"
                        : "Normal"
                  }
                />
                <Info
                  label="Assigned"
                  value={job.assignedTechnicianIds?.length ? "Assigned Technician" : "Unassigned"}
                />
                <Info
                  label="Fuel"
                  value={job.fuelLevel == null ? "Unknown / Not Recorded" : `${job.fuelLevel}%`}
                />
              </View>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Customer Complaints</Text>
                {job.complaints.map((item, index) => (
                  <Text key={`${item}-${index}`} style={styles.complaint}>
                    • {item}
                  </Text>
                ))}
              </View>
              {next?.[0] === "ready" && workshopAccess ? (
                <TextInput
                  style={styles.note}
                  value={note}
                  onChangeText={setNote}
                  multiline
                  placeholder="Quality-check note"
                  textAlignVertical="top"
                />
              ) : null}
              {next ? (
                <View style={styles.next}>
                  <Text style={styles.nextLabel}>NEXT STAGE</Text>
                  <Text style={styles.nextTitle}>{next[1]}</Text>
                  {next[0] === "in_progress" && !job.assignedTechnicianIds?.length ? (
                    <Text style={styles.warning}>
                      Assign a technician from the web workspace before starting work.
                    </Text>
                  ) : null}
                </View>
              ) : null}
              {canAdvance ? (
                <TouchableOpacity
                  style={styles.advance}
                  onPress={() => void advance()}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <>
                      <Text style={styles.advanceText}>Move To {next?.[1]}</Text>
                      <Ionicons name="arrow-forward" size={22} color="#FFF" />
                    </>
                  )}
                </TouchableOpacity>
              ) : null}
            </>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.info}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
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
  title: { fontSize: 23, fontWeight: "900", color: colours.ink },
  content: { padding: 18, paddingBottom: 40, gap: 13 },
  error: {
    padding: 14,
    borderRadius: 13,
    backgroundColor: "#FDEBEC",
    color: "#A82024",
    fontWeight: "800",
  },
  hero: {
    padding: 20,
    borderRadius: 20,
    backgroundColor: colours.card,
    borderWidth: 1,
    borderColor: colours.line,
    borderLeftWidth: 7,
  },
  registration: { fontSize: 28, fontWeight: "900", color: colours.ink },
  vehicle: { fontSize: 16, color: colours.muted, fontWeight: "700", marginTop: 5 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14 },
  dot: { width: 11, height: 11, borderRadius: 6 },
  status: { fontSize: 15, fontWeight: "900", color: colours.ink },
  card: {
    padding: 18,
    borderRadius: 18,
    backgroundColor: colours.card,
    borderWidth: 1,
    borderColor: colours.line,
    gap: 13,
  },
  cardTitle: { fontSize: 17, fontWeight: "900", color: colours.ink },
  info: { flexDirection: "row", justifyContent: "space-between", gap: 15 },
  infoLabel: { fontSize: 14, color: colours.muted, fontWeight: "700" },
  infoValue: { fontSize: 14, color: colours.ink, fontWeight: "900", textAlign: "right", flex: 1 },
  complaint: { fontSize: 16, lineHeight: 23, color: colours.ink },
  note: {
    minHeight: 100,
    borderWidth: 1.5,
    borderColor: colours.line,
    borderRadius: 16,
    backgroundColor: colours.card,
    padding: 14,
    fontSize: 16,
  },
  next: {
    padding: 17,
    borderRadius: 17,
    backgroundColor: "#EAF3FD",
    borderLeftWidth: 5,
    borderLeftColor: colours.blue,
  },
  nextLabel: { fontSize: 11, fontWeight: "900", letterSpacing: 1, color: colours.blue },
  nextTitle: { fontSize: 20, fontWeight: "900", color: colours.ink, marginTop: 4 },
  warning: { fontSize: 14, lineHeight: 20, color: "#9B6200", marginTop: 8, fontWeight: "700" },
  advance: {
    height: 62,
    borderRadius: 17,
    backgroundColor: colours.red,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  advanceText: { color: "#FFF", fontSize: 17, fontWeight: "900" },
});
