"use client";

import type {
  Customer,
  EstimateApprovalMethod,
  InventoryItem,
  Invoice,
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
  getDoc,
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
const priorityLabel = (priority: JobPriority) =>
  priority === "breakdown" ? "Very Urgent" : priority === "urgent" ? "Priority" : "Normal";
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
  gstRate: "",
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
  if (typeof value === "object" && value && "_seconds" in value)
    return new Date(Number((value as { _seconds: number })._seconds) * 1000).toLocaleString(
      "en-IN",
    );
  if (typeof value === "object" && value && "seconds" in value)
    return new Date(Number((value as { seconds: number }).seconds) * 1000).toLocaleString("en-IN");
  return new Date(String(value)).toLocaleString("en-IN");
}

async function sendJobNotification(
  user: NonNullable<ReturnType<typeof useAuth>["user"]>,
  payload: Record<string, string>,
) {
  const [token, appCheck] = await Promise.all([user.getIdToken(), getFirebaseAppCheckToken()]);
  await fetch("/api/v1/notifications", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "x-firebase-appcheck": appCheck,
    },
    body: JSON.stringify(payload),
  });
}

export default function JobsPage() {
  const { user, memberships, activeCompanyId, activeBranchId } = useAuth();
  const [jobs, setJobs] = useState<JobSheet[]>([]),
    [customers, setCustomers] = useState<Customer[]>([]),
    [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null),
    [filter, setFilter] = useState<JobStatus | "active" | "all">("active"),
    [search, setSearch] = useState(""),
    [technicianFilter, setTechnicianFilter] = useState("all"),
    [priorityFilter, setPriorityFilter] = useState<"all" | "urgent">("all");
  const [loading, setLoading] = useState(true),
    [showForm, setShowForm] = useState(false),
    [submitting, setSubmitting] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [lines, setLines] = useState<JobLineItem[]>([]),
    [products, setProducts] = useState<Product[]>([]),
    [inventory, setInventory] = useState<InventoryItem[]>([]),
    [invoices, setInvoices] = useState<Invoice[]>([]);
  const [showLineForm, setShowLineForm] = useState(false),
    [lineDraft, setLineDraft] = useState<LineDraft>(emptyLine);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]),
    [addingService, setAddingService] = useState(false),
    [newServiceName, setNewServiceName] = useState("");
  const [technicians, setTechnicians] = useState<WorkshopMember[]>([]);
  const [handledPrefill, setHandledPrefill] = useState(false);
  const [delayReason, setDelayReason] = useState("");
  const [showDelivery, setShowDelivery] = useState(false);
  const [deliveryDraft, setDeliveryDraft] = useState({ dueAt: "", dueKm: "", notes: "" });
  const [showAssignmentGate, setShowAssignmentGate] = useState(false),
    [gateTechnicianId, setGateTechnicianId] = useState("");
  const [showQualityCheck, setShowQualityCheck] = useState(false),
    [qualityNotes, setQualityNotes] = useState("");
  const [showCancellation, setShowCancellation] = useState(false),
    [cancellationReason, setCancellationReason] = useState("");
  const [showInvoiceGate, setShowInvoiceGate] = useState(false);
  const [showRevision, setShowRevision] = useState(false),
    [revisionReason, setRevisionReason] = useState("");
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
    technicianOnly = isTechnician && !canAssignTechnician,
    canCreateJob = canAssignTechnician || branchRoles.includes("job_creator");
  const [showApproval, setShowApproval] = useState(false),
    [approvalMethod, setApprovalMethod] = useState<EstimateApprovalMethod>("whatsapp"),
    [approvalReference, setApprovalReference] = useState(""),
    [approvalNotes, setApprovalNotes] = useState("");
  const load = useCallback(async () => {
    if (!activeCompanyId || !activeBranchId) return;
    setLoading(true);
    try {
      let assignedJobs: JobSheet[] | null = null;
      if (technicianOnly && user) {
        const [token, appCheck] = await Promise.all([
            user.getIdToken(),
            getFirebaseAppCheckToken(),
          ]),
          response = await fetch(
            `/api/v1/jobs/assigned?companyId=${encodeURIComponent(activeCompanyId)}&branchId=${encodeURIComponent(activeBranchId)}`,
            {
              headers: {
                authorization: `Bearer ${token}`,
                "x-firebase-appcheck": appCheck,
              },
            },
          ),
          result = (await response.json()) as { jobs?: JobSheet[]; error?: string };
        if (!response.ok) throw new Error(result.error ?? "Unable to load assigned jobs.");
        assignedJobs = result.jobs ?? [];
      }
      const jobDocs = technicianOnly
        ? null
        : await getDocs(
            query(
              collection(firebaseClient.db, "jobSheets"),
              where("companyId", "==", activeCompanyId),
              where("branchId", "==", activeBranchId),
            ),
          );
      const [
        customerDocs,
        vehicleDocs,
        lineDocs,
        productDocs,
        inventoryDocs,
        serviceDocs,
        invoiceDocs,
      ] = await Promise.all([
        technicianOnly
          ? Promise.resolve({ docs: [] })
          : getDocs(
              query(
                collection(firebaseClient.db, "customers"),
                where("companyId", "==", activeCompanyId),
                where("branchId", "==", activeBranchId),
              ),
            ),
        technicianOnly
          ? Promise.resolve({ docs: [] })
          : getDocs(
              query(
                collection(firebaseClient.db, "vehicles"),
                where("companyId", "==", activeCompanyId),
                where("branchId", "==", activeBranchId),
              ),
            ),
        technicianOnly
          ? Promise.resolve({ docs: [] })
          : getDocs(
              query(
                collection(firebaseClient.db, "jobLineItems"),
                where("companyId", "==", activeCompanyId),
                where("branchId", "==", activeBranchId),
              ),
            ),
        technicianOnly
          ? Promise.resolve({ docs: [] })
          : getDocs(
              query(
                collection(firebaseClient.db, "products"),
                where("companyId", "==", activeCompanyId),
              ),
            ),
        technicianOnly
          ? Promise.resolve({ docs: [] })
          : getDocs(
              query(
                collection(firebaseClient.db, "inventoryItems"),
                where("companyId", "==", activeCompanyId),
                where("branchId", "==", activeBranchId),
              ),
            ),
        technicianOnly
          ? Promise.resolve({ docs: [] })
          : getDocs(
              query(
                collection(firebaseClient.db, "serviceTypes"),
                where("companyId", "==", activeCompanyId),
              ),
            ),
        technicianOnly
          ? Promise.resolve({ docs: [] })
          : getDocs(
              query(
                collection(firebaseClient.db, "invoices"),
                where("companyId", "==", activeCompanyId),
                where("branchId", "==", activeBranchId),
              ),
            ),
      ]);
      const nextJobs = (
        assignedJobs ??
        jobDocs?.docs.map((item) => ({ ...item.data(), id: item.id }) as JobSheet) ??
        []
      ).sort((a, b) => b.jobNumber.localeCompare(a.jobNumber));
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
      setInvoices(invoiceDocs.docs.map((item) => ({ ...item.data(), id: item.id }) as Invoice));
      setSelectedId((current) =>
        current && nextJobs.some(({ id }) => id === current) ? current : (nextJobs[0]?.id ?? null),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load job cards.");
    } finally {
      setLoading(false);
    }
  }, [activeBranchId, activeCompanyId, technicianOnly, user]);
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
    if (technicianOnly && user) setTechnicianFilter(user.uid);
  }, [technicianOnly, user]);
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("priority");
    if (requested === "urgent") setPriorityFilter("urgent");
  }, []);
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
      const matchesPriority = priorityFilter === "all" || job.priority !== "normal";
      return (
        matchesFilter &&
        matchesTechnician &&
        matchesPriority &&
        (!term ||
          `${job.jobNumber} ${technicianOnly ? "" : job.customerName} ${job.registrationNumber} ${job.vehicleLabel}`
            .toLowerCase()
            .includes(term))
      );
    });
  }, [filter, jobs, priorityFilter, search, technicianFilter, technicianOnly]);
  const selected = jobs.find(({ id }) => id === selectedId) ?? null;
  const selectedInvoice = invoices.find(({ jobId }) => jobId === selectedId) ?? null;
  useEffect(() => {
    if (filtered.some(({ id }) => id === selectedId)) return;
    setSelectedId(filtered[0]?.id ?? null);
  }, [filtered, selectedId]);
  const customerVehicles = vehicles.filter(({ customerId }) => customerId === draft.customerId);
  const selectedVehicle = vehicles.find(({ id }) => id === draft.vehicleId);
  const selectedCustomer = customers.find(({ id }) => id === draft.customerId);
  const activeVehicleJob = jobs.find(
    (job) =>
      job.vehicleId === draft.vehicleId &&
      !(["delivered", "cancelled"] as JobStatus[]).includes(job.status),
  );
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
    if (activeVehicleJob) {
      setError(`This car is inside the workshop under ${activeVehicleJob.jobNumber}.`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const [token, appCheck] = await Promise.all([user.getIdToken(), getFirebaseAppCheckToken()]),
        response = await fetch("/api/v1/jobs/create", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
            ...(appCheck ? { "x-firebase-appcheck": appCheck } : {}),
          },
          body: JSON.stringify({
            companyId: activeCompanyId,
            branchId: activeBranchId,
            customerId: selectedCustomer.id,
            vehicleId: selectedVehicle.id,
            serviceType: draft.serviceType,
            priority: draft.priority,
            odometer: draft.odometer ? Number(draft.odometer) : null,
            fuelLevel: draft.fuelLevel === "unknown" ? null : Number(draft.fuelLevel),
            complaints,
            internalNotes: draft.internalNotes.trim(),
            promisedAt: draft.promisedAt || null,
          }),
        }),
        result = (await response.json()) as { jobId?: string; error?: string };
      if (!response.ok || !result.jobId)
        throw new Error(result.error ?? "Unable to create the job card.");
      setShowForm(false);
      setDraft(emptyDraft);
      await load();
      setSelectedId(result.jobId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create the job card.");
    } finally {
      setSubmitting(false);
    }
  }
  async function setStatus(
    status: JobStatus,
    details: {
      qualityNotes?: string;
      cancellationReason?: string;
      deliveryNotes?: string;
      nextServiceDueAt?: string | null;
      nextServiceDueKm?: number | null;
      assignedTechnicianId?: string;
    } = {},
  ) {
    if (!user || !selected) return;
    setSubmitting(true);
    setError(null);
    try {
      const [token, appCheck] = await Promise.all([user.getIdToken(), getFirebaseAppCheckToken()]),
        response = await fetch("/api/v1/jobs/status", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
            ...(appCheck ? { "x-firebase-appcheck": appCheck } : {}),
          },
          body: JSON.stringify({
            companyId: selected.companyId,
            branchId: selected.branchId,
            jobId: selected.id,
            status,
            qualityNotes: details.qualityNotes ?? "",
            cancellationReason: details.cancellationReason ?? "",
            deliveryNotes: details.deliveryNotes ?? "",
            nextServiceDueAt: details.nextServiceDueAt ?? null,
            nextServiceDueKm: details.nextServiceDueKm ?? null,
            assignedTechnicianId: details.assignedTechnicianId,
          }),
        }),
        result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to update job status.");
      setJobs((current) =>
        current.map((job) =>
          job.id === selected.id
            ? {
                ...job,
                status,
                ...(details.assignedTechnicianId
                  ? { assignedTechnicianIds: [details.assignedTechnicianId] }
                  : {}),
              }
            : job,
        ),
      );
      await load();
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update job status.");
      return false;
    } finally {
      setSubmitting(false);
    }
  }
  async function assignTechnician(technicianId: string) {
    if (!user || !selected || !canAssignTechnician) return false;
    setSubmitting(true);
    setError(null);
    try {
      await updateDoc(doc(firebaseClient.db, "jobSheets", selected.id), {
        assignedTechnicianIds: technicianId ? [technicianId] : [],
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
      if (technicianId) {
        await sendJobNotification(user, {
          companyId: selected.companyId,
          branchId: selected.branchId,
          jobId: selected.id,
          type: "job_assigned",
          recipientUserId: technicianId,
          message: `${selected.jobNumber} has been assigned to you.`,
        });
      }
      await load();
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to assign technician.");
      return false;
    } finally {
      setSubmitting(false);
    }
  }
  async function assignAndStart() {
    if (!gateTechnicianId || !user || !selected) return;
    const changed = await setStatus("in_progress", {
      assignedTechnicianId: gateTechnicianId,
    });
    if (!changed) return;
    await sendJobNotification(user, {
      companyId: selected.companyId,
      branchId: selected.branchId,
      jobId: selected.id,
      type: "job_assigned",
      recipientUserId: gateTechnicianId,
      message: `${selected.jobNumber} has been assigned to you.`,
    });
    setShowAssignmentGate(false);
    setGateTechnicianId("");
  }
  async function confirmQualityCheck(event: FormEvent) {
    event.preventDefault();
    if (qualityNotes.trim().length < 3) return;
    const changed = await setStatus("ready", { qualityNotes: qualityNotes.trim() });
    if (!changed) return;
    setShowQualityCheck(false);
    setQualityNotes("");
  }
  async function confirmCancellation(event: FormEvent) {
    event.preventDefault();
    if (cancellationReason.trim().length < 3) return;
    const changed = await setStatus("cancelled", {
      cancellationReason: cancellationReason.trim(),
    });
    if (!changed) return;
    setShowCancellation(false);
    setCancellationReason("");
  }
  async function reportDelay() {
    if (!user || !selected || !assignedToCurrentUser || delayReason.trim().length < 3) return;
    setSubmitting(true);
    setError(null);
    try {
      await updateDoc(doc(firebaseClient.db, "jobSheets", selected.id), {
        delayReason: delayReason.trim(),
        delayReportedAt: serverTimestamp(),
        delayReportedBy: user.uid,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
      await sendJobNotification(user, {
        companyId: selected.companyId,
        branchId: selected.branchId,
        jobId: selected.id,
        type: "delay_reported",
        message: `${selected.jobNumber}: ${delayReason.trim()}`,
      });
      setDelayReason("");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to report the delay.");
    } finally {
      setSubmitting(false);
    }
  }
  async function completeDelivery(event?: FormEvent, invoiceConfirmed = Boolean(selectedInvoice)) {
    event?.preventDefault();
    if (!user || !selected || !canAssignTechnician) return;
    setSubmitting(true);
    setError(null);
    try {
      if (!invoiceConfirmed) {
        setShowDelivery(false);
        setShowInvoiceGate(true);
        return;
      }
      await setStatus("delivered", {
        deliveryNotes: deliveryDraft.notes.trim(),
        nextServiceDueAt: deliveryDraft.dueAt || null,
        nextServiceDueKm: deliveryDraft.dueKm ? Number(deliveryDraft.dueKm) : null,
      });
      setShowDelivery(false);
      setDeliveryDraft({ dueAt: "", dueKm: "", notes: "" });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to complete delivery.");
    } finally {
      setSubmitting(false);
    }
  }
  async function checkPaymentAndDeliver() {
    if (!selected || !canAssignTechnician) return;
    setSubmitting(true);
    setError(null);
    try {
      const snapshot = await getDoc(doc(firebaseClient.db, "invoices", selected.id)),
        latestInvoice = snapshot.exists()
          ? ({ ...snapshot.data(), id: snapshot.id } as Invoice)
          : null;
      setInvoices((current) => {
        const withoutSelected = current.filter(({ jobId }) => jobId !== selected.id);
        return latestInvoice ? [...withoutSelected, latestInvoice] : withoutSelected;
      });
      if (!latestInvoice) {
        setShowInvoiceGate(true);
        setSubmitting(false);
      } else if (latestInvoice.balanceAmount <= 0) {
        setSubmitting(false);
        await completeDelivery(undefined, true);
      } else {
        setShowDelivery(true);
        setSubmitting(false);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to verify invoice payment.");
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
    if (!lineDraft.description.trim() || quantity <= 0 || unitPrice < 0 || !lineDraft.gstRate) {
      setError("Enter the item details and select the applicable GST rate.");
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
      try {
        const [token, appCheck] = await Promise.all([
          user.getIdToken(),
          getFirebaseAppCheckToken(),
        ]);
        await fetch("/api/v1/jobs/estimate-email", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
            ...(appCheck ? { "x-firebase-appcheck": appCheck } : {}),
          },
          body: JSON.stringify({
            companyId: selected.companyId,
            branchId: selected.branchId,
            jobId: selected.id,
          }),
        });
      } catch {
        // Notification delivery must never block the workshop operation.
      }
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
  async function createRevision(event: FormEvent) {
    event.preventDefault();
    if (selectedInvoice) {
      setError(
        `Invoice ${selectedInvoice.invoiceNumber} is already issued. Issued invoices stay locked; create a separate job for additional work.`,
      );
      return;
    }
    if (!user || !selected || revisionReason.trim().length < 3) return;
    setSubmitting(true);
    setError(null);
    try {
      const [token, appCheck] = await Promise.all([user.getIdToken(), getFirebaseAppCheckToken()]),
        response = await fetch("/api/v1/jobs/revision", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
            ...(appCheck ? { "x-firebase-appcheck": appCheck } : {}),
          },
          body: JSON.stringify({
            companyId: selected.companyId,
            branchId: selected.branchId,
            jobId: selected.id,
            reason: revisionReason.trim(),
          }),
        }),
        result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to create the estimate revision.");
      setShowRevision(false);
      setRevisionReason("");
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
    ],
    assignedToCurrentUser = Boolean(user && selected?.assignedTechnicianIds?.includes(user.uid)),
    canAdvanceJob = Boolean(
      nextStatus &&
      (canAssignTechnician ||
        (technicianOnly && assignedToCurrentUser && technicianNextStages.includes(nextStatus[0]))),
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
            <select
              value={priorityFilter}
              aria-label="Filter by priority"
              className={`priority-filter priority-filter-${priorityFilter}`}
              onChange={(event) => setPriorityFilter(event.target.value as "all" | "urgent")}
            >
              <option value="all">All Priorities</option>
              <option value="urgent">Priority &amp; Very Urgent</option>
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
                      {technicianOnly
                        ? job.vehicleLabel
                        : `${job.customerName} · ${job.vehicleLabel}`}
                    </small>
                    <em>
                      {statusLabel(job.status)} · {job.jobNumber}
                    </em>
                  </span>
                  <div className="job-row-badges">
                    <span className={`job-priority priority-${job.priority}`}>
                      <i aria-hidden="true" /> {priorityLabel(job.priority)}
                    </span>
                    <span className={`job-status status-${job.status}`}>
                      {statusLabel(job.status)}
                    </span>
                  </div>
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
                    {technicianOnly
                      ? selected.vehicleLabel
                      : `${selected.vehicleLabel} · ${selected.customerName}`}
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
                  <strong>{priorityLabel(selected.priority)}</strong>
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
                {!technicianOnly ? (
                  <div>
                    <span>Estimate</span>
                    <strong>
                      {selected.estimateTotal ? currency(selected.estimateTotal) : "Pending"}
                    </strong>
                  </div>
                ) : null}
              </div>
              <section className="job-assignment">
                <div>
                  <span>Assigned To</span>
                  <strong>
                    {technicians.find(({ userId }) =>
                      selected.assignedTechnicianIds?.includes(userId),
                    )?.displayName ??
                      (selected.assignedTechnicianIds?.length ? "Assigned Staff" : "Unassigned")}
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
                    {selected.assignedTechnicianIds?.[0] &&
                    !technicians.some(
                      ({ userId }) => userId === selected.assignedTechnicianIds?.[0],
                    ) ? (
                      <option value={selected.assignedTechnicianIds[0]}>Assigned Staff</option>
                    ) : null}
                    {technicians.map((technician) => (
                      <option key={technician.userId} value={technician.userId}>
                        {technician.displayName}
                      </option>
                    ))}
                  </select>
                ) : null}
              </section>
              {canAssignTechnician ? (
                <section
                  className={`job-payment-status ${
                    !selectedInvoice
                      ? "is-missing"
                      : selectedInvoice.balanceAmount <= 0
                        ? "is-paid"
                        : selectedInvoice.paidAmount > 0
                          ? "is-part-paid"
                          : "is-unpaid"
                  }`}
                >
                  <div>
                    <span>Payment Status</span>
                    <strong>
                      {!selectedInvoice
                        ? "Invoice Not Issued"
                        : selectedInvoice.balanceAmount <= 0
                          ? "Fully Paid"
                          : selectedInvoice.paidAmount > 0
                            ? "Partially Paid"
                            : "Not Paid"}
                    </strong>
                  </div>
                  {selectedInvoice ? (
                    <dl>
                      <div>
                        <dt>Invoice</dt>
                        <dd>{selectedInvoice.invoiceNumber}</dd>
                      </div>
                      <div>
                        <dt>Invoice Total</dt>
                        <dd>{currency(selectedInvoice.totalAmount)}</dd>
                      </div>
                      <div>
                        <dt>Paid</dt>
                        <dd>{currency(selectedInvoice.paidAmount)}</dd>
                      </div>
                      <div>
                        <dt>Balance</dt>
                        <dd>{currency(selectedInvoice.balanceAmount)}</dd>
                      </div>
                    </dl>
                  ) : null}
                </section>
              ) : null}
              {!technicianOnly ? (
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
                    <span
                      className={`approval-state approval-${selected.approvalStatus ?? "draft"}`}
                    >
                      Approval: {selected.approvalStatus ?? "draft"} · Revision{" "}
                      {selected.estimateRevision ?? 1}
                    </span>
                    <div>
                      {canAssignTechnician &&
                      !selected.estimateLocked &&
                      selectedLines.length > 0 ? (
                        <button onClick={() => void markEstimateSent()}>Mark As Sent</button>
                      ) : null}
                      {canAssignTechnician &&
                      (selected.approvalStatus === "sent" ||
                        selected.approvalStatus === "rejected") ? (
                        <button onClick={() => setShowApproval(true)}>
                          Record Customer Decision
                        </button>
                      ) : null}
                      {canAssignTechnician &&
                      !selectedInvoice &&
                      (
                        ["approved", "in_progress", "quality_check", "ready"] as JobStatus[]
                      ).includes(selected.status) ? (
                        <button
                          onClick={() => {
                            setRevisionReason("");
                            setShowRevision(true);
                          }}
                        >
                          Create Revision
                        </button>
                      ) : null}
                      {canAssignTechnician && selected.estimateLocked && selectedInvoice ? (
                        <button type="button" disabled title="An issued invoice cannot be changed">
                          Invoice Issued — Estimate Locked
                        </button>
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
              ) : null}
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
              {selected.delayReason ? (
                <section className="delay-alert">
                  <span>Latest Delay</span>
                  <strong>{selected.delayReason}</strong>
                  <small>{displayDate(selected.delayReportedAt)}</small>
                </section>
              ) : null}
              {technicianOnly && assignedToCurrentUser ? (
                <section className="delay-report">
                  <label htmlFor="delay-reason">Report Delay</label>
                  <div>
                    <input
                      id="delay-reason"
                      value={delayReason}
                      maxLength={500}
                      onChange={(event) => setDelayReason(event.target.value)}
                      placeholder="Reason for delay"
                    />
                    <button
                      type="button"
                      disabled={submitting || delayReason.trim().length < 3}
                      onClick={() => void reportDelay()}
                    >
                      Send
                    </button>
                  </div>
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
                    onClick={() => setShowCancellation(true)}
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
                      else if (
                        nextStatus[0] === "in_progress" &&
                        !selected.assignedTechnicianIds?.length
                      ) {
                        setGateTechnicianId("");
                        setShowAssignmentGate(true);
                      } else if (nextStatus[0] === "ready") {
                        setQualityNotes("");
                        setShowQualityCheck(true);
                      } else if (nextStatus[0] === "delivered") {
                        void checkPaymentAndDeliver();
                      } else void setStatus(nextStatus[0]);
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
      {showRevision && selected ? (
        <div className="modal-backdrop">
          <form className="module-modal workflow-gate-modal" onSubmit={createRevision}>
            <header className="modal-header">
              <div>
                <span className="heading-kicker">Estimate Revision</span>
                <h2>Add More Approved Work</h2>
              </div>
              <button type="button" onClick={() => setShowRevision(false)}>
                ×
              </button>
            </header>
            <div className="modal-body">
              <div className="workflow-info-card">
                <strong>Previous estimate items will remain.</strong>
                <span>
                  This job returns to Estimate Pending and its technician assignment is cleared.
                </span>
              </div>
              <label>
                Revision Reason
                <textarea
                  rows={3}
                  value={revisionReason}
                  onChange={(event) => setRevisionReason(event.target.value)}
                  placeholder="Example: Customer requested additional AC work"
                  required
                />
              </label>
            </div>
            <footer className="modal-footer">
              <button
                type="button"
                className="cancel-button"
                onClick={() => setShowRevision(false)}
              >
                Keep Current Work
              </button>
              <button
                className="dv-button"
                disabled={submitting || revisionReason.trim().length < 3}
              >
                {submitting ? "Creating…" : "Create Revision"}
              </button>
            </footer>
          </form>
        </div>
      ) : null}
      {showAssignmentGate && selected ? (
        <div className="modal-backdrop">
          <form
            className="module-modal workflow-gate-modal"
            onSubmit={(event) => {
              event.preventDefault();
              void assignAndStart();
            }}
          >
            <header className="modal-header">
              <div>
                <span className="heading-kicker">Assignment Required</span>
                <h2>Who Will Work On This Vehicle?</h2>
              </div>
              <button type="button" onClick={() => setShowAssignmentGate(false)}>
                ×
              </button>
            </header>
            <div className="modal-body">
              <p className="workflow-gate-copy">
                Assign a technician before moving {selected.jobNumber} to In Progress.
              </p>
              <label>
                Technician
                <select
                  value={gateTechnicianId}
                  onChange={(event) => setGateTechnicianId(event.target.value)}
                  required
                >
                  <option value="">Select Technician</option>
                  {technicians.map((technician) => (
                    <option key={technician.userId} value={technician.userId}>
                      {technician.displayName}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <footer className="modal-footer">
              <button
                type="button"
                className="cancel-button"
                onClick={() => setShowAssignmentGate(false)}
              >
                Not Now
              </button>
              <button className="dv-button" disabled={submitting || !gateTechnicianId}>
                {submitting ? "Assigning…" : "Assign & Start Work"}
              </button>
            </footer>
          </form>
        </div>
      ) : null}
      {showQualityCheck && selected ? (
        <div className="modal-backdrop">
          <form className="module-modal workflow-gate-modal" onSubmit={confirmQualityCheck}>
            <header className="modal-header">
              <div>
                <span className="heading-kicker">Quality Sign-Off</span>
                <h2>Confirm The Vehicle Is Ready</h2>
              </div>
              <button type="button" onClick={() => setShowQualityCheck(false)}>
                ×
              </button>
            </header>
            <div className="modal-body">
              <p className="workflow-gate-copy">
                Record the final check before informing the customer.
              </p>
              <label>
                Quality Check Note
                <textarea
                  rows={3}
                  value={qualityNotes}
                  onChange={(event) => setQualityNotes(event.target.value)}
                  placeholder="Example: Road test completed; all approved work verified"
                  required
                />
              </label>
            </div>
            <footer className="modal-footer">
              <button
                type="button"
                className="cancel-button"
                onClick={() => setShowQualityCheck(false)}
              >
                Go Back
              </button>
              <button className="dv-button" disabled={submitting || qualityNotes.trim().length < 3}>
                {submitting ? "Saving…" : "Confirm Ready"}
              </button>
            </footer>
          </form>
        </div>
      ) : null}
      {showCancellation && selected ? (
        <div className="modal-backdrop">
          <form className="module-modal workflow-gate-modal" onSubmit={confirmCancellation}>
            <header className="modal-header">
              <div>
                <span className="heading-kicker">Audit Required</span>
                <h2>Cancel This Job?</h2>
              </div>
              <button type="button" onClick={() => setShowCancellation(false)}>
                ×
              </button>
            </header>
            <div className="modal-body">
              <p className="workflow-gate-copy">The reason will remain in the job history.</p>
              <label>
                Cancellation Reason
                <textarea
                  rows={3}
                  value={cancellationReason}
                  onChange={(event) => setCancellationReason(event.target.value)}
                  placeholder="Example: Customer declined the estimate"
                  required
                />
              </label>
            </div>
            <footer className="modal-footer">
              <button
                type="button"
                className="cancel-button"
                onClick={() => setShowCancellation(false)}
              >
                Keep Job
              </button>
              <button
                className="dv-button danger-button"
                disabled={submitting || cancellationReason.trim().length < 3}
              >
                {submitting ? "Cancelling…" : "Confirm Cancellation"}
              </button>
            </footer>
          </form>
        </div>
      ) : null}
      {showInvoiceGate && selected ? (
        <div className="modal-backdrop">
          <section className="module-modal workflow-gate-modal">
            <header className="modal-header">
              <div>
                <span className="heading-kicker">Invoice Required</span>
                <h2>Issue The Invoice Before Delivery</h2>
              </div>
              <button type="button" onClick={() => setShowInvoiceGate(false)}>
                ×
              </button>
            </header>
            <div className="modal-body">
              <p className="workflow-gate-copy">
                Every completed job needs an invoice. For warranty or free work, issue a ₹0 invoice.
              </p>
            </div>
            <footer className="modal-footer">
              <button
                type="button"
                className="cancel-button"
                onClick={() => setShowInvoiceGate(false)}
              >
                Back To Job
              </button>
              <button
                type="button"
                className="dv-button"
                onClick={() => {
                  window.location.href = "/dashboard/invoices";
                }}
              >
                Go To Invoices
              </button>
            </footer>
          </section>
        </div>
      ) : null}
      {showDelivery && selected ? (
        <div className="modal-backdrop">
          <form className="module-modal delivery-modal" onSubmit={completeDelivery}>
            <header className="modal-header">
              <div>
                <span className="heading-kicker">Vehicle Ready</span>
                <h2>Complete Delivery</h2>
              </div>
              <button type="button" onClick={() => setShowDelivery(false)}>
                ×
              </button>
            </header>
            <div className="modal-body">
              <div className="delivery-vehicle">
                <strong>{selected.registrationNumber}</strong>
                <span>
                  {selected.customerName} · {selected.vehicleLabel}
                </span>
              </div>
              <div
                className={`delivery-payment-warning ${
                  selectedInvoice && selectedInvoice.paidAmount > 0 ? "is-part-paid" : "is-unpaid"
                }`}
              >
                <strong>
                  {selectedInvoice && selectedInvoice.paidAmount > 0
                    ? "Customer Has Only Partially Paid"
                    : "Customer Has Not Paid"}
                </strong>
                <span>
                  {selectedInvoice
                    ? `${currency(selectedInvoice.paidAmount)} paid · ${currency(selectedInvoice.balanceAmount)} still due.`
                    : "An invoice is required before delivery."}
                </span>
              </div>
              <div className="form-grid">
                <label>
                  Next Service Date
                  <input
                    type="date"
                    value={deliveryDraft.dueAt}
                    onChange={(event) =>
                      setDeliveryDraft({ ...deliveryDraft, dueAt: event.target.value })
                    }
                  />
                </label>
                <label>
                  Next Service Odometer (km)
                  <input
                    type="number"
                    min="0"
                    value={deliveryDraft.dueKm}
                    onChange={(event) =>
                      setDeliveryDraft({ ...deliveryDraft, dueKm: event.target.value })
                    }
                    placeholder="Example: 45000"
                  />
                </label>
                <label className="span-2">
                  Delivery Notes
                  <textarea
                    rows={3}
                    value={deliveryDraft.notes}
                    onChange={(event) =>
                      setDeliveryDraft({ ...deliveryDraft, notes: event.target.value })
                    }
                    placeholder="Work completed, warranty or customer instructions"
                  />
                </label>
              </div>
              <p className="delivery-reminder-note">
                Adding a date or odometer schedules the customer’s next-service reminder.
              </p>
            </div>
            <footer className="modal-footer">
              <button
                type="button"
                className="cancel-button"
                onClick={() => setShowDelivery(false)}
              >
                Cancel
              </button>
              <button className="dv-button" disabled={submitting}>
                {submitting ? "Completing…" : "Confirm Delivery With Balance"}
              </button>
            </footer>
          </form>
        </div>
      ) : null}
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
              {activeVehicleJob ? (
                <div className="span-2 vehicle-in-shop-warning">
                  <strong>This car is inside our workshop.</strong>
                  <span>
                    Active Job {activeVehicleJob.jobNumber} · {statusLabel(activeVehicleJob.status)}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      setSelectedId(activeVehicleJob.id);
                    }}
                  >
                    Open Active Job
                  </button>
                </div>
              ) : null}
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
                disabled={
                  submitting || !draft.customerId || !draft.vehicleId || Boolean(activeVehicleJob)
                }
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
                GST Rate *
                <select
                  value={lineDraft.gstRate}
                  onChange={(e) => setLineDraft({ ...lineDraft, gstRate: e.target.value })}
                  required
                >
                  <option value="">Select GST</option>
                  {[0, 5, 12, 18, 28, 40].map((value) => (
                    <option value={value} key={value}>
                      {value}%
                    </option>
                  ))}
                </select>
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
