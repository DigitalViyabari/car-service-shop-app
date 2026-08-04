import type { Customer, JobPriority, JobSheet, ServiceType, Vehicle } from "@dvcs/types";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { collection, getDocs, query, where } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { firebase } from "../lib/firebase";
import { apiRequest } from "../lib/mobile-api";
import { DateField, SelectField } from "../components/form-controls";
import { useMobileAuth } from "../lib/mobile-auth";
import { canCreateOperations } from "../lib/mobile-roles";
import { colours } from "../lib/theme";

const defaults = [
  "General Service",
  "Oil Change",
  "Mechanical Repair",
  "AC Service",
  "Electrical Work",
  "Water Wash",
];
export default function CreateJobScreen() {
  const { user, membership, company, branch } = useMobileAuth();
  const [customers, setCustomers] = useState<Customer[]>([]),
    [vehicles, setVehicles] = useState<Vehicle[]>([]),
    [jobs, setJobs] = useState<JobSheet[]>([]),
    [services, setServices] = useState<string[]>(defaults);
  const [customerId, setCustomerId] = useState(""),
    [vehicleId, setVehicleId] = useState(""),
    [serviceType, setServiceType] = useState(defaults[0]!),
    [complaints, setComplaints] = useState(""),
    [odometer, setOdometer] = useState(""),
    [priority, setPriority] = useState<JobPriority>("normal");
  const [fuelLevel, setFuelLevel] = useState<string>("unknown"),
    [promisedAt, setPromisedAt] = useState(""),
    [internalNotes, setInternalNotes] = useState("");
  const [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState<string | null>(null);
  const allowed = canCreateOperations(membership, branch?.id);
  const customerVehicles = useMemo(
    () => vehicles.filter((item) => item.customerId === customerId),
    [customerId, vehicles],
  );
  const selectedVehicle = vehicles.find((item) => item.id === vehicleId);
  const activeJob = jobs.find(
    (item) => item.vehicleId === vehicleId && !["delivered", "cancelled"].includes(item.status),
  );
  const load = useCallback(async () => {
    if (!company || !branch || !allowed) return setLoading(false);
    try {
      const [c, v, j, s] = await Promise.all([
        getDocs(
          query(
            collection(firebase.db, "customers"),
            where("companyId", "==", company.id),
            where("branchId", "==", branch.id),
          ),
        ),
        getDocs(
          query(
            collection(firebase.db, "vehicles"),
            where("companyId", "==", company.id),
            where("branchId", "==", branch.id),
          ),
        ),
        getDocs(
          query(
            collection(firebase.db, "jobSheets"),
            where("companyId", "==", company.id),
            where("branchId", "==", branch.id),
          ),
        ),
        getDocs(
          query(collection(firebase.db, "serviceTypes"), where("companyId", "==", company.id)),
        ),
      ]);
      setCustomers(
        c.docs
          .map((x) => ({ ...x.data(), id: x.id }) as Customer)
          .filter((x) => x.status === "active"),
      );
      setVehicles(
        v.docs
          .map((x) => ({ ...x.data(), id: x.id }) as Vehicle)
          .filter((x) => x.status === "active"),
      );
      setJobs(j.docs.map((x) => ({ ...x.data(), id: x.id }) as JobSheet));
      setServices([
        ...new Set([...defaults, ...s.docs.map((x) => (x.data() as ServiceType).name)]),
      ]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load job details.");
    } finally {
      setLoading(false);
    }
  }, [allowed, branch, company]);
  useEffect(() => {
    void load();
  }, [load]);
  async function save() {
    const items = complaints
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
    if (
      !user ||
      !company ||
      !branch ||
      !customerId ||
      !vehicleId ||
      !serviceType ||
      !items.length
    ) {
      setError("Select customer and vehicle, then enter the customer complaint.");
      return;
    }
    if (activeJob) {
      setError(`This car is already inside the workshop under ${activeJob.jobNumber}.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiRequest<{ jobId: string }>(user, "/v1/jobs/create", {
        companyId: company.id,
        branchId: branch.id,
        customerId,
        vehicleId,
        serviceType,
        priority,
        odometer: odometer ? Number(odometer) : null,
        fuelLevel: fuelLevel === "unknown" ? null : Number(fuelLevel),
        complaints: items,
        internalNotes: internalNotes.trim(),
        promisedAt: promisedAt.trim() || null,
      });
      router.replace("/jobs");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create job.");
    } finally {
      setSaving(false);
    }
  }
  if (!allowed)
    return (
      <SafeAreaView style={styles.screen}>
        <Header />
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Job creation is not assigned to this account.</Text>
        </View>
      </SafeAreaView>
    );
  if (loading)
    return (
      <SafeAreaView style={styles.screen}>
        <Header />
        <ActivityIndicator size="large" color={colours.red} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  return (
    <SafeAreaView style={styles.screen}>
      <Header />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <SelectField
          label="Customer *"
          value={customerId}
          onChange={(value) => {
            setCustomerId(value);
            setVehicleId("");
          }}
          options={[
            { value: "", label: "Select Customer" },
            ...customers.map((item) => ({ value: item.id, label: `${item.name} · ${item.phone}` })),
          ]}
        />
        {!customers.length ? (
          <TouchableOpacity style={styles.link} onPress={() => router.push("/customers")}>
            <Text style={styles.linkText}>Create a customer first</Text>
          </TouchableOpacity>
        ) : null}
        <SelectField
          label="Vehicle *"
          value={vehicleId}
          enabled={Boolean(customerId)}
          onChange={(value) => {
            setVehicleId(value);
            const selected = vehicles.find((item) => item.id === value);
            if (selected?.odometer != null) setOdometer(String(selected.odometer));
          }}
          options={[
            { value: "", label: "Select Vehicle" },
            ...customerVehicles.map((item) => ({
              value: item.id,
              label: `${item.registrationNumber} · ${item.make} ${item.model}`,
            })),
          ]}
        />
        {customerId && !customerVehicles.length ? (
          <Text style={styles.hint}>Add a vehicle from Customers before creating this job.</Text>
        ) : null}
        {activeJob ? (
          <Text style={styles.warning}>Vehicle already in workshop: {activeJob.jobNumber}</Text>
        ) : null}
        <SelectField
          label="Service Type *"
          value={serviceType}
          onChange={setServiceType}
          options={services.map((value) => ({ value, label: value }))}
        />
        <SelectField
          label="Priority"
          value={priority}
          onChange={(value) => setPriority(value as JobPriority)}
          options={[
            { value: "normal", label: "🟢 Normal" },
            { value: "urgent", label: "🟡 Priority" },
            { value: "breakdown", label: "🔴 Very Urgent / Breakdown" },
          ]}
        />
        <Text style={styles.label}>Customer Complaint *</Text>
        <TextInput
          style={styles.area}
          value={complaints}
          onChangeText={setComplaints}
          multiline
          placeholder="Describe the work needed"
          textAlignVertical="top"
        />
        <Text style={styles.label}>Odometer (Optional)</Text>
        <TextInput
          style={styles.input}
          value={odometer}
          onChangeText={setOdometer}
          keyboardType="number-pad"
          placeholder="Kilometres"
        />
        <SelectField
          label="Fuel Level"
          value={fuelLevel}
          onChange={setFuelLevel}
          options={[
            { value: "unknown", label: "Unknown / Not Recorded" },
            { value: "0", label: "0% · Empty" },
            { value: "10", label: "10%" },
            { value: "25", label: "25% · Quarter" },
            { value: "50", label: "50% · Half" },
            { value: "75", label: "75% · Three Quarters" },
            { value: "100", label: "100% · Full" },
          ]}
        />
        <DateField
          label="Promised Delivery"
          value={promisedAt}
          onChange={setPromisedAt}
          includeTime
        />
        <Text style={styles.label}>Internal Workshop Notes (Optional)</Text>
        <TextInput
          style={styles.areaSmall}
          value={internalNotes}
          onChangeText={setInternalNotes}
          multiline
          placeholder="Notes visible to workshop team"
          textAlignVertical="top"
        />
        <TouchableOpacity
          style={[styles.save, (!selectedVehicle || saving) && styles.disabled]}
          onPress={() => void save()}
          disabled={!selectedVehicle || saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Ionicons name="document-text" size={23} color="#FFF" />
              <Text style={styles.saveText}>Create Job Card</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
function Header() {
  return (
    <View style={styles.header}>
      <TouchableOpacity style={styles.back} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={25} color={colours.ink} />
      </TouchableOpacity>
      <View>
        <Text style={styles.eyebrow}>NEW WORK</Text>
        <Text style={styles.title}>Create Job</Text>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colours.canvas },
  header: { padding: 20, flexDirection: "row", alignItems: "center", gap: 14 },
  back: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: colours.card,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colours.line,
  },
  eyebrow: { color: colours.red, fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  title: { fontSize: 28, fontWeight: "900", color: colours.ink },
  content: { paddingHorizontal: 20, paddingBottom: 35 },
  error: {
    padding: 14,
    borderRadius: 13,
    backgroundColor: "#FDEBEC",
    color: "#A82024",
    fontWeight: "800",
    fontSize: 15,
  },
  label: { fontSize: 16, fontWeight: "900", color: colours.ink, marginTop: 19, marginBottom: 9 },
  choices: { gap: 8 },
  choice: {
    minHeight: 52,
    padding: 13,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colours.line,
    backgroundColor: colours.card,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  choiceActive: { borderColor: colours.red, backgroundColor: "#FFF5F5" },
  choiceText: { fontSize: 16, fontWeight: "700", color: colours.ink, flex: 1 },
  choiceTextActive: { fontWeight: "900" },
  priority: { flexDirection: "row", gap: 7 },
  priorityItem: {
    flex: 1,
    minHeight: 60,
    borderWidth: 1.5,
    borderColor: colours.line,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  priorityText: { fontSize: 12, fontWeight: "900", color: colours.ink },
  area: {
    minHeight: 115,
    borderWidth: 1.5,
    borderColor: colours.line,
    borderRadius: 15,
    backgroundColor: colours.card,
    padding: 14,
    fontSize: 17,
    color: colours.ink,
  },
  areaSmall: {
    minHeight: 88,
    borderWidth: 1.5,
    borderColor: colours.line,
    borderRadius: 15,
    backgroundColor: colours.card,
    padding: 14,
    fontSize: 16,
    color: colours.ink,
  },
  input: {
    height: 56,
    borderWidth: 1.5,
    borderColor: colours.line,
    borderRadius: 15,
    backgroundColor: colours.card,
    paddingHorizontal: 14,
    fontSize: 17,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colours.line,
    backgroundColor: colours.card,
  },
  chipActive: { backgroundColor: colours.navy, borderColor: colours.navy },
  chipText: { fontSize: 13, fontWeight: "800", color: colours.ink },
  chipTextActive: { color: "#FFF" },
  save: {
    height: 62,
    borderRadius: 17,
    backgroundColor: colours.red,
    marginTop: 24,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  saveText: { color: "#FFF", fontSize: 18, fontWeight: "900" },
  disabled: { opacity: 0.5 },
  warning: {
    padding: 13,
    borderRadius: 12,
    backgroundColor: "#FFF0D5",
    color: "#8A5A00",
    fontWeight: "800",
    marginTop: 10,
  },
  hint: { color: colours.muted, fontSize: 14, marginTop: 7 },
  link: { padding: 12, alignItems: "center" },
  linkText: { color: colours.blue, fontWeight: "900" },
  notice: { margin: 20, padding: 30, backgroundColor: colours.card, borderRadius: 20 },
  noticeTitle: { fontSize: 18, fontWeight: "900", color: colours.ink },
});
