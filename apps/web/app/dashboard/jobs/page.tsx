"use client";

import type {
  Customer,
  EstimateApprovalMethod,
  InventoryItem,
  JobLineItem,
  JobPriority,
  JobSheet,
  JobStatus,
  Product,
  ServiceType,
  Vehicle,
} from "@dvcs/types";
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
import { firebaseClient, getFirebaseAppCheckToken } from "@/lib/firebase-client";

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
const starterServices = [
  "General Service",
  "Periodic Maintenance",
  "Running Repair",
  "Accidental Repair",
  "Electrical Diagnosis",
  "AC Service",
  "Water Wash",
  "Accessories Fitting",
  "Tyre & Wheel Service",
  "Inspection Only",
  "Other",
];
type Draft = {
  customerId: string;
  vehicleId: string;
  serviceType: string;
  priority: JobPriority;
  odometer: string;
  fuelLevel: string;
  promisedAt: string;
  complaints: string;
  internalNotes: string;
};
const emptyDraft: Draft = {
  customerId: "",
  vehicleId: "",
  serviceType: "General Service",
  priority: "normal",
  odometer: "",
  fuelLevel: "unknown",
  promisedAt: "",
  complaints: "",
  internalNotes: "",
};
const statusLabel = (status: JobStatus) =>
  stages.find(([value]) => value === status)?.[1] ?? "Cancelled";
type LineDraft = {
  type: "labour" | "product";
  productId: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  discount: string;
  gstRate: string;
};
type WorkshopMember = {
  userId: string;
  displayName: string;
  branchAssignments: { branchId: string; roles: string[] }[];
};
const emptyLine: LineDraft = {
  type: "labour",
  productId: "",
  description: "",
  quantity: "1",
  unit: "JOB",
  unitPrice: "",
  discount: "0",
  gstRate: "18",
};
const currency = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
function displayDate(value: unknown) {
  if (!value) return "Not Recorded";
  if (typeof value === "object" && value && "toDate" in value)
    return (value as { toDate: () => Date }).toDate().toLocaleString("en-IN");
  return new Date(String(value)).toLocaleString("en-IN");
}

export default function JobsPage() {
  const { user, memberships, activeCompanyId, activeBranchId } = useAuth();
  const [jobs, setJobs] = useState<JobSheet[]>([]),
    [customers, setCustomers] = useState<Customer[]>([]),
    [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null),
    [filter, setFilter] = useState<JobStatus | "active" | "all">("active"),
    [search, setSearch] = useState(""),
    [technicianFilter, setTechnicianFilter] = useState("all");
  const [loading, setLoading] = useState(true),
    [showForm, setShowForm] = useState(false),
    [submitting, setSubmitting] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [lines, setLines] = useState<JobLineItem[]>([]),
    [products, setProducts] = useState<Product[]>([]),
    [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [showLineForm, setShowLineForm] = useState(false),
    [lineDraft, setLineDraft] = useState<LineDraft>(emptyLine);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]),
    [addingService, setAddingService] = useState(false),
    [newServiceName, setNewServiceName] = useState("");
  const [technicians, setTechnicians] = useState<WorkshopMember[]>([]);
  const [handledPrefill, setHandledPrefill] = useState(false);
  const membership = memberships.find((item) => item.companyId === activeCompanyId),
    branchRoles =
      membership?.branchAssignments.find((item) => item.branchId === activeBranchId)?.roles ?? [],
    canAssignTechnician =
      (membership?.companyRoles ?? []).some((role) =>
        ["company_owner", "company_admin"].includes(role),
      ) ||
      (membership?.branchAssignments ?? []).some(
        (item) => item.branchId === activeBranchId && item.roles.includes("branch_manager"),
      ),
    isTechnician = branchRoles.includes("technician"),
    canCreateJob = canAssignTechnician || branchRoles.includes("job_creator");
  const [showApproval, setShowApproval] = useState(false),
    [approvalMethod, setApprovalMethod] = useState<EstimateApprovalMethod>("whatsapp"),
    [approvalReference, setApprovalReference] = useState(""),
    [approvalNotes, setApprovalNotes] = useState("");
  const load = useCallback(async () => {
    if (!activeCompanyId || !activeBranchId) return;
    setLoading(true);
    try {
      const [
        jobDocs,
        customerDocs,
        vehicleDocs,
        lineDocs,
        productDocs,
        inventoryDocs,
        serviceDocs,
      ] = await Promise.all([
        getDocs(
          query(
            collection(firebaseClient.db, "jobSheets"),
            where("companyId", "==", activeCompanyId),
            where("branchId", "==", activeBranchId),
          ),
        ),
        getDocs(
          query(
            collection(firebaseClient.db, "customers"),
            where("companyId", "==", activeCompanyId),
            where("branchId", "==", activeBranchId),
          ),
        ),
        getDocs(
          query(
            collection(firebaseClient.db, "vehicles"),
            where("companyId", "==", activeCompanyId),
            where("branchId", "==", activeBranchId),
          ),
        ),
        getDocs(
          query(
            collection(firebaseClient.db, "jobLineItems"),
            where("companyId", "==", activeCompanyId),
            where("branchId", "==", activeBranchId),
          ),
        ),
        getDocs(
          query(
            collection(firebaseClient.db, "products"),
            where("companyId", "==", activeCompanyId),
          ),
        ),
        getDocs(
          query(
            collection(firebaseClient.db, "inventoryItems"),
            where("companyId", "==", activeCompanyId),
            where("branchId", "==", activeBranchId),
          ),
        ),
        getDocs(
          query(
            collection(firebaseClient.db, "serviceTypes"),
            where("companyId", "==", activeCompanyId),
          ),
        ),
      ]);
      const nextJobs = jobDocs.docs
        .map((item) => ({ ...item.data(), id: item.id }) as JobSheet)
        .sort((a, b) => b.jobNumber.localeCompare(a.jobNumber));
      setJobs(nextJobs);
      setCustomers(
        customerDocs.docs
          .map((item) => ({ ...item.data(), id: item.id }) as Customer)
          .filter(({ status }) => status === "active"),
      );
      setVehicles(
        vehicleDocs.docs
          .map((item) => ({ ...item.data(), id: item.id }) as Vehicle)
          .filter(({ status }) => status === "active"),
      );
      setLines(
        lineDocs.docs
          .map((item) => ({ ...item.data(), id: item.id }) as JobLineItem)
          .filter(({ status }) => status === "active"),
      );
      setProducts(
        productDocs.docs
          .map((item) => ({ ...item.data(), id: item.id }) as Product)
          .filter(({ status }) => status === "active"),
      );
      setInventory(
        inventoryDocs.docs
          .map((item) => ({ ...item.data(), id: item.id }) as InventoryItem)
          .filter(({ status }) => status === "active"),
      );
      setServiceTypes(
        serviceDocs.docs
          .map((item) => ({ ...item.data(), id: item.id }) as ServiceType)
          .filter(({ status }) => status === "active")
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setSelectedId((current) =>
        current && nextJobs.some(({ id }) => id === current) ? current : (nextJobs[0]?.id ?? null),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load job cards.");
    } finally {
      setLoading(false);
    }
  }, [activeBranchId, activeCompanyId]);
  const loadTechnicians = useCallback(async () => {
    if (!user || !activeCompanyId || !activeBranchId || !canAssignTechnician) return;
    try {
      const [token, appCheck] = await Promise.all([user.getIdToken(), getFirebaseAppCheckToken()]),
        response = await fetch(
          `/api/v1/team?companyId=${encodeURIComponent(activeCompanyId)}&branchId=${encodeURIComponent(activeBranchId)}`,
          {
            headers: {
              authorization: `Bearer ${token}`,
              "x-firebase-appcheck": appCheck,
            },
          },
        ),
        result = (await response.json()) as { members?: WorkshopMember[]; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to load technicians.");
      setTechnicians(
        (result.members ?? []).filter((member) =>
          member.branchAssignments.some(
            (assignment) =>
              assignment.branchId === activeBranchId && assignment.roles.includes("technician"),
          ),
        ),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load technicians.");
    }
  }, [activeBranchId, activeCompanyId, canAssignTechnician, user]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    void loadTechnicians();
  }, [loadTechnicians]);
  useEffect(() => {
    if (handledPrefill || loading || !canCreateJob) return;
    const parameters = new URLSearchParams(window.location.search),
      customerId = parameters.get("customerId") ?? "",
      vehicleId = parameters.get("vehicleId") ?? "",
      vehicle = vehicles.find((item) => item.id === vehicleId && item.customerId === customerId);
    setHandledPrefill(true);
    if (!customers.some(({ id }) => id === customerId) || !vehicle) return;
    setDraft({
      ...emptyDraft,
      customerId,
      vehicleId,
      odometer: vehicle.odometer ? String(vehicle.odometer) : "",
    });
    setError(null);
    setShowForm(true);
    window.history.replaceState({}, "", "/dashboard/jobs");
  }, [canCreateJob, customers, handledPrefill, loading, vehicles]);
  useEffect(() => {
    if (isTechnician && !canAssignTechnician && user) setTechnicianFilter(user.uid);
  }, [canAssignTechnician, isTechnician, user]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return jobs.filter((job) => {
      const matchesFilter =
        filter === "all" ||
        (filter === "active" &&
          !(["delivered", "cancelled"] as JobStatus[]).includes(job.status)) ||
        job.status === filter;
      const matchesTechnician =
        technicianFilter === "all" ||
        (technicianFilter === "unassigned"
          ? !job.assignedTechnicianIds?.length
          : job.assignedTechnicianIds?.includes(technicianFilter));
      return (
        matchesFilter &&
        matchesTechnician &&
        (!term ||
          `${job.jobNumber} ${job.customerName} ${job.registrationNumber} ${job.vehicleLabel}`
            .toLowerCase()
            .includes(term))
      );
    });
  }, [filter, jobs, search, technicianFilter]);
  const selected = jobs.find(({ id }) => id === selectedId) ?? null;
  useEffect(() => {
    if (filtered.some(({ id }) => id === selectedId)) return;
    setSelectedId(filtered[0]?.id ?? null);
  }, [filtered, selectedId]);
  const customerVehicles = vehicles.filter(({ customerId }) => customerId === draft.customerId);
  const selectedVehicle = vehicles.find(({ id }) => id === draft.vehicleId);
  const selectedCustomer = customers.find(({ id }) => id === draft.customerId);
  const counts = {
    active: jobs.filter(
      ({ status }) => !(["delivered", "cancelled"] as JobStatus[]).includes(status),
    ).length,
    progress: jobs.filter(({ status }) => status === "in_progress").length,
    ready: jobs.filter(({ status }) => status === "ready").length,
    urgent: jobs.filter(
      ({ priority, status }) =>
        priority !== "normal" && !(["delivered", "cancelled"] as JobStatus[]).includes(status),
    ).length,
  };
  const selectedLines = lines.filter(({ jobId }) => jobId === selectedId);
  const estimateTaxable = selectedLines.reduce((sum, line) => sum + line.taxableAmount, 0),
    estimateTax = selectedLines.reduce((sum, line) => sum + line.taxAmount, 0);
  function openNew() {
    setDraft(emptyDraft);
    setAddingService(false);
    setNewServiceName("");
    setError(null);
    setShowForm(true);
  }
  async function addServiceType() {
    if (!user || !activeCompanyId) return;
    const name = newServiceName.trim();
    if (name.length < 2) {
      setError("Enter a Service Type Name.");
      return;
    }
    if (
      [...starterServices, ...serviceTypes.map(({ name: value }) => value)].some(
        (value) => value.toLowerCase() === name.toLowerCase(),
      )
    ) {
      setDraft({ ...draft, serviceType: name });
      setAddingService(false);
      setNewServiceName("");
      return;
    }
    setSubmitting(true);
    try {
      const now = serverTimestamp();
      await writeBatch(firebaseClient.db)
        .set(doc(collection(firebaseClient.db, "serviceTypes")), {
          companyId: activeCompanyId,
          name,
          searchName: name.toLowerCase(),
          status: "active",
          createdAt: now,
          createdBy: user.uid,
          updatedAt: now,
          updatedBy: user.uid,
        })
        .commit();
      setDraft({ ...draft, serviceType: name });
      setAddingService(false);
      setNewServiceName("");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to add the Service Type.");
    } finally {
      setSubmitting(false);
    }
  }
  async function createJob(event: FormEvent) {
    event.preventDefault();
    if (!user || !activeCompanyId || !activeBranchId || !selectedCustomer || !selectedVehicle)
      return;
    const complaints = draft.complaints
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean);
    if (complaints.length === 0) {
      setError("Enter at least one Customer Complaint.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const ref = doc(collection(firebaseClient.db, "jobSheets"));
      const now = serverTimestamp();
      const date = new Date().toISOString().slice(2, 10).replaceAll("-", "");
      const jobNumber = `JC-${date}-${ref.id.slice(0, 5).toUpperCase()}`;
      await writeBatch(firebaseClient.db)
        .set(ref, {
          companyId: activeCompanyId,
          branchId: activeBranchId,
          jobNumber,
          customerId: selectedCustomer.id,
          vehicleId: selectedVehicle.id,
          customerName: selectedCustomer.name,
          vehicleLabel: `${selectedVehicle.make} ${selectedVehicle.model}`,
          registrationNumber: selectedVehicle.registrationNumber,
          status: "check_in",
          priority: draft.priority,
          serviceType: draft.serviceType,
          odometer: draft.odometer ? Number(draft.odometer) : null,
          fuelLevel: draft.fuelLevel === "unknown" ? null : Number(draft.fuelLevel),
          complaints,
          internalNotes: draft.internalNotes.trim(),
          promisedAt: draft.promisedAt || null,
          checkedInAt: now,
          assignedTechnicianIds: [],
          estimateTotal: 0,
          invoiceTotal: 0,
          approvalStatus: "draft",
          estimateLocked: false,
          estimateRevision: 1,
          createdAt: now,
          createdBy: user.uid,
          updatedAt: now,
          updatedBy: user.uid,
        })
        .commit();
      setShowForm(false);
      setDraft(emptyDraft);
      await load();
      setSelectedId(ref.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create the job card.");
    } finally {
      setSubmitting(false);
    }
  }
  async function setStatus(status: JobStatus) {
    if (!user || !selected) return;
    setSubmitting(true);
    setError(null);
    try {
      await updateDoc(doc(firebaseClient.db, "jobSheets", selected.id), {
        status,
        deliveredAt: status === "delivered" ? serverTimestamp() : (selected.deliveredAt ?? null),
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update job status.");
    } finally {
      setSubmitting(false);
    }
  }
  async function assignTechnician(technicianId: string) {
    if (!user || !selected || !canAssignTechnician) return;
    setSubmitting(true);
    setError(null);
    try {
      await updateDoc(doc(firebaseClient.db, "jobSheets", selected.id), {
        assignedTechnicianIds: technicianId ? [technicianId] : [],
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to assign technician.");
    } finally {
      setSubmitting(false);
    }
  }
  function selectProduct(productId: string) {
    const product = products.find(({ id }) => id === productId),
      item = inventory.find(({ productId: id }) => id === productId);
    setLineDraft({
      ...lineDraft,
      productId,
      description: product?.name ?? "",
      unit: product?.unit ?? "NOS",
      unitPrice: String(item?.sellingPrice ?? 0),
      gstRate: String(product?.gstRate ?? 18),
    });
  }
  async function addLine(event: FormEvent) {
    event.preventDefault();
    if (!user || !selected || selected.estimateLocked || !activeCompanyId || !activeBranchId)
      return;
    const quantity = Number(lineDraft.quantity),
      unitPrice = Number(lineDraft.unitPrice),
      discount = Number(lineDraft.discount || 0),
      gstRate = Number(lineDraft.gstRate);
    const taxable = Math.max(0, quantity * unitPrice - discount),
      tax = (taxable * gstRate) / 100,
      total = taxable + tax;
    if (!lineDraft.description.trim() || quantity <= 0 || unitPrice < 0) {
      setError("Enter a Description, Quantity and valid Unit Price.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const now = serverTimestamp(),
        batch = writeBatch(firebaseClient.db);
      batch.set(doc(collection(firebaseClient.db, "jobLineItems")), {
        companyId: activeCompanyId,
        branchId: activeBranchId,
        jobId: selected.id,
        type: lineDraft.type,
        productId: lineDraft.type === "product" ? lineDraft.productId : null,
        description: lineDraft.description.trim(),
        quantity,
        unit: lineDraft.unit,
        unitPrice,
        discount,
        gstRate,
        taxableAmount: taxable,
        taxAmount: tax,
        totalAmount: total,
        status: "active",
        createdAt: now,
        createdBy: user.uid,
        updatedAt: now,
        updatedBy: user.uid,
      });
      batch.update(doc(firebaseClient.db, "jobSheets", selected.id), {
        estimateTotal: increment(total),
        updatedAt: now,
        updatedBy: user.uid,
      });
      await batch.commit();
      setShowLineForm(false);
      setLineDraft(emptyLine);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to add the estimate item.");
    } finally {
      setSubmitting(false);
    }
  }
  async function removeLine(line: JobLineItem) {
    if (
      !user ||
      !selected ||
      selected.estimateLocked ||
      !confirm(`Remove ${line.description} from this estimate?`)
    )
      return;
    setSubmitting(true);
    try {
      const now = serverTimestamp(),
        batch = writeBatch(firebaseClient.db);
      batch.update(doc(firebaseClient.db, "jobLineItems", line.id), {
        status: "removed",
        updatedAt: now,
        updatedBy: user.uid,
      });
      batch.update(doc(firebaseClient.db, "jobSheets", selected.id), {
        estimateTotal: increment(-line.totalAmount),
        updatedAt: now,
        updatedBy: user.uid,
      });
      await batch.commit();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to remove the estimate item.");
    } finally {
      setSubmitting(false);
    }
  }
  async function markEstimateSent() {
    if (!user || !selected || selectedLines.length === 0) return;
    setSubmitting(true);
    try {
      await updateDoc(doc(firebaseClient.db, "jobSheets", selected.id), {
        approvalStatus: "sent",
        status: "estimate_pending",
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to mark the estimate as sent.");
    } finally {
      setSubmitting(false);
    }
  }
  async function recordApproval(approved: boolean) {
    if (!user || !selected) return;
    setSubmitting(true);
    try {
      await updateDoc(doc(firebaseClient.db, "jobSheets", selected.id), {
        approvalStatus: approved ? "approved" : "rejected",
        approvalMethod,
        approvalReference: approvalReference.trim(),
        approvalNotes: approvalNotes.trim(),
        approvalAt: serverTimestamp(),
        approvalBy: user.uid,
        estimateLocked: approved,
        status: approved ? "approved" : "estimate_pending",
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
      setShowApproval(false);
      setApprovalReference("");
      setApprovalNotes("");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to record customer approval.");
    } finally {
      setSubmitting(false);
    }
  }
  async function createRevision() {
    if (
      !user ||
      !selected ||
      !confirm(
        "Create a new estimate revision? The previous approval will remain in the audit history.",
      )
    )
      return;
    setSubmitting(true);
    try {
      await updateDoc(doc(firebaseClient.db, "jobSheets", selected.id), {
        approvalStatus: "draft",
        estimateLocked: false,
        estimateRevision: increment(1),
        status: "estimate_pending",
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create an estimate revision.");
    } finally {
      setSubmitting(false);
    }
  }
  const nextStatus = selected
    ? stages[stages.findIndex(([value]) => value === selected.status) + 1]
    : undefined;
  const technicianNextStages: JobStatus[] = [
      "inspection",
      "estimate_pending",
      "in_progress",
      "quality_check",
      "ready",
    ],
    assignedToCurrentUser = Boolean(user && selected?.assignedTechnicianIds?.includes(user.uid)),
    canAdvanceJob = Boolean(
      nextStatus &&
      (canAssignTechnician ||
        (isTechnician && assignedToCurrentUser && technicianNextStages.includes(nextStatus[0]))),
    );
  const nextInstruction = selected
    ? (
        {
          check_in: "Inspect the vehicle and record the work required.",
          inspection: "Add labour and products to prepare the estimate.",
          estimate_pending: "Send the estimate and record the customer's decision.",
          approved: "Begin the approved work and update the job progress.",
          in_progress: "Complete the work, then move the vehicle to quality check.",
          quality_check: "Verify the repair quality before marking the vehicle ready.",
          ready: "Inform the customer and complete vehicle delivery.",
          delivered: "This job is complete. The history remains available for reference.",
          cancelled: "This job was cancelled. No further workshop action is required.",
        } as Record<JobStatus, string>
      )[selected.status]
    : "";
  return (
    <main className="content jobs-page">
      <div className="dashboard-heading">
        <div>
          <span className="heading-kicker">Service Operations</span>
          <h1>Job Cards</h1>
          <p className="muted">Track every vehicle in service.</p>
        </div>
        {canCreateJob ? (
          <button className="quick-action quick-action--enabled" onClick={openNew}>
            <strong>+</strong> New Job Card
          </button>
        ) : null}
      </div>
      {error && !showForm ? (
        <div className="alert alert--error module-alert">
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      ) : null}
      <section className="process-legend">
        <strong>Priority Guide</strong>
        <span>
          <i className="priority-normal" /> Normal — regular workshop order
        </span>
        <span>
          <i className="priority-urgent" /> Priority — complete sooner
        </span>
        <span>
          <i className="priority-breakdown" /> Very Urgent — attend immediately
        </span>
      </section>
      <section className="job-summary">
        <div className="summary-blue">
          <span>Active Jobs</span>
          <strong>{counts.active}</strong>
        </div>
        <div className="summary-navy">
          <span>In Progress</span>
          <strong>{counts.progress}</strong>
        </div>
        <div className="summary-green">
          <span>Ready</span>
          <strong>{counts.ready}</strong>
        </div>
        <div className={counts.urgent ? "summary-red" : "summary-green"}>
          <span>Urgent</span>
          <strong>{counts.urgent}</strong>
          <small>{counts.urgent ? "Handle these jobs first" : "No urgent jobs"}</small>
        </div>
      </section>
      <section className="job-workspace">
        <div className="job-directory">
          <div className="job-toolbar">
            <div className="search-box">
              <span>⌕</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search Job, Customer or Registration"
              />
            </div>
            <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
              <option value="active">Active Jobs</option>
              <option value="all">All Jobs</option>
              {stages.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
              <option value="cancelled">Cancelled</option>
            </select>
            {canAssignTechnician ? (
              <select
                value={technicianFilter}
                aria-label="Filter by technician"
                onChange={(event) => setTechnicianFilter(event.target.value)}
              >
                <option value="all">All Technicians</option>
                <option value="unassigned">
                  Unassigned ({jobs.filter((job) => !job.assignedTechnicianIds?.length).length})
                </option>
                {technicians.map((technician) => (
                  <option key={technician.userId} value={technician.userId}>
                    {technician.displayName} (
                    {
                      jobs.filter(
                        (job) =>
                          job.assignedTechnicianIds?.includes(technician.userId) &&
                          !(["delivered", "cancelled"] as JobStatus[]).includes(job.status),
                      ).length
                    }
                    )
                  </option>
                ))}
              </select>
            ) : null}
            {canAssignTechnician ? (
              <div className="assignment-snapshot">
                <span>
                  <b>{jobs.filter((job) => !job.assignedTechnicianIds?.length).length}</b>{" "}
                  Unassigned
                </span>
                <span>
                  <b>{technicians.length}</b> Technicians
                </span>
              </div>
            ) : null}
          </div>
          <div className="job-list">
            {loading ? (
              <div className="list-state">
                <span className="spinner" />
                Loading Job Cards…
              </div>
            ) : filtered.length === 0 ? (
              <div className="list-state list-state--empty">
                <strong>
                  {jobs.length ? "No Matching Job Cards" : "Service Reception Is Ready"}
                </strong>
                <p>
                  {jobs.length
                    ? "Try another search or status filter."
                    : "Create the first job card when a vehicle arrives."}
                </p>
              </div>
            ) : (
              filtered.map((job) => (
                <button
                  key={job.id}
                  className={`job-row job-stage-${job.status} ${selectedId === job.id ? "is-selected" : ""}`}
                  onClick={() => setSelectedId(job.id)}
                >
                  <span className="stage-dot" aria-hidden="true" />
                  <span>
                    <strong>{job.registrationNumber}</strong>
                    <small>
                      {job.customerName} · {job.vehicleLabel}
                    </small>
                    <em>
                      {statusLabel(job.status)} · {job.jobNumber}
                    </em>
                  </span>
                  <span className={`job-status status-${job.status}`}>
                    {statusLabel(job.status)}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
        <aside className="job-detail">
          {selected ? (
            <>
              <div className="job-detail-head">
                <div>
                  <span className="heading-kicker">{selected.jobNumber}</span>
                  <h2>{selected.registrationNumber}</h2>
                  <p>
                    {selected.vehicleLabel} · {selected.customerName}
                  </p>
                </div>
                <span className={`job-status status-${selected.status}`}>
                  {statusLabel(selected.status)}
                </span>
              </div>
              <div className="job-stage-track">
                {stages.map(([value, label], index) => {
                  const current = stages.findIndex(([item]) => item === selected.status);
                  return (
                    <div
                      key={value}
                      className={`stage-${value} ${index < current ? "is-done" : index === current ? "is-current" : ""}`}
                    >
                      <i />
                      <span>{label}</span>
                    </div>
                  );
                })}
              </div>
              <div className="job-info-grid">
                <div>
                  <span>Service Type</span>
                  <strong>{selected.serviceType}</strong>
                </div>
                <div>
                  <span>Priority</span>
                  <strong>
                    {selected.priority.charAt(0).toUpperCase() + selected.priority.slice(1)}
                  </strong>
                </div>
                <div>
                  <span>Odometer</span>
                  <strong>
                    {selected.odometer != null
                      ? `${selected.odometer.toLocaleString("en-IN")} km`
                      : "Not Recorded"}
                  </strong>
                </div>
                <div>
                  <span>Fuel Level</span>
                  <strong>
                    {selected.fuelLevel != null
                      ? `${selected.fuelLevel}%`
                      : "Unknown / Not Recorded"}
                  </strong>
                </div>
                <div>
                  <span>Job Created</span>
                  <strong>{displayDate(selected.checkedInAt)}</strong>
                </div>
                <div>
                  <span>Promised Delivery</span>
                  <strong>
                    {selected.promisedAt
                      ? new Date(selected.promisedAt).toLocaleString("en-IN")
                      : "Not Set"}
                  </strong>
                </div>
                <div>
                  <span>Estimate</span>
                  <strong>
                    {selected.estimateTotal ? currency(selected.estimateTotal) : "Pending"}
                  </strong>
                </div>
              </div>
              <section className="job-assignment">
                <div>
                  <span>Assigned To</span>
                  <strong>
                    {technicians.find(({ userId }) =>
                      selected.assignedTechnicianIds?.includes(userId),
                    )?.displayName ?? "Unassigned"}
                  </strong>
                </div>
                {canAssignTechnician ? (
                  <select
                    aria-label="Assign technician"
                    value={selected.assignedTechnicianIds?.[0] ?? ""}
                    disabled={submitting}
                    onChange={(event) => void assignTechnician(event.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {technicians.map((technician) => (
                      <option key={technician.userId} value={technician.userId}>
                        {technician.displayName}
                      </option>
                    ))}
                  </select>
                ) : null}
              </section>
              <section className="estimate-panel">
                <div className="estimate-heading">
                  <div>
                    <span className="heading-kicker">Parts &amp; Labour</span>
                    <h3>Estimate Items</h3>
                  </div>
                  <button
                    disabled={selected.estimateLocked || !canAssignTechnician}
                    onClick={() => {
                      setLineDraft(emptyLine);
                      setError(null);
                      setShowLineForm(true);
                    }}
                  >
                    {selected.estimateLocked ? "Estimate Locked" : "+ Add Item"}
                  </button>
                </div>
                {selectedLines.length === 0 ? (
                  <div className="estimate-empty">No Labour Or Products Added Yet.</div>
                ) : (
                  <div className="estimate-lines">
                    {selectedLines.map((line) => (
                      <div key={line.id}>
                        <span className={`line-type line-${line.type}`}>{line.type}</span>
                        <span>
                          <strong>{line.description}</strong>
                          <small>
                            {line.quantity} {line.unit} × {currency(line.unitPrice)} · GST{" "}
                            {line.gstRate}%
                          </small>
                        </span>
                        <strong>{currency(line.totalAmount)}</strong>
                        <button
                          disabled={selected.estimateLocked || !canAssignTechnician}
                          onClick={() => void removeLine(line)}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="approval-strip">
                  <span className={`approval-state approval-${selected.approvalStatus ?? "draft"}`}>
                    Approval: {selected.approvalStatus ?? "draft"} · Revision{" "}
                    {selected.estimateRevision ?? 1}
                  </span>
                  <div>
                    {canAssignTechnician && !selected.estimateLocked && selectedLines.length > 0 ? (
                      <button onClick={() => void markEstimateSent()}>Mark As Sent</button>
                    ) : null}
                    {canAssignTechnician &&
                    (selected.approvalStatus === "sent" ||
                      selected.approvalStatus === "rejected") ? (
                      <button onClick={() => setShowApproval(true)}>
                        Record Customer Decision
                      </button>
                    ) : null}
                    {canAssignTechnician && selected.estimateLocked ? (
                      <button onClick={() => void createRevision()}>Create Revision</button>
                    ) : null}
                  </div>
                </div>
                <div className="estimate-totals">
                  <span>
                    Taxable <strong>{currency(estimateTaxable)}</strong>
                  </span>
                  <span>
                    GST <strong>{currency(estimateTax)}</strong>
                  </span>
                  <span>
                    Total <strong>{currency(selected.estimateTotal)}</strong>
                  </span>
                </div>
              </section>
              <section className="complaint-panel">
                <span className="heading-kicker">Customer Complaints</span>
                <ol>
                  {selected.complaints.map((complaint, index) => (
                    <li key={`${complaint}-${index}`}>{complaint}</li>
                  ))}
                </ol>
              </section>
              {selected.internalNotes ? (
                <section className="job-note">
                  <span>Internal Notes</span>
                  <p>{selected.internalNotes}</p>
                </section>
              ) : null}
              <section className={`job-next-step next-${selected.status}`}>
                <span>Recommended Next Step</span>
                <strong>{nextInstruction}</strong>
                {nextStatus ? <small>Next process stage: {nextStatus[1]}</small> : null}
              </section>
              <div className="job-detail-actions">
                {canAssignTechnician ? (
                  <button
                    className="cancel-job"
                    disabled={
                      submitting ||
                      selected.status === "delivered" ||
                      selected.status === "cancelled"
                    }
                    onClick={() => void setStatus("cancelled")}
                  >
                    Cancel Job
                  </button>
                ) : null}
                {nextStatus && canAdvanceJob ? (
                  <button
                    className="advance-job"
                    disabled={submitting}
                    onClick={() => {
                      if (nextStatus[0] === "approved") setShowApproval(true);
                      else void setStatus(nextStatus[0]);
                    }}
                  >
                    Move To {nextStatus[1]} <span>→</span>
                  </button>
                ) : null}
              </div>
            </>
          ) : (
            <div className="detail-empty">
              <h2>Select A Job Card</h2>
              <p>Choose a job to view details.</p>
            </div>
          )}
        </aside>
      </section>
      {showForm ? (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !submitting) setShowForm(false);
          }}
        >
          <form className="module-modal job-modal" onSubmit={createJob}>
            <header className="modal-header">
              <div>
                <span className="heading-kicker">Vehicle Check-In</span>
                <h2>New Job Card</h2>
              </div>
              <button type="button" onClick={() => setShowForm(false)}>
                ×
              </button>
            </header>
            {error ? <div className="alert alert--error modal-alert">{error}</div> : null}
            <div className="form-grid">
              <label>
                Customer *
                <select
                  value={draft.customerId}
                  onChange={(e) =>
                    setDraft({ ...draft, customerId: e.target.value, vehicleId: "" })
                  }
                  required
                >
                  <option value="">Select Customer</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name} · {customer.phone}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Vehicle *
                <select
                  value={draft.vehicleId}
                  onChange={(e) => {
                    const vehicle = vehicles.find(({ id }) => id === e.target.value);
                    setDraft({
                      ...draft,
                      vehicleId: e.target.value,
                      odometer: vehicle?.odometer ? String(vehicle.odometer) : draft.odometer,
                    });
                  }}
                  disabled={!draft.customerId}
                  required
                >
                  <option value="">Select Vehicle</option>
                  {customerVehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicle.registrationNumber} · {vehicle.make} {vehicle.model}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Service Type
                <select
                  value={draft.serviceType}
                  onChange={(e) => {
                    if (e.target.value === "__add__") setAddingService(true);
                    else setDraft({ ...draft, serviceType: e.target.value });
                  }}
                >
                  {[...new Set([...starterServices, ...serviceTypes.map(({ name }) => name)])].map(
                    (value) => (
                      <option key={value}>{value}</option>
                    ),
                  )}
                  <option value="__add__">+ Add New Service Type</option>
                </select>
              </label>
              {addingService ? (
                <div className="inline-service-add">
                  <input
                    value={newServiceName}
                    onChange={(e) => setNewServiceName(e.target.value)}
                    placeholder="New Service Type"
                    autoFocus
                  />
                  <button type="button" onClick={() => void addServiceType()} disabled={submitting}>
                    Add
                  </button>
                </div>
              ) : null}
              <label>
                Priority
                <select
                  className={`priority-select priority-select-${draft.priority}`}
                  value={draft.priority}
                  onChange={(e) => setDraft({ ...draft, priority: e.target.value as JobPriority })}
                >
                  <option value="normal">🟢 Normal</option>
                  <option value="urgent">🟡 Priority</option>
                  <option value="breakdown">🔴 Very Urgent / Breakdown</option>
                </select>
              </label>
              <label>
                Current Odometer (km) — Optional
                <input
                  type="number"
                  min="0"
                  value={draft.odometer}
                  onChange={(e) => setDraft({ ...draft, odometer: e.target.value })}
                />
              </label>
              <label>
                Fuel Level
                <select
                  value={draft.fuelLevel}
                  onChange={(e) => setDraft({ ...draft, fuelLevel: e.target.value })}
                >
                  <option value="unknown">Unknown / Not Recorded</option>
                  {[0, 10, 25, 50, 75, 100].map((value) => (
                    <option key={value} value={value}>
                      {value}%
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Promised Delivery
                <input
                  type="datetime-local"
                  value={draft.promisedAt}
                  onChange={(e) => setDraft({ ...draft, promisedAt: e.target.value })}
                />
              </label>
              <label className="span-2">
                Customer Complaints *
                <textarea
                  rows={4}
                  value={draft.complaints}
                  onChange={(e) => setDraft({ ...draft, complaints: e.target.value })}
                  placeholder={
                    "Enter one complaint per line\nExample: Engine noise during cold start"
                  }
                  required
                />
              </label>
              <label className="span-2">
                Internal Workshop Notes
                <textarea
                  rows={3}
                  value={draft.internalNotes}
                  onChange={(e) => setDraft({ ...draft, internalNotes: e.target.value })}
                />
              </label>
            </div>
            <footer className="modal-footer">
              <button type="button" className="cancel-button" onClick={() => setShowForm(false)}>
                Cancel
              </button>
              <button
                className="dv-button"
                disabled={submitting || !draft.customerId || !draft.vehicleId}
              >
                {submitting ? "Creating…" : "Create Job Card"}
              </button>
            </footer>
          </form>
        </div>
      ) : null}
      {showLineForm ? (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !submitting) setShowLineForm(false);
          }}
        >
          <form className="module-modal estimate-modal" onSubmit={addLine}>
            <header className="modal-header">
              <div>
                <span className="heading-kicker">{selected?.jobNumber}</span>
                <h2>Add Estimate Item</h2>
              </div>
              <button type="button" onClick={() => setShowLineForm(false)}>
                ×
              </button>
            </header>
            {error ? <div className="alert alert--error modal-alert">{error}</div> : null}
            <div className="form-grid">
              <label>
                Item Type
                <select
                  value={lineDraft.type}
                  onChange={(e) =>
                    setLineDraft({ ...emptyLine, type: e.target.value as "labour" | "product" })
                  }
                >
                  <option value="labour">Labour / Service</option>
                  <option value="product">Product / Part</option>
                </select>
              </label>
              {lineDraft.type === "product" ? (
                <label>
                  Product *
                  <select
                    value={lineDraft.productId}
                    onChange={(e) => selectProduct(e.target.value)}
                    required
                  >
                    <option value="">Select Product</option>
                    {products.map((product) => {
                      const stock =
                        inventory.find(({ productId }) => productId === product.id)?.currentStock ??
                        0;
                      return (
                        <option key={product.id} value={product.id}>
                          {product.name} · {product.sku} · Stock {stock}
                        </option>
                      );
                    })}
                  </select>
                </label>
              ) : null}
              <label className={lineDraft.type === "labour" ? "span-2" : ""}>
                Description *
                <input
                  value={lineDraft.description}
                  onChange={(e) => setLineDraft({ ...lineDraft, description: e.target.value })}
                  placeholder="Labour Or Part Description"
                  required
                />
              </label>
              <label>
                Quantity
                <input
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={lineDraft.quantity}
                  onChange={(e) => setLineDraft({ ...lineDraft, quantity: e.target.value })}
                />
              </label>
              <label>
                Unit
                <input
                  value={lineDraft.unit}
                  onChange={(e) =>
                    setLineDraft({ ...lineDraft, unit: e.target.value.toUpperCase() })
                  }
                />
              </label>
              <label>
                Unit Price
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={lineDraft.unitPrice}
                  onChange={(e) => setLineDraft({ ...lineDraft, unitPrice: e.target.value })}
                />
              </label>
              <label>
                Discount Amount
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={lineDraft.discount}
                  onChange={(e) => setLineDraft({ ...lineDraft, discount: e.target.value })}
                />
              </label>
              <label>
                GST Rate
                <select
                  value={lineDraft.gstRate}
                  onChange={(e) => setLineDraft({ ...lineDraft, gstRate: e.target.value })}
                >
                  {[0, 5, 12, 18, 28, 40].map((value) => (
                    <option value={value} key={value}>
                      {value}%
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <footer className="modal-footer">
              <button
                type="button"
                className="cancel-button"
                onClick={() => setShowLineForm(false)}
              >
                Cancel
              </button>
              <button className="dv-button" disabled={submitting}>
                {submitting ? "Adding…" : "Add To Estimate"}
              </button>
            </footer>
          </form>
        </div>
      ) : null}
      {showApproval ? (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !submitting) setShowApproval(false);
          }}
        >
          <div className="module-modal approval-modal">
            <header className="modal-header">
              <div>
                <span className="heading-kicker">{selected?.jobNumber}</span>
                <h2>Customer Estimate Decision</h2>
              </div>
              <button type="button" onClick={() => setShowApproval(false)}>
                ×
              </button>
            </header>
            <div className="form-grid">
              <label>
                Approval Method
                <select
                  value={approvalMethod}
                  onChange={(e) => setApprovalMethod(e.target.value as EstimateApprovalMethod)}
                >
                  <option value="whatsapp">WhatsApp</option>
                  <option value="phone">Phone Call</option>
                  <option value="email">Email</option>
                  <option value="signature">Customer Signature</option>
                  <option value="in_person">In Person</option>
                </select>
              </label>
              <label>
                Reference / Contact
                <input
                  value={approvalReference}
                  onChange={(e) => setApprovalReference(e.target.value)}
                  placeholder="Message, call or document reference"
                />
              </label>
              <label className="span-2">
                Approval Notes
                <textarea
                  rows={3}
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  placeholder="Record the customer decision and any conditions"
                />
              </label>
            </div>
            <footer className="modal-footer approval-footer">
              <button
                className="reject-button"
                disabled={submitting}
                onClick={() => void recordApproval(false)}
              >
                Record Rejection
              </button>
              <button
                className="dv-button"
                disabled={submitting}
                onClick={() => void recordApproval(true)}
              >
                Approve & Lock Estimate
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </main>
  );
}
