import type { Invoice, Payment } from "@dvcs/types";
import { Ionicons } from "@expo/vector-icons";
import { collection, getDocs, query, where } from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { MobileNav } from "../components/mobile-nav";
import { firebase } from "../lib/firebase";
import { useMobileAuth } from "../lib/mobile-auth";
import { canViewFinance } from "../lib/mobile-roles";
import { colours } from "../lib/theme";

type AmountRecord = { amount?: number; totalAmount?: number; status?: string };
const money=(value:number)=>`₹${value.toLocaleString('en-IN',{maximumFractionDigits:2,minimumFractionDigits:2})}`;
export default function ReportsScreen(){
  const {membership,company,branch}=useMobileAuth();
  const [invoices,setInvoices]=useState<Invoice[]>([]),[payments,setPayments]=useState<Payment[]>([]),[purchases,setPurchases]=useState<AmountRecord[]>([]),[expenses,setExpenses]=useState<AmountRecord[]>([]);
  const [loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false),[error,setError]=useState<string|null>(null);
  const allowed=canViewFinance(membership,branch?.id);
  const load=useCallback(async()=>{if(!company||!branch||!allowed)return setLoading(false);setError(null);try{const q=(name:string)=>getDocs(query(collection(firebase.db,name),where('companyId','==',company.id),where('branchId','==',branch.id)));const [i,p,pu,e]=await Promise.all([q('invoices'),q('payments'),q('purchaseBills'),q('expenses')]);setInvoices(i.docs.map(x=>({...x.data(),id:x.id}) as Invoice));setPayments(p.docs.map(x=>({...x.data(),id:x.id}) as Payment));setPurchases(pu.docs.map(x=>x.data() as AmountRecord));setExpenses(e.docs.map(x=>x.data() as AmountRecord));}catch(reason){setError(reason instanceof Error?reason.message:'Unable to load financial totals.');}finally{setLoading(false);}},[allowed,branch,company]);
  useEffect(()=>{void load()},[load]);
  async function refresh(){setRefreshing(true);await load();setRefreshing(false)}
  if(!allowed)return <SafeAreaView style={styles.screen}><View style={styles.header}><Text style={styles.title}>Money</Text></View><View style={styles.restricted}><Text style={styles.restrictedTitle}>Finance access is not assigned to this account.</Text></View><MobileNav/></SafeAreaView>;
  const sales=invoices.filter(x=>x.status!=='void').reduce((s,x)=>s+(x.totalAmount||0),0),received=payments.filter(x=>x.status==='completed').reduce((s,x)=>s+(x.amount||0),0),due=invoices.filter(x=>x.status!=='void').reduce((s,x)=>s+(x.balanceAmount||0),0),purchase=purchases.reduce((s,x)=>s+(x.totalAmount||0),0),expense=expenses.reduce((s,x)=>s+(x.amount||0),0);
  return <SafeAreaView style={styles.screen}><ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>void refresh()}/>}>
    <Text style={styles.eyebrow}>BUSINESS NUMBERS</Text><Text style={styles.title}>Money Overview</Text><Text style={styles.sub}>{branch?.name} · Live totals</Text>
    {error?<Text style={styles.error}>{error}</Text>:null}{loading?<ActivityIndicator size="large" color={colours.red} style={{marginTop:60}}/>:<>
      <View style={styles.hero}><Text style={styles.heroLabel}>NET CASH POSITION</Text><Text style={styles.heroValue}>{money(received-purchase-expense)}</Text><Text style={styles.heroHint}>Received − Purchases − Expenses</Text></View>
      <Text style={styles.section}>Sales & Payments</Text><View style={styles.grid}><Metric icon="receipt" colour={colours.blue} label="Invoiced" value={money(sales)}/><Metric icon="wallet" colour={colours.green} label="Received" value={money(received)}/><Metric icon="time" colour={colours.amber} label="Payment Due" value={money(due)}/><Metric icon="document-text" colour={colours.purple} label="Invoices" value={String(invoices.filter(x=>x.status!=='void').length)}/></View>
      <Text style={styles.section}>Money Out</Text><View style={styles.grid}><Metric icon="cart" colour={colours.navy} label="Purchases" value={money(purchase)}/><Metric icon="trending-down" colour={colours.red} label="Expenses" value={money(expense)}/></View>
      <View style={styles.note}><Ionicons name="information-circle" size={25} color={colours.blue}/><Text style={styles.noteText}>Detailed filters and GST reports remain available on the web dashboard.</Text></View>
    </>}
  </ScrollView><MobileNav/></SafeAreaView>
}
function Metric({icon,colour,label,value}:{icon:keyof typeof Ionicons.glyphMap;colour:string;label:string;value:string}){return <View style={[styles.metric,{borderTopColor:colour}]}><Ionicons name={icon} size={24} color={colour}/><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text></View>}
const styles=StyleSheet.create({screen:{flex:1,backgroundColor:colours.canvas},content:{padding:20,paddingBottom:105},header:{padding:20},eyebrow:{color:colours.red,fontSize:12,fontWeight:'900',letterSpacing:1.1},title:{color:colours.ink,fontSize:31,fontWeight:'900',marginTop:4},sub:{color:colours.muted,fontSize:15,fontWeight:'700',marginTop:4},error:{marginTop:15,padding:13,borderRadius:12,backgroundColor:'#FDEBEC',color:'#A82024',fontWeight:'700'},hero:{backgroundColor:colours.ink,borderRadius:22,padding:21,marginTop:22},heroLabel:{color:'#FF9799',fontSize:12,fontWeight:'900',letterSpacing:1},heroValue:{color:'#FFF',fontSize:32,fontWeight:'900',marginTop:8},heroHint:{color:'#AEB8C2',fontSize:14,marginTop:4},section:{fontSize:20,fontWeight:'900',color:colours.ink,marginTop:24,marginBottom:11},grid:{flexDirection:'row',flexWrap:'wrap',gap:10},metric:{width:'48%',minHeight:125,padding:15,borderRadius:18,backgroundColor:colours.card,borderWidth:1,borderColor:colours.line,borderTopWidth:5},metricLabel:{color:colours.muted,fontSize:14,fontWeight:'800',marginTop:8},metricValue:{color:colours.ink,fontSize:22,fontWeight:'900',marginTop:4},note:{padding:15,borderRadius:16,backgroundColor:'#EAF3FC',flexDirection:'row',gap:10,marginTop:22},noteText:{flex:1,color:colours.navy,fontSize:14,lineHeight:20,fontWeight:'700'},restricted:{margin:20,padding:25,borderRadius:20,backgroundColor:colours.card},restrictedTitle:{fontSize:18,fontWeight:'900',color:colours.ink}});
