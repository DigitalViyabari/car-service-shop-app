import type {
  Customer,
  CustomerType,
  Vehicle,
  VehicleCatalogEntry,
  VehicleFuelType,
  VehicleTransmission,
} from "@dvcs/types";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import {
  collection,
  doc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { firebase } from "../lib/firebase";
import { DateField, SelectField } from "../components/form-controls";
import { useMobileAuth } from "../lib/mobile-auth";
import { canManageCustomers } from "../lib/mobile-roles";
import { colours } from "../lib/theme";
import { indianVehicleCatalogue } from "../../web/lib/indian-vehicle-catalogue";

const fuels: Array<[VehicleFuelType, string]> = [
  ["petrol", "Petrol"],
  ["diesel", "Diesel"],
  ["cng", "CNG"],
  ["petrol_cng", "Petrol + CNG"],
  ["electric", "Electric"],
  ["hybrid", "Hybrid"],
  ["other", "Other"],
];
const transmissions: Array<[VehicleTransmission, string]> = [
  ["manual", "Manual"],
  ["automatic", "Automatic"],
  ["amt", "AMT"],
  ["cvt", "CVT"],
  ["dct", "DCT"],
  ["other", "Other"],
];
export default function CustomersScreen() {
  const { user, membership, company, branch } = useMobileAuth();
  const [customers, setCustomers] = useState<Customer[]>([]),
    [vehicles, setVehicles] = useState<Vehicle[]>([]),
    [catalogue, setCatalogue] = useState<VehicleCatalogEntry[]>([]);
  const [customerForm, setCustomerForm] = useState(false),
    [vehicleCustomerId, setVehicleCustomerId] = useState<string | null>(null);
  const [customerType, setCustomerType] = useState<CustomerType>("individual"),
    [name, setName] = useState(""),
    [phone, setPhone] = useState(""),
    [alternatePhone, setAlternatePhone] = useState(""),
    [email, setEmail] = useState(""),
    [gstin, setGstin] = useState(""),
    [address, setAddress] = useState(""),
    [customerNotes, setCustomerNotes] = useState("");
  const [registration, setRegistration] = useState(""),
    [make, setMake] = useState(""),
    [model, setModel] = useState(""),
    [variant, setVariant] = useState(""),
    [colour, setColour] = useState(""),
    [year, setYear] = useState(""),
    [fuel, setFuel] = useState<VehicleFuelType>("petrol"),
    [odometer, setOdometer] = useState(""),
    [insurance, setInsurance] = useState(""),
    [transmission, setTransmission] = useState<VehicleTransmission>("manual"),
    [vin, setVin] = useState(""),
    [vehicleNotes, setVehicleNotes] = useState("");
  const [customMake, setCustomMake] = useState(false),
    [customModel, setCustomModel] = useState(false);
  const [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState<string | null>(null);
  const allowed = canManageCustomers(membership, branch?.id);
  const load = useCallback(async () => {
    if (!company || !branch || !allowed) return setLoading(false);
    setLoading(true);
    try {
      const [c, v, vc] = await Promise.all([
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
          query(collection(firebase.db, "vehicleCatalog"), where("companyId", "==", company.id)),
        ),
      ]);
      setCustomers(
        c.docs
          .map((x) => ({ ...x.data(), id: x.id }) as Customer)
          .filter((x) => x.status === "active")
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setVehicles(
        v.docs
          .map((x) => ({ ...x.data(), id: x.id }) as Vehicle)
          .filter((x) => x.status === "active"),
      );
      setCatalogue(
        vc.docs
          .map((x) => ({ ...x.data(), id: x.id }) as VehicleCatalogEntry)
          .filter((x) => x.status === "active"),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load customers.");
    } finally {
      setLoading(false);
    }
  }, [allowed, branch, company]);
  useEffect(() => {
    void load();
  }, [load]);
  async function saveCustomer() {
    const cleanPhone = phone.replace(/\D/g, "");
    if (!user || !company || !branch || name.trim().length < 2 || cleanPhone.length < 10) {
      setError("Enter the customer name and a valid mobile number.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const ref = doc(collection(firebase.db, "customers")),
        now = serverTimestamp();
      await writeBatch(firebase.db)
        .set(ref, {
          companyId: company.id,
          branchId: branch.id,
          type: customerType,
          name: name.trim(),
          phone: cleanPhone,
          alternatePhone: alternatePhone.replace(/\D/g, ""),
          email: email.trim().toLowerCase(),
          gstin: gstin.trim().toUpperCase(),
          address: address.trim(),
          notes: customerNotes.trim(),
          searchName: name.trim().toLowerCase(),
          searchPhone: cleanPhone,
          vehicleCount: 0,
          status: "active",
          createdAt: now,
          createdBy: user.uid,
          updatedAt: now,
          updatedBy: user.uid,
        })
        .commit();
      setName("");
      setPhone("");
      setAlternatePhone("");
      setEmail("");
      setGstin("");
      setAddress("");
      setCustomerNotes("");
      setCustomerType("individual");
      setCustomerForm(false);
      setVehicleCustomerId(ref.id);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create customer.");
    } finally {
      setSaving(false);
    }
  }
  async function saveVehicle() {
    const reg = registration.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (
      !user ||
      !company ||
      !branch ||
      !vehicleCustomerId ||
      reg.length < 6 ||
      !make.trim() ||
      !model.trim()
    ) {
      setError("Enter registration number, make and model.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const ref = doc(collection(firebase.db, "vehicles")),
        batch = writeBatch(firebase.db),
        now = serverTimestamp();
      batch.set(ref, {
        companyId: company.id,
        branchId: branch.id,
        customerId: vehicleCustomerId,
        registrationNumber: reg,
        searchRegistration: reg,
        make: make.trim(),
        model: model.trim(),
        variant: variant.trim(),
        colour: colour.trim(),
        year: year ? Number(year) : null,
        fuelType: fuel,
        transmission,
        vin: vin.trim().toUpperCase(),
        odometer: odometer ? Number(odometer) : null,
        insuranceExpiryDate: insurance || "",
        insuranceReminderEnabled: Boolean(insurance),
        notes: vehicleNotes.trim(),
        status: "active",
        createdAt: now,
        createdBy: user.uid,
        updatedAt: now,
        updatedBy: user.uid,
      });
      batch.update(doc(firebase.db, "customers", vehicleCustomerId), {
        vehicleCount: increment(1),
        updatedAt: now,
        updatedBy: user.uid,
      });
      await batch.commit();
      closeVehicle();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create vehicle.");
    } finally {
      setSaving(false);
    }
  }
  function closeVehicle() {
    setVehicleCustomerId(null);
    setRegistration("");
    setMake("");
    setModel("");
    setVariant("");
    setColour("");
    setYear("");
    setFuel("petrol");
    setOdometer("");
    setInsurance("");
    setTransmission("manual");
    setVin("");
    setVehicleNotes("");
    setCustomMake(false);
    setCustomModel(false);
  }
  const makes = [
    ...new Set([...indianVehicleCatalogue.map((x) => x.make), ...catalogue.map((x) => x.make)]),
  ].sort();
  const models = [
    ...new Set([
      ...indianVehicleCatalogue.filter((x) => x.make === make).map((x) => x.model),
      ...catalogue.filter((x) => x.make === make).map((x) => x.model),
    ]),
  ].sort();
  const variants = [
    ...new Set(
      catalogue
        .filter((x) => x.make === make && x.model === model)
        .map((x) => x.variant)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  if (!allowed)
    return (
      <SafeAreaView style={styles.screen}>
        <Header />
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Customer access is restricted</Text>
        </View>
      </SafeAreaView>
    );
  return (
    <SafeAreaView style={styles.screen}>
      <Header />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {customerForm ? (
        <ScrollView
          style={styles.form}
          contentContainerStyle={styles.formContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.formTitle}>New Customer</Text>
          <SelectField
            label="Customer Type"
            value={customerType}
            onChange={(value) => setCustomerType(value as CustomerType)}
            options={[
              { value: "individual", label: "Individual" },
              { value: "business", label: "Business" },
            ]}
          />
          <Field label="Customer Name *" value={name} set={setName} placeholder="Full name" />
          <Field
            label="Mobile Number *"
            value={phone}
            set={setPhone}
            placeholder="10-digit number"
            keyboard="phone-pad"
          />
          <Field
            label="Alternate Number"
            value={alternatePhone}
            set={setAlternatePhone}
            placeholder="Optional"
            keyboard="phone-pad"
          />
          <Field
            label="Email"
            value={email}
            set={setEmail}
            placeholder="Optional"
            keyboard="email-address"
          />
          <Field label="GSTIN" value={gstin} set={setGstin} placeholder="For business customers" />
          <Field label="Address" value={address} set={setAddress} placeholder="Optional" />
          <Field
            label="Notes"
            value={customerNotes}
            set={setCustomerNotes}
            placeholder="Optional"
            multiline
          />
          <Buttons
            cancel={() => setCustomerForm(false)}
            save={() => void saveCustomer()}
            saving={saving}
            text="Save & Add Vehicle"
          />
        </ScrollView>
      ) : vehicleCustomerId ? (
        <ScrollView
          style={styles.form}
          contentContainerStyle={styles.formContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.formTitle}>Add Customer Vehicle</Text>
          <Text style={styles.formHint}>Vehicle details can be updated later.</Text>
          <Field
            label="Registration Number *"
            value={registration}
            set={setRegistration}
            placeholder="TN01AB1234"
          />
          <SelectField
            label="Make *"
            value={customMake ? "__custom__" : make}
            onChange={(value) => {
              setCustomMake(value === "__custom__");
              setMake(value === "__custom__" ? "" : value);
              setModel("");
            }}
            options={[
              { value: "", label: "Select Make" },
              ...makes.map((value) => ({ value, label: value })),
              { value: "__custom__", label: "+ Add Another Make" },
            ]}
          />
          {customMake ? (
            <Field label="New Make *" value={make} set={setMake} placeholder="Enter make" />
          ) : null}
          <SelectField
            label="Model *"
            value={customModel ? "__custom__" : model}
            onChange={(value) => {
              setCustomModel(value === "__custom__");
              setModel(value === "__custom__" ? "" : value);
            }}
            enabled={Boolean(make)}
            options={[
              { value: "", label: "Select Model" },
              ...models.map((value) => ({ value, label: value })),
              { value: "__custom__", label: "+ Add Another Model" },
            ]}
          />
          {customModel ? (
            <Field label="New Model *" value={model} set={setModel} placeholder="Enter model" />
          ) : null}
          <View style={styles.row}>
            <View style={styles.half}>
              {variants.length ? (
                <SelectField
                  label="Variant"
                  value={variant}
                  onChange={setVariant}
                  options={[
                    { value: "", label: "Select Variant" },
                    ...variants.map((value) => ({ value, label: value })),
                  ]}
                />
              ) : (
                <Field label="Variant" value={variant} set={setVariant} placeholder="Optional" />
              )}
            </View>
            <View style={styles.half}>
              <Field label="Colour" value={colour} set={setColour} placeholder="White" />
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.half}>
              <Field
                label="Year"
                value={year}
                set={setYear}
                placeholder="2024"
                keyboard="number-pad"
              />
            </View>
            <View style={styles.half}>
              <Field
                label="Odometer"
                value={odometer}
                set={setOdometer}
                placeholder="Km"
                keyboard="number-pad"
              />
            </View>
          </View>
          <SelectField
            label="Fuel Type *"
            value={fuel}
            onChange={(value) => setFuel(value as VehicleFuelType)}
            options={fuels.map(([value, label]) => ({ value, label }))}
          />
          <SelectField
            label="Transmission"
            value={transmission}
            onChange={(value) => setTransmission(value as VehicleTransmission)}
            options={transmissions.map(([value, label]) => ({ value, label }))}
          />
          <Field label="VIN / Chassis Number" value={vin} set={setVin} placeholder="Optional" />
          <DateField label="Insurance Expiry Date" value={insurance} onChange={setInsurance} />
          <Field
            label="Vehicle Notes"
            value={vehicleNotes}
            set={setVehicleNotes}
            placeholder="Optional"
            multiline
          />
          <Buttons
            cancel={closeVehicle}
            save={() => void saveVehicle()}
            saving={saving}
            text="Save Vehicle"
          />
        </ScrollView>
      ) : (
        <>
          <TouchableOpacity style={styles.add} onPress={() => setCustomerForm(true)}>
            <Ionicons name="person-add" size={23} color="#FFF" />
            <Text style={styles.addText}>Create Customer & Vehicle</Text>
          </TouchableOpacity>
          {loading ? (
            <ActivityIndicator style={{ marginTop: 40 }} size="large" color={colours.red} />
          ) : (
            <FlatList
              data={customers}
              keyExtractor={(x) => x.id}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => {
                const owned = vehicles.filter((x) => x.customerId === item.id);
                return (
                  <View style={styles.customer}>
                    <View style={styles.customerTop}>
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{item.name[0]?.toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.name}>{item.name}</Text>
                        <Text style={styles.phone}>
                          {item.phone} · {owned.length} vehicle{owned.length === 1 ? "" : "s"}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.vehicleAdd}
                        onPress={() => setVehicleCustomerId(item.id)}
                      >
                        <Ionicons name="add" size={22} color="#FFF" />
                      </TouchableOpacity>
                    </View>
                    {owned.map((vehicle) => (
                      <View key={vehicle.id} style={styles.vehicle}>
                        <Ionicons name="car-sport" size={20} color={colours.blue} />
                        <Text style={styles.vehicleText}>
                          {vehicle.registrationNumber} · {vehicle.make} {vehicle.model}
                          {vehicle.colour ? ` · ${vehicle.colour}` : ""}
                        </Text>
                      </View>
                    ))}
                  </View>
                );
              }}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text style={styles.emptyTitle}>No customers yet</Text>
                </View>
              }
            />
          )}
        </>
      )}
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
        <Text style={styles.eyebrow}>CUSTOMERS</Text>
        <Text style={styles.title}>Customers & Vehicles</Text>
      </View>
    </View>
  );
}
function Field({
  label,
  value,
  set,
  placeholder,
  keyboard,
  multiline,
}: {
  label: string;
  value: string;
  set: (v: string) => void;
  placeholder: string;
  keyboard?: "phone-pad" | "email-address" | "number-pad";
  multiline?: boolean;
}) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.textarea]}
        value={value}
        onChangeText={set}
        placeholder={placeholder}
        keyboardType={keyboard}
        autoCapitalize={keyboard === "email-address" ? "none" : undefined}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
      />
    </>
  );
}
function Buttons({
  cancel,
  save,
  saving,
  text,
}: {
  cancel: () => void;
  save: () => void;
  saving: boolean;
  text: string;
}) {
  return (
    <View style={styles.buttons}>
      <TouchableOpacity style={styles.cancel} onPress={cancel}>
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.save} onPress={save} disabled={saving}>
        {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>{text}</Text>}
      </TouchableOpacity>
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colours.canvas },
  header: { padding: 20, flexDirection: "row", alignItems: "center", gap: 12 },
  back: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: colours.card,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colours.line,
  },
  eyebrow: { color: colours.red, fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  title: { fontSize: 25, fontWeight: "900", color: colours.ink },
  add: {
    height: 62,
    marginHorizontal: 20,
    borderRadius: 17,
    backgroundColor: colours.red,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  addText: { color: "#FFF", fontSize: 17, fontWeight: "900" },
  error: {
    marginHorizontal: 20,
    marginBottom: 10,
    padding: 13,
    borderRadius: 12,
    backgroundColor: "#FDEBEC",
    color: "#A82024",
    fontWeight: "700",
  },
  form: {
    marginHorizontal: 16,
    backgroundColor: colours.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colours.line,
  },
  formContent: { padding: 18, paddingBottom: 35 },
  formTitle: { fontSize: 22, fontWeight: "900", color: colours.ink },
  formHint: { fontSize: 14, color: colours.muted, marginTop: 4 },
  label: { fontSize: 15, fontWeight: "800", color: colours.ink, marginTop: 14, marginBottom: 6 },
  input: {
    height: 54,
    borderWidth: 1.5,
    borderColor: colours.line,
    borderRadius: 14,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colours.ink,
  },
  textarea: { height: 92, paddingTop: 14 },
  row: { flexDirection: "row", gap: 10 },
  half: { flex: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colours.line,
  },
  chipActive: { backgroundColor: colours.navy, borderColor: colours.navy },
  chipText: { fontSize: 14, fontWeight: "800", color: colours.ink },
  chipTextActive: { color: "#FFF" },
  buttons: { flexDirection: "row", gap: 9, marginTop: 20 },
  cancel: {
    height: 56,
    width: 90,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colours.line,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: { fontWeight: "900", color: colours.ink },
  save: {
    height: 56,
    flex: 1,
    borderRadius: 14,
    backgroundColor: colours.red,
    alignItems: "center",
    justifyContent: "center",
  },
  saveText: { fontWeight: "900", fontSize: 15, color: "#FFF" },
  list: { padding: 20, gap: 11, paddingBottom: 30 },
  customer: {
    borderRadius: 18,
    backgroundColor: colours.card,
    borderWidth: 1,
    borderColor: colours.line,
    padding: 13,
  },
  customerTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: colours.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#FFF", fontWeight: "900", fontSize: 19 },
  name: { color: colours.ink, fontWeight: "900", fontSize: 17 },
  phone: { color: colours.muted, fontSize: 14, marginTop: 3 },
  vehicleAdd: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: colours.red,
    alignItems: "center",
    justifyContent: "center",
  },
  vehicle: {
    minHeight: 43,
    marginTop: 10,
    borderRadius: 12,
    backgroundColor: "#EEF4FA",
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  vehicleText: { flex: 1, color: colours.navy, fontSize: 13, fontWeight: "800" },
  empty: { padding: 35, alignItems: "center" },
  emptyTitle: { fontSize: 20, fontWeight: "900", color: colours.ink },
});
