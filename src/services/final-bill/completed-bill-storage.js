'use strict';

const fs = require('node:fs');
const path = require('node:path');

function atomicJson(file, value) {
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  fs.renameSync(temp, file);
}
function readIndex(file) {
  if (!fs.existsSync(file)) return { schema_version: 1, records: [] };
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (value?.schema_version !== 1 || !Array.isArray(value.records)) throw new Error('Completed bill index format is unsupported');
  return value;
}
function safe(value) { return String(value || 'unknown').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80); }

function saveCompletedBill(storageRoot, completedBill, options = {}) {
  const billsRoot = path.join(storageRoot, 'Bills');
  const indexFile = path.join(billsRoot, 'completed-index.json');
  let tempDirectory = null;
  let finalDirectory = null;
  try {
    if (!path.isAbsolute(storageRoot)) throw new Error('Completed bill Storage root must be absolute');
    fs.mkdirSync(billsRoot, { recursive: true });
    const finalHash = completedBill.final_bill_reference?.source?.sha256;
    if (!finalHash) throw new Error('Final bill SHA-256 is required for persistence');
    const index = readIndex(indexFile);
    const previous = index.records.filter((record) => record.final_sha256 === finalHash);
    if (previous.length && options.allowReprocess !== true) return { status: 'DUPLICATE_FINAL_PDF', existing: previous.map((record) => ({ run_id: record.run_id, package_path: record.package_path, version: record.version })) };
    if (completedBill.status !== 'PARSED') throw new Error(`Completed bill cannot be finalized while status is ${completedBill.status}`);
    const created = new Date(completedBill.created_at);
    if (Number.isNaN(created.getTime())) throw new Error('Completed bill creation timestamp is invalid');
    const year = String(created.getUTCFullYear()); const month = String(created.getUTCMonth() + 1).padStart(2, '0');
    const version = previous.length ? Math.max(...previous.map((record) => record.version || 1)) + 1 : 1;
    const packageName = `${safe(completedBill.original_bill_reference?.bill_number || completedBill.run_id)}-${safe(completedBill.run_id)}-v${version}`;
    const monthRoot = path.join(billsRoot, year, month); fs.mkdirSync(monthRoot, { recursive: true });
    finalDirectory = path.join(monthRoot, packageName);
    if (fs.existsSync(finalDirectory)) throw new Error('Completed bill package already exists; historical data will not be overwritten');
    tempDirectory = `${finalDirectory}.tmp-${process.pid}-${Date.now()}`;
    for (const folder of ['final', 'normalized', 'audit']) fs.mkdirSync(path.join(tempDirectory, folder), { recursive: true });
    if (options.finalPdfPath) {
      const actualHash = require('node:crypto').createHash('sha256').update(fs.readFileSync(options.finalPdfPath)).digest('hex');
      if (actualHash !== finalHash) throw new Error('Final PDF hash changed before persistence');
      fs.copyFileSync(options.finalPdfPath, path.join(tempDirectory, 'final', safe(path.basename(options.finalPdfPath))));
    }
    const stored = structuredClone(completedBill);
    stored.status = 'COMPLETED';
    stored.storage_version = version;
    stored.audit.storage = { status: 'SAVED', package_path: finalDirectory, saved_at: options.timestamp || new Date().toISOString(), final_pdf_copied: Boolean(options.finalPdfPath) };
    atomicJson(path.join(tempDirectory, 'normalized', 'completed-bill.json'), stored);
    atomicJson(path.join(tempDirectory, 'audit', 'extraction-audit.json'), {
      run_id: stored.run_id, reconciliation: stored.reconciliation, extracted_sections: stored.final_extracted_sections,
      extraction: stored.audit.extraction, excluded: stored.excluded_sections, review_required: stored.review_required_records,
      original_reference: stored.original_bill_reference, final_reference: stored.final_bill_reference,
      enhancement_plan_reference: stored.enhancement_plan_reference, enhancement_execution_reference: stored.enhancement_execution_reference
    });
    fs.renameSync(tempDirectory, finalDirectory); tempDirectory = null;
    const indexRecord = { run_id: stored.run_id, final_sha256: finalHash, original_sha256: stored.original_bill_reference.source.sha256,
      package_path: finalDirectory, version, created_at: stored.created_at, saved_at: stored.audit.storage.saved_at };
    index.records.push(indexRecord);
    try { atomicJson(indexFile, index); } catch (error) { fs.rmSync(finalDirectory, { recursive: true, force: true }); throw error; }
    return { status: 'COMPLETED', package_path: finalDirectory, version, completed_bill: stored };
  } catch (error) {
    if (tempDirectory) try { fs.rmSync(tempDirectory, { recursive: true, force: true }); } catch (_) { /* best effort */ }
    return { status: 'SAVE_FAILED', reason: error.message, package_path: finalDirectory };
  }
}

module.exports = { saveCompletedBill };
