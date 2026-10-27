/**
 * Doctor Management Backend Handler
 * Handles CRUD operations, search filtering, and validation for doctors.
 */

export function listDoctors(doctors = [], query = {}) {
  const q = String(query.q || query.search || "").trim().toLowerCase();
  const digits = q.replace(/\D/g, "");

  if (!q) {
    return [...doctors].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }

  return doctors
    .filter((d) => {
      const nameMatch = d.name && d.name.toLowerCase().includes(q);
      const hospMatch = d.hospital && d.hospital.toLowerCase().includes(q);
      const addrMatch = d.hospitalAddress && d.hospitalAddress.toLowerCase().includes(q);
      const phoneMatch = d.phone && (d.phone.includes(q) || (digits.length > 0 && d.phone.replace(/\D/g, "").includes(digits)));
      const regMatch = d.regNo && d.regNo.toLowerCase().includes(q);

      return nameMatch || hospMatch || addrMatch || phoneMatch || regMatch;
    })
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
}

export function createDoctor(payload = {}, doctors = []) {
  const name = String(payload.name || "").trim();
  const hospital = String(payload.hospital || "").trim();
  const phone = String(payload.phone || "").trim();
  const hospitalAddress = String(payload.hospitalAddress || "").trim();
  const regNo = String(payload.regNo || "").trim();
  const branchId = payload.branchId ? String(payload.branchId).trim() : undefined;

  if (!name) {
    throw new Error("Doctor name is required.");
  }
  if (!hospital) {
    throw new Error("Hospital / clinic name is required.");
  }
  if (!phone) {
    throw new Error("Contact phone number is required.");
  }

  const cleanPhone = phone.replace(/[^\d+]/g, "");
  if (cleanPhone.replace(/\D/g, "").length < 7) {
    throw new Error("Please enter a valid phone number with at least 7 digits.");
  }

  function cleanObject(obj) {
    const res = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined) res[k] = v;
    }
    return res;
  }

  const newDoc = cleanObject({
    id: payload.id || `doc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name,
    hospital,
    hospitalAddress: hospitalAddress || undefined,
    phone: cleanPhone,
    regNo: regNo || undefined,
    branchId: branchId || undefined,
    createdAt: new Date().toISOString(),
  });

  return {
    success: true,
    doctor: newDoc,
    doctors: [newDoc, ...doctors],
  };
}

export function updateDoctor(id, patch = {}, doctors = []) {
  const idx = doctors.findIndex((d) => d.id === id);
  if (idx === -1) {
    throw new Error(`Doctor with ID '${id}' not found.`);
  }

  const current = doctors[idx];
  const name = patch.name !== undefined ? String(patch.name).trim() : current.name;
  const hospital = patch.hospital !== undefined ? String(patch.hospital).trim() : current.hospital;
  const phone = patch.phone !== undefined ? String(patch.phone).trim() : current.phone;
  const hospitalAddress = patch.hospitalAddress !== undefined ? String(patch.hospitalAddress).trim() : current.hospitalAddress;
  const regNo = patch.regNo !== undefined ? String(patch.regNo).trim() : current.regNo;

  if (!name) {
    throw new Error("Doctor name cannot be empty.");
  }
  if (!hospital) {
    throw new Error("Hospital name cannot be empty.");
  }
  if (!phone) {
    throw new Error("Contact phone number cannot be empty.");
  }

  const cleanPhone = phone.replace(/[^\d+]/g, "");
  if (cleanPhone.replace(/\D/g, "").length < 7) {
    throw new Error("Please enter a valid phone number with at least 7 digits.");
  }

  const updatedRaw = {
    ...current,
    ...patch,
    name,
    hospital,
    hospitalAddress: hospitalAddress || undefined,
    phone: cleanPhone,
    regNo: regNo || undefined,
    updatedAt: new Date().toISOString(),
  };

  const updated = {};
  for (const [k, v] of Object.entries(updatedRaw)) {
    if (v !== undefined) updated[k] = v;
  }

  const updatedList = doctors.map((d) => (d.id === id ? updated : d));

  return {
    success: true,
    doctor: updated,
    doctors: updatedList,
  };
}

export function deleteDoctor(id, doctors = []) {
  const target = doctors.find((d) => d.id === id);
  if (!target) {
    throw new Error(`Doctor with ID '${id}' not found.`);
  }

  const updatedList = doctors.filter((d) => d.id !== id);

  return {
    success: true,
    deletedDoctor: target,
    doctors: updatedList,
  };
}
