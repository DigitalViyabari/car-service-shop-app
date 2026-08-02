"use client";

import type { Customer, CustomerType, Vehicle, VehicleCatalogEntry, VehicleFuelType, VehicleTransmission } from "@dvcs/types";
import {
  collection,
  doc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth-context";
import { firebaseClient } from "@/lib/firebase-client";
import { indianVehicleCatalogue } from "@/lib/indian-vehicle-catalogue";

type CustomerDraft = {
  type: CustomerType;
  name: string;
  phone: string;
  alternatePhone: string;
  email: string;
  gstin: string;
  address: string;
  notes: string;
};

type VehicleDraft = {
  registrationNumber: string;
  make: string;
  model: string;
  variant: string;
  colour: string;
  year: string;
  fuelType: VehicleFuelType;
  transmission: VehicleTransmission;
  vin: string;
  odometer: string;
  notes: string;
};

const emptyCustomer: CustomerDraft = {
  type: "individual", name: "", phone: "", alternatePhone: "", email: "", gstin: "", address: "", notes: "",
};
const emptyVehicle: VehicleDraft = {
  registrationNumber: "", make: "", model: "", variant: "", colour: "", year: "", fuelType: "petrol", transmission: "manual", vin: "", odometer: "", notes: "",
};

const fuelOptions: Array<{ value: VehicleFuelType; label: string }> = [
  { value: "petrol", label: "Petrol" },
  { value: "diesel", label: "Diesel" },
  { value: "cng", label: "CNG" },
  { value: "petrol_cng", label: "Petrol + CNG" },
  { value: "electric", label: "Electric" },
  { value: "hybrid", label: "Hybrid" },
  { value: "other", label: "Other" },
];

const transmissionOptions: Array<{ value: VehicleTransmission; label: string }> = [
  { value: "manual", label: "Manual" },
  { value: "automatic", label: "Automatic" },
  { value: "amt", label: "AMT" },
  { value: "cvt", label: "CVT" },
  { value: "dct", label: "DCT" },
  { value: "other", label: "Other" },
];

function fuelLabel(value: VehicleFuelType) {
  return fuelOptions.find((option) => option.value === value)?.label ?? value;
}

function asCustomer(snapshot: { id: string; data: () => unknown }): Customer {
  return { ...(snapshot.data() as Omit<Customer, "id">), id: snapshot.id };
}
function asVehicle(snapshot: { id: string; data: () => unknown }): Vehicle {
  return { ...(snapshot.data() as Omit<Vehicle, "id">), id: snapshot.id };
}
function normalizePhone(value: string) { return value.replace(/\D/g, ""); }
function normalizeRegistration(value: string) { return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase(); }
function initials(name: string) { return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }

export default function CustomersPage() {
  const { user, activeCompanyId, activeBranchId } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [catalogEntries, setCatalogEntries] = useState<VehicleCatalogEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [customerDraft, setCustomerDraft] = useState<CustomerDraft>(emptyCustomer);
  const [vehicleDraft, setVehicleDraft] = useState<VehicleDraft>(emptyVehicle);
  const [submitting, setSubmitting] = useState(false);

  const loadRecords = useCallback(async () => {
    if (!activeCompanyId || !activeBranchId) return;
    setLoading(true);
    setError(null);
    try {
      const [customerSnapshots, vehicleSnapshots, catalogSnapshots] = await Promise.all([
        getDocs(query(collection(firebaseClient.db, "customers"), where("companyId", "==", activeCompanyId), where("branchId", "==", activeBranchId))),
        getDocs(query(collection(firebaseClient.db, "vehicles"), where("companyId", "==", activeCompanyId), where("branchId", "==", activeBranchId))),
        getDocs(query(collection(firebaseClient.db, "vehicleCatalog"), where("companyId", "==", activeCompanyId))),
      ]);
      const nextCustomers = customerSnapshots.docs.map(asCustomer).filter(({ status }) => status === "active").sort((a, b) => a.name.localeCompare(b.name));
      const nextVehicles = vehicleSnapshots.docs.map(asVehicle).filter(({ status }) => status === "active");
      setCustomers(nextCustomers);
      setVehicles(nextVehicles);
      setCatalogEntries(catalogSnapshots.docs.map((item) => ({ ...(item.data() as Omit<VehicleCatalogEntry, "id">), id: item.id })).filter(({ status }) => status === "active"));
      setSelectedId((current) => current && nextCustomers.some(({ id }) => id === current) ? current : (nextCustomers[0]?.id ?? null));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load customers.");
    } finally {
      setLoading(false);
    }
  }, [activeBranchId, activeCompanyId]);

  useEffect(() => { void loadRecords(); }, [loadRecords]);

  const filteredCustomers = useMemo(() => {
    const term = search.trim().toLowerCase();
    const phone = normalizePhone(term);
    const registration = normalizeRegistration(term);
    if (!term) return customers;
    const matchedCustomerIds = new Set(vehicles.filter((vehicle) => vehicle.searchRegistration.includes(registration)).map(({ customerId }) => customerId));
    return customers.filter((customer) => customer.searchName.includes(term) || customer.searchPhone.includes(phone) || matchedCustomerIds.has(customer.id));
  }, [customers, search, vehicles]);

  const selectedCustomer = customers.find(({ id }) => id === selectedId) ?? null;
  const selectedVehicles = vehicles.filter(({ customerId }) => customerId === selectedId);
  const catalogueMakes = [...new Set([...indianVehicleCatalogue.map(({ make }) => make), ...catalogEntries.map(({ make }) => make)])].sort();
  const catalogueModels = [...new Set([
    ...indianVehicleCatalogue.filter(({ make }) => make.toLowerCase() === vehicleDraft.make.trim().toLowerCase()).map(({ model }) => model),
    ...catalogEntries.filter(({ make }) => make.toLowerCase() === vehicleDraft.make.trim().toLowerCase()).map(({ model }) => model),
  ])].sort();
  const catalogueVariants = [...new Set(catalogEntries.filter(({ make, model }) => make.toLowerCase() === vehicleDraft.make.trim().toLowerCase() && model.toLowerCase() === vehicleDraft.model.trim().toLowerCase()).map(({ variant }) => variant).filter(Boolean))];

  async function createCustomer(event: FormEvent) {
    event.preventDefault();
    if (!user || !activeCompanyId || !activeBranchId) return;
    const name = customerDraft.name.trim();
    const phone = normalizePhone(customerDraft.phone);
    if (name.length < 2 || phone.length < 10) { setError("Enter a customer name and a valid phone number."); return; }
    setSubmitting(true); setError(null);
    try {
      const reference = doc(collection(firebaseClient.db, "customers"));
      const now = serverTimestamp();
      await writeBatch(firebaseClient.db).set(reference, {
        companyId: activeCompanyId, branchId: activeBranchId, type: customerDraft.type, name, phone,
        alternatePhone: normalizePhone(customerDraft.alternatePhone), email: customerDraft.email.trim().toLowerCase(),
        gstin: customerDraft.gstin.trim().toUpperCase(), address: customerDraft.address.trim(), notes: customerDraft.notes.trim(),
        searchName: name.toLowerCase(), searchPhone: phone, vehicleCount: 0, status: "active",
        createdAt: now, createdBy: user.uid, updatedAt: now, updatedBy: user.uid,
      }).commit();
      setCustomerDraft(emptyCustomer); setShowCustomerForm(false); await loadRecords(); setSelectedId(reference.id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save customer."); }
    finally { setSubmitting(false); }
  }

  function openNewVehicleForm() {
    setError(null);
    setEditingVehicleId(null);
    setVehicleDraft(emptyVehicle);
    setShowVehicleForm(true);
  }

  function openEditVehicleForm(vehicle: Vehicle) {
    setError(null);
    setEditingVehicleId(vehicle.id);
    setVehicleDraft({
      registrationNumber: vehicle.registrationNumber,
      make: vehicle.make,
      model: vehicle.model,
      variant: vehicle.variant ?? "",
      colour: vehicle.colour ?? "",
      year: vehicle.year ? String(vehicle.year) : "",
      fuelType: vehicle.fuelType,
      transmission: vehicle.transmission ?? "manual",
      vin: vehicle.vin ?? "",
      odometer: vehicle.odometer != null ? String(vehicle.odometer) : "",
      notes: vehicle.notes ?? "",
    });
    setShowVehicleForm(true);
  }

  function closeVehicleForm() {
    if (submitting) return;
    setShowVehicleForm(false);
    setEditingVehicleId(null);
    setVehicleDraft(emptyVehicle);
  }

  async function saveVehicle(event: FormEvent) {
    event.preventDefault();
    if (!user || !activeCompanyId || !activeBranchId || !selectedCustomer) return;
    const registrationNumber = normalizeRegistration(vehicleDraft.registrationNumber);
    const make = vehicleDraft.make.trim(); const model = vehicleDraft.model.trim();
    if (registrationNumber.length < 6 || !make || !model) { setError("Enter a valid registration number, make, and model."); return; }
    if (vehicles.some((vehicle) => vehicle.id !== editingVehicleId && vehicle.searchRegistration === registrationNumber)) { setError("This registration number already exists in the branch."); return; }
    setSubmitting(true); setError(null);
    try {
      const now = serverTimestamp();
      const vehicleValues = {
        registrationNumber, make, model, variant: vehicleDraft.variant.trim(),
        colour: vehicleDraft.colour.trim(), year: vehicleDraft.year ? Number(vehicleDraft.year) : null, fuelType: vehicleDraft.fuelType,
        transmission: vehicleDraft.transmission, vin: vehicleDraft.vin.trim().toUpperCase(),
        odometer: vehicleDraft.odometer ? Number(vehicleDraft.odometer) : null, notes: vehicleDraft.notes.trim(),
        searchRegistration: registrationNumber, updatedAt: now, updatedBy: user.uid,
      };
      if (editingVehicleId) {
        await updateDoc(doc(firebaseClient.db, "vehicles", editingVehicleId), vehicleValues);
      } else {
        const vehicleReference = doc(collection(firebaseClient.db, "vehicles"));
        const customerReference = doc(firebaseClient.db, "customers", selectedCustomer.id);
        const batch = writeBatch(firebaseClient.db);
        batch.set(vehicleReference, {
          companyId: activeCompanyId, branchId: activeBranchId, customerId: selectedCustomer.id,
          ...vehicleValues, status: "active", createdAt: now, createdBy: user.uid,
        });
        batch.update(customerReference, { vehicleCount: increment(1), updatedAt: now, updatedBy: user.uid });
        await batch.commit();
      }
      setShowVehicleForm(false);
      setEditingVehicleId(null);
      setVehicleDraft(emptyVehicle);
      await loadRecords();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save vehicle changes."); }
    finally { setSubmitting(false); }
  }

  async function archiveCustomer() {
    if (!user || !selectedCustomer || selectedVehicles.length > 0 || !confirm(`Archive ${selectedCustomer.name}?`)) return;
    setSubmitting(true);
    try {
      await updateDoc(doc(firebaseClient.db, "customers", selectedCustomer.id), { status: "archived", updatedAt: serverTimestamp(), updatedBy: user.uid });
      await loadRecords();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to archive customer."); }
    finally { setSubmitting(false); }
  }

  return (
    <main className="content customers-page">
      <div className="dashboard-heading customer-heading">
        <div><span className="heading-kicker">Customer garage</span><h1>Customers &amp; vehicles</h1><p className="muted">One service-ready profile for every owner and vehicle.</p></div>
        <button className="quick-action quick-action--enabled" onClick={() => { setError(null); setShowCustomerForm(true); }}><strong>+</strong> Add customer</button>
      </div>

      {error ? <div className="alert alert--error module-alert" role="alert">{error}<button onClick={() => setError(null)} aria-label="Dismiss">×</button></div> : null}

      <section className="customer-workspace">
        <div className="customer-directory">
          <div className="directory-toolbar">
            <div className="search-box"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, phone or registration" aria-label="Search customers" /></div>
            <span className="record-count">{filteredCustomers.length} {filteredCustomers.length === 1 ? "customer" : "customers"}</span>
          </div>
          <div className="customer-list">
            {loading ? <div className="list-state"><span className="spinner" />Loading garage…</div> : null}
            {!loading && filteredCustomers.length === 0 ? <div className="list-state list-state--empty"><span className="empty-wheel" aria-hidden="true" /> <strong>{customers.length ? "No matching customer" : "Your customer garage is ready"}</strong><p>{customers.length ? "Try a different name, phone, or registration." : "Add the first customer to begin building service history."}</p></div> : null}
            {filteredCustomers.map((customer) => (
              <button key={customer.id} className={`customer-row ${selectedId === customer.id ? "is-selected" : ""}`} onClick={() => setSelectedId(customer.id)}>
                <span className="customer-avatar">{initials(customer.name)}</span>
                <span className="customer-row-copy"><strong>{customer.name}</strong><small>+91 {customer.phone}</small></span>
                <span className="vehicle-pill">{customer.vehicleCount ?? vehicles.filter(({ customerId }) => customerId === customer.id).length} vehicle{customer.vehicleCount === 1 ? "" : "s"}</span>
                <span className="row-arrow">›</span>
              </button>
            ))}
          </div>
        </div>

        <aside className="customer-detail">
          {selectedCustomer ? <>
            <div className="detail-header"><div className="detail-avatar">{initials(selectedCustomer.name)}</div><div><span className="detail-type">{selectedCustomer.type}</span><h2>{selectedCustomer.name}</h2><p>{selectedCustomer.phone}</p></div></div>
            <div className="contact-grid"><div><span>Phone</span><strong>{selectedCustomer.phone}</strong></div><div><span>Email</span><strong>{selectedCustomer.email || "Not provided"}</strong></div><div><span>GSTIN</span><strong>{selectedCustomer.gstin || "Not provided"}</strong></div><div><span>Address</span><strong>{selectedCustomer.address || "Not provided"}</strong></div></div>
            <div className="vehicle-section-heading"><div><span className="heading-kicker">Garage</span><h3>Registered vehicles</h3></div><button onClick={openNewVehicleForm}>+ Add Vehicle</button></div>
            <div className="vehicle-list">
              {selectedVehicles.length === 0 ? <div className="vehicle-empty">No vehicle linked to this customer yet.</div> : selectedVehicles.map((vehicle) => <article className="vehicle-card" key={vehicle.id}><div className="vehicle-silhouette" aria-hidden="true">◆</div><div><strong>{vehicle.make} {vehicle.model}</strong><span>{vehicle.variant || `${fuelLabel(vehicle.fuelType)} · ${transmissionOptions.find(({ value }) => value === vehicle.transmission)?.label || ""}`}</span></div><div className="vehicle-card-actions"><div className="registration-plate">{vehicle.registrationNumber}</div><button type="button" onClick={() => openEditVehicleForm(vehicle)} aria-label={`Edit ${vehicle.make} ${vehicle.model}`}>Edit Vehicle</button></div><dl><div><dt>Fuel</dt><dd>{fuelLabel(vehicle.fuelType)}</dd></div><div><dt>Colour</dt><dd>{vehicle.colour || "—"}</dd></div><div><dt>Year</dt><dd>{vehicle.year || "—"}</dd></div><div><dt>Odometer</dt><dd>{vehicle.odometer ? `${vehicle.odometer.toLocaleString("en-IN")} km` : "—"}</dd></div></dl></article>)}
            </div>
            <div className="detail-footer"><button className="text-action" disabled={submitting || selectedVehicles.length > 0} onClick={() => void archiveCustomer()} title={selectedVehicles.length ? "Archive linked vehicles first" : "Archive customer"}>Archive customer</button><button className="job-action" disabled title="Available in the next job-card phase">Create job card <span>→</span></button></div>
          </> : <div className="detail-empty"><span className="empty-wheel" aria-hidden="true"/><h2>Select a customer</h2><p>Customer contact, vehicle, and future service history will appear here.</p></div>}
        </aside>
      </section>

      {showCustomerForm ? <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowCustomerForm(false); }}><form className="module-modal" onSubmit={createCustomer}><ModalHeader eyebrow="New Record" title="Add Customer" onClose={() => setShowCustomerForm(false)} /><div className="form-grid"><label>Customer Type<select value={customerDraft.type} onChange={(e) => setCustomerDraft({ ...customerDraft, type: e.target.value as CustomerType })}><option value="individual">Individual</option><option value="business">Business</option></select></label><label>Full Name / Business Name *<input value={customerDraft.name} onChange={(e) => setCustomerDraft({ ...customerDraft, name: e.target.value })} autoFocus required /></label><label>Mobile Number *<input inputMode="numeric" value={customerDraft.phone} onChange={(e) => setCustomerDraft({ ...customerDraft, phone: e.target.value })} placeholder="10-digit number" required /></label><label>Alternate Number<input inputMode="numeric" value={customerDraft.alternatePhone} onChange={(e) => setCustomerDraft({ ...customerDraft, alternatePhone: e.target.value })} /></label><label>Email Address<input type="email" value={customerDraft.email} onChange={(e) => setCustomerDraft({ ...customerDraft, email: e.target.value })} /></label><label>GSTIN<input value={customerDraft.gstin} onChange={(e) => setCustomerDraft({ ...customerDraft, gstin: e.target.value })} /></label><label className="span-2">Address<input value={customerDraft.address} onChange={(e) => setCustomerDraft({ ...customerDraft, address: e.target.value })} /></label><label className="span-2">Notes<textarea value={customerDraft.notes} onChange={(e) => setCustomerDraft({ ...customerDraft, notes: e.target.value })} rows={3} /></label></div><ModalFooter submitting={submitting} onCancel={() => setShowCustomerForm(false)} label="Save Customer" /></form></div> : null}

      {showVehicleForm ? <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeVehicleForm(); }}><form className="module-modal" onSubmit={saveVehicle}><ModalHeader eyebrow={`Vehicle Owner · ${selectedCustomer?.name ?? ""}`} title={editingVehicleId ? "Edit Vehicle" : "Add Vehicle"} onClose={closeVehicleForm} />{error ? <div className="alert alert--error modal-alert" role="alert">{error}</div> : null}<div className="form-grid"><label>Registration Number *<input value={vehicleDraft.registrationNumber} onChange={(e) => setVehicleDraft({ ...vehicleDraft, registrationNumber: e.target.value.toUpperCase() })} placeholder="MH12AB1234" autoFocus required /></label><label>Make *<input list="vehicle-makes" value={vehicleDraft.make} onChange={(e) => setVehicleDraft({ ...vehicleDraft, make: e.target.value, model: "", variant: "" })} placeholder="Select Or Type Make" required /><datalist id="vehicle-makes">{catalogueMakes.map((value) => <option key={value} value={value} />)}</datalist></label><label>Model *<input list="vehicle-models" value={vehicleDraft.model} onChange={(e) => setVehicleDraft({ ...vehicleDraft, model: e.target.value, variant: "" })} placeholder="Select Or Type Model" required /><datalist id="vehicle-models">{catalogueModels.map((value) => <option key={value} value={value} />)}</datalist></label><label>Variant<input list="vehicle-variants" value={vehicleDraft.variant} onChange={(e) => setVehicleDraft({ ...vehicleDraft, variant: e.target.value })} placeholder="Select Or Type Variant"/><datalist id="vehicle-variants">{catalogueVariants.map((value) => <option key={value} value={value} />)}</datalist></label><label>Colour<input value={vehicleDraft.colour} onChange={(e) => setVehicleDraft({ ...vehicleDraft, colour: e.target.value })} placeholder="Pearl White" /></label><label>Fuel Type<select value={vehicleDraft.fuelType} onChange={(e) => setVehicleDraft({ ...vehicleDraft, fuelType: e.target.value as VehicleFuelType })}>{fuelOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label><label>Transmission<select value={vehicleDraft.transmission} onChange={(e) => setVehicleDraft({ ...vehicleDraft, transmission: e.target.value as VehicleTransmission })}>{transmissionOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label><label>Model Year<input type="number" min="1950" max="2100" value={vehicleDraft.year} onChange={(e) => setVehicleDraft({ ...vehicleDraft, year: e.target.value })} /></label><label>Odometer (km)<input type="number" min="0" value={vehicleDraft.odometer} onChange={(e) => setVehicleDraft({ ...vehicleDraft, odometer: e.target.value })} /></label><label className="span-2">VIN / Chassis Number<input value={vehicleDraft.vin} onChange={(e) => setVehicleDraft({ ...vehicleDraft, vin: e.target.value.toUpperCase() })} /></label><label className="span-2">Vehicle Notes<textarea value={vehicleDraft.notes} onChange={(e) => setVehicleDraft({ ...vehicleDraft, notes: e.target.value })} rows={3} /></label></div><ModalFooter submitting={submitting} onCancel={closeVehicleForm} label={editingVehicleId ? "Save Changes" : "Add Vehicle"} /></form></div> : null}
    </main>
  );
}

function ModalHeader({ eyebrow, title, onClose }: { eyebrow: string; title: string; onClose: () => void }) { return <header className="modal-header"><div><span className="heading-kicker">{eyebrow}</span><h2>{title}</h2></div><button type="button" onClick={onClose} aria-label="Close">×</button></header>; }
function ModalFooter({ submitting, onCancel, label }: { submitting: boolean; onCancel: () => void; label: string }) { return <footer className="modal-footer"><button className="cancel-button" type="button" onClick={onCancel}>Cancel</button><button className="dv-button" type="submit" disabled={submitting}>{submitting ? "Saving…" : label}</button></footer>; }
