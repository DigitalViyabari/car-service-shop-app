"use client";

import type { VehicleCatalogEntry, VehicleFuelType, VehicleTransmission } from "@dvcs/types";
import { addDoc, collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth-context";
import { firebaseClient } from "@/lib/firebase-client";
import { indianVehicleCatalogue } from "@/lib/indian-vehicle-catalogue";

type Draft = { make: string; model: string; variant: string; bodyType: string; fuelTypes: VehicleFuelType[]; transmissions: VehicleTransmission[]; yearFrom: string; yearTo: string; notes: string };
const emptyDraft: Draft = { make:"", model:"", variant:"", bodyType:"", fuelTypes:["petrol"], transmissions:["manual"], yearFrom:"", yearTo:"", notes:"" };
const fuels: Array<[VehicleFuelType,string]> = [["petrol","Petrol"],["diesel","Diesel"],["cng","CNG"],["petrol_cng","Petrol + CNG"],["electric","Electric"],["hybrid","Hybrid"],["other","Other"]];
const transmissions: Array<[VehicleTransmission,string]> = [["manual","Manual"],["automatic","Automatic"],["amt","AMT"],["cvt","CVT"],["dct","DCT"],["other","Other"]];

export default function VehicleCataloguePage() {
  const { user, activeCompanyId } = useAuth();
  const [customEntries, setCustomEntries] = useState<VehicleCatalogEntry[]>([]);
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<"all"|"default"|"company">("all");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string|null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string|null>(null);

  const load = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    try {
      const snapshots = await getDocs(query(collection(firebaseClient.db,"vehicleCatalog"),where("companyId","==",activeCompanyId)));
      setCustomEntries(snapshots.docs.map((item)=>({...(item.data() as Omit<VehicleCatalogEntry,"id">),id:item.id})).filter(({status})=>status==="active"));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load the vehicle catalogue."); }
    finally { setLoading(false); }
  },[activeCompanyId]);
  useEffect(()=>{void load();},[load]);

  const rows = useMemo(()=>{
    const defaults = indianVehicleCatalogue.map((entry,index)=>({...entry,id:`default-${index}`,variant:"",yearFrom:undefined,yearTo:undefined,source:"default" as const}));
    const custom = customEntries.map((entry)=>({...entry,source:"company" as const}));
    const all = source==="default"?defaults:source==="company"?custom:[...custom,...defaults];
    const term=search.trim().toLowerCase();
    return all.filter((item)=>!term||`${item.make} ${item.model} ${item.variant||""} ${item.bodyType||""}`.toLowerCase().includes(term));
  },[customEntries,search,source]);

  function openNew(){setEditingId(null);setDraft(emptyDraft);setError(null);setShowForm(true);}
  function openEdit(entry:VehicleCatalogEntry){setEditingId(entry.id);setDraft({make:entry.make,model:entry.model,variant:entry.variant??"",bodyType:entry.bodyType??"",fuelTypes:entry.fuelTypes,transmissions:entry.transmissions,yearFrom:entry.yearFrom?String(entry.yearFrom):"",yearTo:entry.yearTo?String(entry.yearTo):"",notes:entry.notes??""});setError(null);setShowForm(true);}
  function toggleFuel(value:VehicleFuelType){setDraft({...draft,fuelTypes:draft.fuelTypes.includes(value)?draft.fuelTypes.filter((item)=>item!==value):[...draft.fuelTypes,value]});}
  function toggleTransmission(value:VehicleTransmission){setDraft({...draft,transmissions:draft.transmissions.includes(value)?draft.transmissions.filter((item)=>item!==value):[...draft.transmissions,value]});}

  async function save(event:FormEvent){event.preventDefault();if(!user||!activeCompanyId)return;const make=draft.make.trim(),model=draft.model.trim();if(!make||!model||draft.fuelTypes.length===0||draft.transmissions.length===0){setError("Enter Make and Model, then select at least one Fuel Type and Transmission.");return;}setSubmitting(true);setError(null);try{const values={make,model,variant:draft.variant.trim(),bodyType:draft.bodyType.trim(),fuelTypes:draft.fuelTypes,transmissions:draft.transmissions,yearFrom:draft.yearFrom?Number(draft.yearFrom):null,yearTo:draft.yearTo?Number(draft.yearTo):null,notes:draft.notes.trim(),searchText:`${make} ${model} ${draft.variant}`.toLowerCase(),updatedAt:serverTimestamp(),updatedBy:user.uid};if(editingId){await updateDoc(doc(firebaseClient.db,"vehicleCatalog",editingId),values);}else{await addDoc(collection(firebaseClient.db,"vehicleCatalog"),{companyId:activeCompanyId,...values,status:"active",createdAt:serverTimestamp(),createdBy:user.uid});}setShowForm(false);setDraft(emptyDraft);setEditingId(null);await load();}catch(reason){setError(reason instanceof Error?reason.message:"Unable to save the catalogue entry.");}finally{setSubmitting(false);}}

  async function archive(entry:VehicleCatalogEntry){if(!user||!confirm(`Archive ${entry.make} ${entry.model}${entry.variant?` ${entry.variant}`:""}?`))return;try{await updateDoc(doc(firebaseClient.db,"vehicleCatalog",entry.id),{status:"archived",updatedAt:serverTimestamp(),updatedBy:user.uid});await load();}catch(reason){setError(reason instanceof Error?reason.message:"Unable to archive this entry.");}}

  return <main className="content catalogue-page">
    <div className="dashboard-heading"><div><span className="heading-kicker">Vehicle Master</span><h1>Vehicle Catalogue</h1><p className="muted">Use Indian defaults or maintain your company&apos;s own models and variants.</p></div><button className="quick-action quick-action--enabled" onClick={openNew}><strong>+</strong> Add Vehicle Model</button></div>
    {error&&!showForm?<div className="alert alert--error module-alert">{error}<button onClick={()=>setError(null)}>×</button></div>:null}
    <section className="catalogue-summary"><div><strong>{indianVehicleCatalogue.length}</strong><span>Indian Defaults</span></div><div><strong>{customEntries.length}</strong><span>Company Entries</span></div><div><strong>{new Set(rows.map(({make})=>make)).size}</strong><span>Manufacturers</span></div></section>
    <section className="catalogue-panel"><div className="catalogue-toolbar"><div className="search-box"><span>⌕</span><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search Make, Model, Variant or Body Type"/></div><div className="catalogue-tabs">{(["all","default","company"] as const).map((value)=><button key={value} className={source===value?"is-active":""} onClick={()=>setSource(value)}>{value==="all"?"All Vehicles":value==="default"?"Indian Defaults":"My Company"}</button>)}</div></div>
      <div className="catalogue-table"><div className="catalogue-table-head"><span>Vehicle</span><span>Body Type</span><span>Fuel</span><span>Transmission</span><span>Source</span><span/></div>{loading?<div className="catalogue-state"><span className="spinner"/>Loading Catalogue…</div>:rows.length===0?<div className="catalogue-state">No Matching Vehicles</div>:rows.map((entry)=><article className="catalogue-row" key={`${entry.source}-${entry.id}`}><div><strong>{entry.make} {entry.model}</strong><small>{entry.variant||"All Variants"}</small></div><span>{entry.bodyType||"Not Set"}</span><span>{entry.fuelTypes.map((item)=>fuels.find(([value])=>value===item)?.[1]??item).join(", ")}</span><span>{entry.transmissions.map((item)=>transmissions.find(([value])=>value===item)?.[1]??item).join(", ")}</span><span className={`source-chip source-chip--${entry.source}`}>{entry.source==="default"?"Indian Default":"My Company"}</span><div className="catalogue-actions">{entry.source==="company"?<><button onClick={()=>openEdit(entry as VehicleCatalogEntry)}>Edit</button><button onClick={()=>void archive(entry as VehicleCatalogEntry)}>Archive</button></>:<span>Read Only</span>}</div></article>)}</div>
    </section>
    {showForm?<div className="modal-backdrop" onMouseDown={(e)=>{if(e.target===e.currentTarget&&!submitting)setShowForm(false)}}><form className="module-modal" onSubmit={save}><header className="modal-header"><div><span className="heading-kicker">Company Vehicle Master</span><h2>{editingId?"Edit Vehicle Model":"Add Vehicle Model"}</h2></div><button type="button" onClick={()=>setShowForm(false)}>×</button></header>{error?<div className="alert alert--error modal-alert">{error}</div>:null}<div className="form-grid"><label>Make *<input value={draft.make} onChange={(e)=>setDraft({...draft,make:e.target.value})} placeholder="Maruti Suzuki" autoFocus required/></label><label>Model *<input value={draft.model} onChange={(e)=>setDraft({...draft,model:e.target.value})} placeholder="Swift" required/></label><label>Variant<input value={draft.variant} onChange={(e)=>setDraft({...draft,variant:e.target.value})} placeholder="ZXI Plus"/></label><label>Body Type<input value={draft.bodyType} onChange={(e)=>setDraft({...draft,bodyType:e.target.value})} placeholder="Hatchback"/></label><label>Year From<input type="number" min="1950" max="2100" value={draft.yearFrom} onChange={(e)=>setDraft({...draft,yearFrom:e.target.value})}/></label><label>Year To<input type="number" min="1950" max="2100" value={draft.yearTo} onChange={(e)=>setDraft({...draft,yearTo:e.target.value})}/></label><fieldset className="span-2 choice-field"><legend>Fuel Types *</legend><div>{fuels.map(([value,label])=><label key={value}><input type="checkbox" checked={draft.fuelTypes.includes(value)} onChange={()=>toggleFuel(value)}/><span>{label}</span></label>)}</div></fieldset><fieldset className="span-2 choice-field"><legend>Transmissions *</legend><div>{transmissions.map(([value,label])=><label key={value}><input type="checkbox" checked={draft.transmissions.includes(value)} onChange={()=>toggleTransmission(value)}/><span>{label}</span></label>)}</div></fieldset><label className="span-2">Notes<textarea rows={3} value={draft.notes} onChange={(e)=>setDraft({...draft,notes:e.target.value})}/></label></div><footer className="modal-footer"><button type="button" className="cancel-button" onClick={()=>setShowForm(false)}>Cancel</button><button className="dv-button" disabled={submitting}>{submitting?"Saving…":editingId?"Save Changes":"Add To Catalogue"}</button></footer></form></div>:null}
  </main>;
}
