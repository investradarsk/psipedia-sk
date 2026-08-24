import { env } from "cloudflare:workers";

export type OperatorType = "individual" | "sole_trader" | "company";
export type MediaRegistrationStatus = "not_submitted" | "submitted" | "registered";
export type RpvsStatus = "not_registered" | "in_progress" | "registered";

export type LegalSettings = {
  operatorType: OperatorType;
  legalName: string;
  businessName: string;
  address: string;
  ico: string;
  dic: string;
  vatId: string;
  email: string;
  phone: string;
  registryName: string;
  registryNumber: string;
  mediaRegistryNumber: string;
  mediaStatus: MediaRegistrationStatus;
  rpvsStatus: RpvsStatus;
  correctionEmail: string;
  privacyEmail: string;
  updatedAt: string;
};

export type LegalSettingsInput = Partial<Omit<LegalSettings, "updatedAt">>;

type LegalSettingsRow = {
  id: number;
  operator_type: string;
  legal_name: string;
  business_name: string;
  address: string;
  ico: string;
  dic: string;
  vat_id: string;
  email: string;
  phone: string;
  registry_name: string;
  registry_number: string;
  media_registry_number: string;
  media_status: string;
  rpvs_status: string;
  correction_email: string;
  privacy_email: string;
  updated_at: string;
  updated_by: string;
};

type RuntimeBindings = { DB?: D1Database };

export const defaultLegalSettings: LegalSettings = {
  operatorType: "individual",
  legalName: "Martin Zábranský",
  businessName: "",
  address: "",
  ico: "",
  dic: "",
  vatId: "",
  email: "",
  phone: "",
  registryName: "",
  registryNumber: "",
  mediaRegistryNumber: "",
  mediaStatus: "not_submitted",
  rpvsStatus: "not_registered",
  correctionEmail: "",
  privacyEmail: "",
  updatedAt: "",
};

function getD1Binding() {
  const database = (env as unknown as RuntimeBindings).DB;
  return database && typeof database.prepare === "function" ? database : null;
}

function requireD1Binding() {
  const database = getD1Binding();
  if (!database) throw new Error("Databáza právnych údajov zatiaľ nie je pripojená.");
  return database;
}

async function ensureLegalSettingsStore(database: D1Database) {
  void database;
  // Schema creation is handled by deployment migrations.
}

function isOperatorType(value: string): value is OperatorType {
  return value === "individual" || value === "sole_trader" || value === "company";
}

function isMediaStatus(value: string): value is MediaRegistrationStatus {
  return value === "not_submitted" || value === "submitted" || value === "registered";
}

function isRpvsStatus(value: string): value is RpvsStatus {
  return value === "not_registered" || value === "in_progress" || value === "registered";
}

function rowToLegalSettings(row: LegalSettingsRow): LegalSettings {
  return {
    operatorType: isOperatorType(row.operator_type) ? row.operator_type : "individual",
    legalName: row.legal_name,
    businessName: row.business_name,
    address: row.address,
    ico: row.ico,
    dic: row.dic,
    vatId: row.vat_id,
    email: row.email,
    phone: row.phone,
    registryName: row.registry_name,
    registryNumber: row.registry_number,
    mediaRegistryNumber: row.media_registry_number,
    mediaStatus: isMediaStatus(row.media_status) ? row.media_status : "not_submitted",
    rpvsStatus: isRpvsStatus(row.rpvs_status) ? row.rpvs_status : "not_registered",
    correctionEmail: row.correction_email,
    privacyEmail: row.privacy_email,
    updatedAt: row.updated_at,
  };
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanEmail(value: unknown) {
  const email = cleanText(value, 180).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("E-mailová adresa nie je platná.");
  return email;
}

function normalizeInput(payload: LegalSettingsInput): Omit<LegalSettings, "updatedAt"> {
  const operatorType = payload.operatorType && isOperatorType(payload.operatorType) ? payload.operatorType : "individual";
  const mediaStatus = payload.mediaStatus && isMediaStatus(payload.mediaStatus) ? payload.mediaStatus : "not_submitted";
  const rpvsStatus = payload.rpvsStatus && isRpvsStatus(payload.rpvsStatus) ? payload.rpvsStatus : "not_registered";
  const legalName = cleanText(payload.legalName, 180);
  if (!legalName) throw new Error("Doplň meno alebo názov prevádzkovateľa.");
  return {
    operatorType,
    legalName,
    businessName: cleanText(payload.businessName, 180),
    address: cleanText(payload.address, 300),
    ico: cleanText(payload.ico, 30),
    dic: cleanText(payload.dic, 30),
    vatId: cleanText(payload.vatId, 30),
    email: cleanEmail(payload.email),
    phone: cleanText(payload.phone, 50),
    registryName: cleanText(payload.registryName, 180),
    registryNumber: cleanText(payload.registryNumber, 120),
    mediaRegistryNumber: cleanText(payload.mediaRegistryNumber, 120),
    mediaStatus,
    rpvsStatus,
    correctionEmail: cleanEmail(payload.correctionEmail),
    privacyEmail: cleanEmail(payload.privacyEmail),
  };
}

export async function getLegalSettings() {
  const database = getD1Binding();
  if (!database) return defaultLegalSettings;
  await ensureLegalSettingsStore(database);
  const row = await database.prepare(`
    SELECT id, operator_type, legal_name, business_name, address, ico, dic, vat_id, email, phone,
      registry_name, registry_number, media_registry_number, media_status, rpvs_status,
      correction_email, privacy_email, updated_at, updated_by
    FROM legal_settings WHERE id = 1 LIMIT 1
  `).first<LegalSettingsRow>();
  return row ? rowToLegalSettings(row) : defaultLegalSettings;
}

export async function saveLegalSettings(payload: LegalSettingsInput, updatedBy: string) {
  const database = requireD1Binding();
  await ensureLegalSettingsStore(database);
  const input = normalizeInput(payload);
  const updatedAt = new Date().toISOString();
  const row = await database.prepare(`
    INSERT INTO legal_settings (
      id, operator_type, legal_name, business_name, address, ico, dic, vat_id, email, phone,
      registry_name, registry_number, media_registry_number, media_status, rpvs_status,
      correction_email, privacy_email, updated_at, updated_by
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      operator_type = excluded.operator_type,
      legal_name = excluded.legal_name,
      business_name = excluded.business_name,
      address = excluded.address,
      ico = excluded.ico,
      dic = excluded.dic,
      vat_id = excluded.vat_id,
      email = excluded.email,
      phone = excluded.phone,
      registry_name = excluded.registry_name,
      registry_number = excluded.registry_number,
      media_registry_number = excluded.media_registry_number,
      media_status = excluded.media_status,
      rpvs_status = excluded.rpvs_status,
      correction_email = excluded.correction_email,
      privacy_email = excluded.privacy_email,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by
    RETURNING *
  `).bind(
    input.operatorType, input.legalName, input.businessName, input.address, input.ico, input.dic,
    input.vatId, input.email, input.phone, input.registryName, input.registryNumber,
    input.mediaRegistryNumber, input.mediaStatus, input.rpvsStatus, input.correctionEmail,
    input.privacyEmail, updatedAt, updatedBy,
  ).first<LegalSettingsRow>();
  if (!row) throw new Error("Právne údaje sa nepodarilo uložiť.");
  return rowToLegalSettings(row);
}

export function legalReadiness(settings: LegalSettings) {
  const operator = Boolean(settings.legalName && settings.address && settings.email && settings.phone);
  const business = settings.operatorType === "individual" || Boolean(settings.ico && settings.registryName && settings.registryNumber);
  const corrections = Boolean(settings.correctionEmail);
  const media = settings.mediaStatus === "registered" && Boolean(settings.mediaRegistryNumber);
  const rpvs = settings.rpvsStatus === "registered";
  return { operator, business, corrections, media, rpvs, complete: operator && business && corrections && media && rpvs };
}
