import type { Customer } from "@dvcs/types";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { collection, doc, getDocs, query, serverTimestamp, where, writeBatch } from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { firebase } from "../lib/firebase";
import { useMobileAuth } from "../lib/mobile-auth";
import { canManageCustomers } from "../lib/mobile-roles";
import { colours } from "../lib/theme";

export default function CustomersScreen() {
  const { user, membership, company, branch } = useMobileAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allowed = canManageCustomers(membership, branch?.id);

  const load = useCallback(async () => {
    if (!company || !branch || !allowed) return setLoading(false);
    setLoading(true);
    try {
      const snapshot = await getDocs(query(collection(firebase.db, "customers"), where("companyId", "==", company.id), where("branchId", "==", branch.id)));
      setCustomers(snapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as Customer).filter((item) => item.status === "active").sort((a, b) => a.name.localeCompare(b.name)));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load customers.");
    } finally { setLoading(false); }
  }, [allowed, branch, company]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    const cleanPhone = phone.replace(/\D/g, "");
    if (!user || !company || !branch || name.trim().length < 2 || cleanPhone.length < 10) {
      setError("Enter the customer name and a valid mobile number.");
      return;
    }
    setSaving(true); setError(null);
    try {
      const reference = doc(collection(firebase.db, "customers"));
      const now = serverTimestamp();
      await writeBatch(firebase.db).set(reference, {
        companyId: company.id, branchId: branch.id, type: "individual", name: name.trim(),
        phone: cleanPhone, alternatePhone: "", email: email.trim().toLowerCase(), gstin: "",
        address: "", notes: "", searchName: name.trim().toLowerCase(), searchPhone: cleanPhone,
        vehicleCount: 0, status: "active", createdAt: now, createdBy: user.uid, updatedAt: now, updatedBy: user.uid,
      }).commit();
      setName(""); setPhone(""); setEmail(""); setShowForm(false); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to create customer."); }
    finally { setSaving(false); }
  }

  if (!allowed) return <SafeAreaView style={styles.screen}><Header /><View style={styles.empty}><Text style={styles.emptyTitle}>Customer access is restricted</Text></View></SafeAreaView>;
  return (
    <SafeAreaView style={styles.screen}>
      <Header />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {showForm ? (
        <View style={styles.form}>
          <Text style={styles.formTitle}>New Customer</Text>
          <Text style={styles.label}>Customer Name *</Text><TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Full name" />
          <Text style={styles.label}>Mobile Number *</Text><TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="10-digit mobile number" />
          <Text style={styles.label}>Email (Optional)</Text><TextInput style={styles.input} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="customer@example.com" />
          <View style={styles.buttons}><TouchableOpacity style={styles.cancel} onPress={() => setShowForm(false)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity><TouchableOpacity style={styles.save} onPress={() => void save()} disabled={saving}>{saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Save Customer</Text>}</TouchableOpacity></View>
        </View>
      ) : (
        <TouchableOpacity style={styles.add} onPress={() => setShowForm(true)}><Ionicons name="person-add" size={23} color="#FFF" /><Text style={styles.addText}>Create New Customer</Text></TouchableOpacity>
      )}
      {loading ? <ActivityIndicator style={{ marginTop: 40 }} size="large" color={colours.red} /> : <FlatList data={customers} keyExtractor={(item) => item.id} contentContainerStyle={styles.list} renderItem={({ item }) => <View style={styles.customer}><View style={styles.avatar}><Text style={styles.avatarText}>{item.name[0]?.toUpperCase()}</Text></View><View><Text style={styles.name}>{item.name}</Text><Text style={styles.phone}>{item.phone}</Text></View></View>} ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyTitle}>No customers yet</Text><Text style={styles.emptyText}>Create the first customer above.</Text></View>} />}
    </SafeAreaView>
  );
}

function Header() { return <View style={styles.header}><TouchableOpacity style={styles.back} onPress={() => router.back()}><Ionicons name="arrow-back" size={25} color={colours.ink} /></TouchableOpacity><View><Text style={styles.eyebrow}>CUSTOMERS</Text><Text style={styles.title}>Customer List</Text></View></View>; }
const styles = StyleSheet.create({
  screen:{flex:1,backgroundColor:colours.canvas},header:{padding:20,flexDirection:"row",alignItems:"center",gap:14},back:{width:48,height:48,borderRadius:15,backgroundColor:colours.card,alignItems:"center",justifyContent:"center",borderWidth:1,borderColor:colours.line},eyebrow:{color:colours.red,fontSize:12,fontWeight:"900",letterSpacing:1},title:{fontSize:28,fontWeight:"900",color:colours.ink},add:{height:62,marginHorizontal:20,borderRadius:17,backgroundColor:colours.red,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:10},addText:{color:"#FFF",fontSize:17,fontWeight:"900"},error:{marginHorizontal:20,marginBottom:12,padding:13,borderRadius:12,backgroundColor:"#FDEBEC",color:"#A82024",fontWeight:"700"},form:{marginHorizontal:20,padding:18,borderRadius:20,backgroundColor:colours.card,borderWidth:1,borderColor:colours.line},formTitle:{fontSize:22,fontWeight:"900",color:colours.ink},label:{fontSize:15,fontWeight:"800",color:colours.ink,marginTop:14,marginBottom:6},input:{height:55,borderWidth:1.5,borderColor:colours.line,borderRadius:14,paddingHorizontal:14,fontSize:17,color:colours.ink},buttons:{flexDirection:"row",gap:10,marginTop:18},cancel:{height:55,width:100,borderRadius:14,borderWidth:1,borderColor:colours.line,alignItems:"center",justifyContent:"center"},cancelText:{fontWeight:"900",color:colours.ink},save:{height:55,flex:1,borderRadius:14,backgroundColor:colours.red,alignItems:"center",justifyContent:"center"},saveText:{fontWeight:"900",fontSize:16,color:"#FFF"},list:{padding:20,gap:10,paddingBottom:30},customer:{minHeight:76,borderRadius:17,backgroundColor:colours.card,borderWidth:1,borderColor:colours.line,padding:12,flexDirection:"row",alignItems:"center",gap:13},avatar:{width:48,height:48,borderRadius:15,backgroundColor:colours.navy,alignItems:"center",justifyContent:"center"},avatarText:{color:"#FFF",fontWeight:"900",fontSize:19},name:{color:colours.ink,fontWeight:"900",fontSize:17},phone:{color:colours.muted,fontSize:15,marginTop:3},empty:{padding:35,alignItems:"center"},emptyTitle:{fontSize:20,fontWeight:"900",color:colours.ink},emptyText:{fontSize:15,color:colours.muted,marginTop:5}
});
