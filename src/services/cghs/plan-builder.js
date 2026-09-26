'use strict';

const { normalizeCode, normalizeDescription, isExecutableAuthority } = require('./registry');
const { RESOLUTION_STATUSES, RULE_SET_VERSION, getDefaultRuleSet } = require('./rule-resolution');
const {
  ACTION_STATES,
  EXCLUDED_STATUS,
  EXECUTABLE_RESOLUTION_STATUSES,
  PLAN_READINESS,
  PLAN_SCHEMA_VERSION,
  PLAN_STATUSES,
  PLAN_VERSION,
  REVIEW_STATUS,
  SUPPORTED_UNITS,
  EnhancementPlanValidator,
  computePlanHash,
  validateQuantity
} = require('./plan-validator');

const PROTECTED_RAW_ALIAS_CODES = new Set(['C002', 'C003', 'C008', 'C010', 'C011', 'C012', 'C014', 'N002', 'P001', 'T004', 'T005']);

const BLOCKING_CODES = Object.freeze({
  CROSS_BILL_DATA_ERROR: 'CROSS_BILL_DATA_ERROR',
  MISSING_PARSER_RESULT: 'MISSING_PARSER_RESULT',
  MISSING_RESOLUTION_RESULT: 'MISSING_RESOLUTION_RESULT',
  MISSING_BILL_SESSION: 'MISSING_BILL_SESSION',
  MISSING_SOURCE_BILL: 'MISSING_SOURCE_BILL',
  INVALID_RESOLUTION_SET: 'INVALID_RESOLUTION_SET',
  NO_CANDIDATES: 'NO_CANDIDATES'
});

function nowIso(clock) {
  return (clock || (() => new Date()))().toISOString();
}

function candidateCode(candidate) {
  return normalizeCode(candidate?.codeRaw || candidate?.codeNormalizedCandidate || candidate?.input?.codeRaw || '');
}

function candidateQuantityRaw(candidate) {
  return candidate?.quantityRaw ?? candidate?.input?.quantityRaw ?? null;
}

function candidateQuantity(candidate) {
  if (Number.isFinite(candidate?.quantityNormalized)) return candidate.quantityNormalized;
  if (Number.isFinite(candidate?.quantity)) return candidate.quantity;
  const raw = candidateQuantityRaw(candidate);
  if (raw == null || raw === '') return null;
  const number = Number(String(raw).replace(/[,\s]/g, ''));
  return Number.isFinite(number) ? number : raw;
}

function evidenceFromCandidate(candidate, fallbackResolution = null) {
  const evidence = candidate?.evidence || fallbackResolution?.evidence?.[0] || {};
  return {
    pageNumber: candidate?.pageNumber || evidence.pageNumber || null,
    section: candidate?.section || evidence.sourceSection || evidence.section || null,
    text: evidence.sourceText || evidence.text || candidate?.rawText || null,
    lineNumbers: evidence.lineNumbers || []
  };
}

function inputFromCandidate(candidate, resolution = null) {
  return {
    rawCode: candidateCode(candidate) || resolution?.input?.codeRaw || null,
    description: candidate?.description || resolution?.input?.description || null,
    quantityRaw: candidateQuantityRaw(candidate)
  };
}

function byCandidateId(parserResult) {
  const map = new Map();
  for (const candidate of parserResult?.candidates || []) if (candidate?.candidateId) map.set(candidate.candidateId, candidate);
  return map;
}

function resultCandidateId(result) {
  return result?.candidateId || null;
}

function isCandidateExcluded(candidate, resolution) {
  const section = String(candidate?.section || candidate?.evidence?.sourceSection || resolution?.input?.section || '').toUpperCase();
  const candidateStatus = String(candidate?.status || '').toUpperCase();
  if (section === 'PATIENT_PAYABLE') return { excluded: true, reasonCode: 'PATIENT_PAYABLE', reason: 'Excluded from main CGHS enhancement aggregation.' };
  if (['NON_DOMAIN', 'ADMIN', 'PAYMENT', 'SUMMARY', 'DISCOUNT', 'FOOTER', 'HEADER'].includes(section)) return { excluded: true, reasonCode: 'NON_DOMAIN_SECTION', reason: `Section ${section} is outside supported CGHS enhancement scope.` };
  if (['IGNORED', 'UNSUPPORTED', 'NON_DOMAIN'].includes(candidateStatus)) return { excluded: true, reasonCode: 'UNSUPPORTED_CANDIDATE', reason: `Candidate status ${candidateStatus || 'UNKNOWN'} is outside supported EnhancementPlan actions.` };
  if (resolution?.status === RESOLUTION_STATUSES.REJECTED) return { excluded: true, reasonCode: 'REJECTED_BY_RULE', reason: resolution.reason || 'Resolution rejected this candidate.' };
  return { excluded: false };
}

function duplicateKey(candidate) {
  const evidence = evidenceFromCandidate(candidate);
  return [
    evidence.pageNumber || '',
    evidence.section || '',
    normalizeDescription(evidence.text || ''),
    normalizeDescription(candidate?.description || ''),
    candidateCode(candidate),
    candidateQuantityRaw(candidate) ?? '',
    (evidence.lineNumbers || []).join(',')
  ].join('|');
}

function actionGroupKey(candidate, resolution) {
  const finalCode = normalizeCode(resolution?.output?.finalCode || '');
  const unit = resolution?.output?.unit || null;
  const ruleOrRegistry = resolution?.ruleId || resolution?.registryEntryId || 'DIRECT';
  const semantic = normalizeDescription(candidate?.description || resolution?.input?.description || '');
  return [finalCode, unit || 'NO_UNIT', ruleOrRegistry, semantic].join('|');
}

function ruleFor(ruleSetContext, ruleId) {
  return (ruleSetContext?.rules || []).find((rule) => rule.ruleId === ruleId) || null;
}

function isRuleValidated(ruleSetContext, ruleId) {
  if (!ruleId) return true;
  const rule = ruleFor(ruleSetContext, ruleId);
  return !!rule && rule.status === 'VALIDATED';
}

function derivationFor(ruleSetContext, resolution, sourceCandidateIds) {
  if (!resolution?.ruleId) return null;
  const rule = ruleFor(ruleSetContext, resolution.ruleId);
  if (!rule || !['DERIVED_COUNT', 'DERIVED_FORMULA', 'OXYGEN_DURATION'].includes(rule.handler)) return null;
  return {
    ruleId: rule.ruleId,
    handler: rule.handler,
    inputs: resolution.evidence?.filter((item) => item.type !== 'RULE') || [],
    formula: rule.output?.formula || (rule.output?.quantityFrom ? { [rule.output.quantityFrom]: 1 } : null),
    outputCode: resolution.output?.finalCode || null,
    outputQuantity: resolution.output?.quantity ?? null,
    sourceCandidateIds
  };
}

function makeReview({ index, candidate, resolution, reasonCode, reason, requiredEvidence = [] }) {
  return {
    reviewId: `review-${String(index).padStart(4, '0')}`,
    candidateId: candidate?.candidateId || resolution?.candidateId || null,
    sourceEvidence: evidenceFromCandidate(candidate, resolution),
    input: inputFromCandidate(candidate, resolution),
    resolution: resolution ? {
      status: resolution.status || null,
      ruleId: resolution.ruleId || null,
      registryEntryId: resolution.registryEntryId || null,
      authorityStatus: resolution.authorityStatus || null,
      output: resolution.output || null
    } : null,
    reasonCode,
    reason,
    requiredEvidence,
    status: REVIEW_STATUS
  };
}

function makeExcluded({ index, candidate, resolution, reasonCode, reason }) {
  return {
    exclusionId: `excluded-${String(index).padStart(4, '0')}`,
    candidateId: candidate?.candidateId || resolution?.candidateId || null,
    sourceEvidence: evidenceFromCandidate(candidate, resolution),
    input: inputFromCandidate(candidate, resolution),
    resolution: resolution ? {
      status: resolution.status || null,
      ruleId: resolution.ruleId || null,
      registryEntryId: resolution.registryEntryId || null,
      authorityStatus: resolution.authorityStatus || null
    } : null,
    reasonCode,
    reason,
    status: EXCLUDED_STATUS
  };
}

function actionGate(candidate, resolution, context) {
  const reasons = [];
  if (!candidate || candidate.status !== 'VALID_EVIDENCE') reasons.push({ code: 'SOURCE_CANDIDATE_NOT_VALID', reason: 'Source candidate is not marked VALID_EVIDENCE.' });
  if (!resolution || !EXECUTABLE_RESOLUTION_STATUSES.has(resolution.status)) reasons.push({ code: resolution?.status || 'RESOLUTION_NOT_VALIDATED', reason: resolution?.reason || 'Resolution status is not validated/direct.' });
  if (resolution?.authorityStatus && !isExecutableAuthority(resolution.authorityStatus)) reasons.push({ code: 'AUTHORITY_UNACCEPTABLE', reason: `Authority ${resolution.authorityStatus} cannot produce executable plan actions.` });
  if (resolution?.ruleId && !isRuleValidated(context.ruleSetContext, resolution.ruleId)) reasons.push({ code: 'RULE_NOT_VALIDATED', reason: `Rule ${resolution.ruleId} is not VALIDATED or is missing.` });
  const finalCode = normalizeCode(resolution?.output?.finalCode || '');
  if (!finalCode) reasons.push({ code: 'FINAL_CODE_MISSING', reason: 'Resolved final code is missing.' });
  if (finalCode && PROTECTED_RAW_ALIAS_CODES.has(finalCode) && !resolution?.ruleId) reasons.push({ code: 'PROTECTED_RAW_ALIAS_REQUIRES_RULE', reason: `Protected raw alias ${finalCode} cannot become a final plan code without an explicit validated rule.` });
  const quantity = validateQuantity(resolution?.output?.quantity);
  if (!quantity.ok) reasons.push({ code: quantity.reasonCode, reason: quantity.reason });
  const unit = resolution?.output?.unit ?? null;
  if (!SUPPORTED_UNITS.has(unit)) reasons.push({ code: 'ACTION_UNIT_UNSUPPORTED', reason: `Unit ${unit} is not supported by the EnhancementPlan schema.` });
  if (Array.isArray(resolution?.conflicts) && resolution.conflicts.length) reasons.push({ code: 'UNRESOLVED_CONFLICT', reason: 'Resolution contains unresolved conflicts.' });
  if (candidate?.billSessionId && candidate.billSessionId !== context.billSessionId) reasons.push({ code: BLOCKING_CODES.CROSS_BILL_DATA_ERROR, reason: 'Candidate billSessionId does not match plan billSessionId.' });
  if (resolution?.billSessionId && resolution.billSessionId !== context.billSessionId) reasons.push({ code: BLOCKING_CODES.CROSS_BILL_DATA_ERROR, reason: 'Resolution billSessionId does not match plan billSessionId.' });
  if (context.registryContext?.registryVersion && resolution?.registryVersion && resolution.registryVersion !== context.registryContext.registryVersion) reasons.push({ code: 'REGISTRY_VERSION_MISMATCH', reason: 'Resolution registry version does not match plan registry context.' });
  if (context.registryContext?.registrySourceHash && resolution?.registrySourceHash && resolution.registrySourceHash !== context.registryContext.registrySourceHash) reasons.push({ code: 'REGISTRY_HASH_MISMATCH', reason: 'Resolution registry hash does not match plan registry context.' });
  if (context.ruleSetContext?.ruleSetVersion && resolution?.ruleSetVersion && resolution.ruleSetVersion !== context.ruleSetContext.ruleSetVersion) reasons.push({ code: 'RULE_SET_VERSION_MISMATCH', reason: 'Resolution rule-set version does not match plan rule-set context.' });
  return { allowed: reasons.length === 0, reasons, quantity: quantity.quantity };
}

function initialPlan({ billSessionId, sourceBillId, parserResult, resolutionResult, registryContext, ruleSetContext, createdAt, parserVersion }) {
  const ruleSetVersion = ruleSetContext?.ruleSetVersion || resolutionResult?.ruleSetVersion || RULE_SET_VERSION;
  return {
    schemaVersion: PLAN_SCHEMA_VERSION,
    planVersion: PLAN_VERSION,
    planId: null,
    billSessionId,
    sourceBillId,
    createdAt,
    registryContext: {
      registryVersion: registryContext?.registryVersion || resolutionResult?.registryVersion || 'NONE',
      registrySourceHash: registryContext?.registrySourceHash || registryContext?.sourceHash || resolutionResult?.registrySourceHash || 'NONE',
      authorityStatus: registryContext?.authorityStatus || resolutionResult?.registryAuthorityStatus || 'UNVERIFIED',
      status: registryContext?.status || null,
      source: registryContext?.source || registryContext?.registrySource || null
    },
    ruleContext: { ruleSetVersion, validatedRules: (ruleSetContext?.rules || []).filter((rule) => rule.status === 'VALIDATED').length },
    createdAgainst: {
      parserVersion: parserVersion || parserResult?.parserVersion || null,
      registryVersion: registryContext?.registryVersion || resolutionResult?.registryVersion || 'NONE',
      registrySourceHash: registryContext?.registrySourceHash || registryContext?.sourceHash || resolutionResult?.registrySourceHash || 'NONE',
      ruleSetVersion
    },
    status: PLAN_STATUSES.BUILDING,
    readiness: PLAN_READINESS.NOT_READY,
    actions: [],
    reviewItems: [],
    excludedItems: [],
    diagnostics: {
      candidateCount: parserResult?.candidateCount ?? parserResult?.candidates?.length ?? 0,
      validatedCount: 0,
      reviewCount: 0,
      excludedCount: 0,
      conflictCount: 0,
      actionCount: 0,
      duplicateCount: 0,
      sourceCandidateIds: (parserResult?.candidates || []).map((candidate) => candidate.candidateId).filter(Boolean),
      blockingReasons: [],
      registryStatus: registryContext?.status || null,
      registryAuthorityStatus: registryContext?.authorityStatus || resolutionResult?.registryAuthorityStatus || 'UNVERIFIED'
    },
    planSha256: null
  };
}

class EnhancementPlanBuilder {
  constructor(options = {}) {
    this.clock = options.clock || (() => new Date());
    this.ruleSetContext = options.ruleSetContext || getDefaultRuleSet();
  }

  build(input = {}) {
    const billSessionId = input.billSessionId || input.parserResult?.billSessionId || input.resolutionResult?.billSessionId || null;
    const sourceBillId = input.sourceBillId || input.source?.sourceBillId || input.source?.source_bill_id || null;
    const createdAt = input.createdAt || nowIso(this.clock);
    const ruleSetContext = input.ruleSetContext || this.ruleSetContext;
    const registryContext = input.registryContext || {};
    const parserResult = input.parserResult || null;
    const resolutionResult = input.resolutionResult || input.resolutionResults || null;

    if (parserResult?.billSessionId && billSessionId && parserResult.billSessionId !== billSessionId) {
      const error = new Error('Candidate/parser billSessionId does not match requested plan billSessionId');
      error.code = BLOCKING_CODES.CROSS_BILL_DATA_ERROR;
      throw error;
    }
    if (resolutionResult?.billSessionId && billSessionId && resolutionResult.billSessionId !== billSessionId) {
      const error = new Error('Resolution billSessionId does not match requested plan billSessionId');
      error.code = BLOCKING_CODES.CROSS_BILL_DATA_ERROR;
      throw error;
    }

    const plan = initialPlan({ billSessionId, sourceBillId, parserResult, resolutionResult, registryContext, ruleSetContext, createdAt, parserVersion: input.parserVersion });
    const blocking = plan.diagnostics.blockingReasons;
    if (!billSessionId) blocking.push({ code: BLOCKING_CODES.MISSING_BILL_SESSION, reason: 'billSessionId is required.' });
    if (!sourceBillId) blocking.push({ code: BLOCKING_CODES.MISSING_SOURCE_BILL, reason: 'sourceBillId is required.' });
    if (!parserResult) blocking.push({ code: BLOCKING_CODES.MISSING_PARSER_RESULT, reason: 'Parser result is required.' });
    if (!resolutionResult) blocking.push({ code: BLOCKING_CODES.MISSING_RESOLUTION_RESULT, reason: 'Resolution result is required.' });
    if (parserResult && !Array.isArray(parserResult.candidates)) blocking.push({ code: BLOCKING_CODES.MISSING_PARSER_RESULT, reason: 'Parser result candidates array is required.' });
    if (resolutionResult && !Array.isArray(resolutionResult.results)) blocking.push({ code: BLOCKING_CODES.INVALID_RESOLUTION_SET, reason: 'Resolution result set is invalid.' });
    if (resolutionResult?.registryVersion && plan.createdAgainst.registryVersion !== 'NONE' && resolutionResult.registryVersion !== plan.createdAgainst.registryVersion) blocking.push({ code: 'REGISTRY_VERSION_MISMATCH', reason: 'Resolution result registry version does not match plan registry context.' });
    if (resolutionResult?.registrySourceHash && plan.createdAgainst.registrySourceHash !== 'NONE' && resolutionResult.registrySourceHash !== plan.createdAgainst.registrySourceHash) blocking.push({ code: 'REGISTRY_HASH_MISMATCH', reason: 'Resolution result registry hash does not match plan registry context.' });
    if (resolutionResult?.ruleSetVersion && resolutionResult.ruleSetVersion !== plan.createdAgainst.ruleSetVersion) blocking.push({ code: 'RULE_SET_VERSION_MISMATCH', reason: 'Resolution result rule-set version does not match plan rule context.' });
    if ((parserResult?.candidates || []).length === 0 && parserResult) blocking.push({ code: BLOCKING_CODES.NO_CANDIDATES, reason: 'Parser result contains zero candidates.' });

    if (blocking.length) return this.finishPlan(plan, ruleSetContext);

    const candidatesById = byCandidateId(parserResult);
    const seenDuplicateKeys = new Map();
    const processedCandidateIds = new Set();
    const pendingActions = [];
    let reviewIndex = 0;
    let excludedIndex = 0;

    for (const resolution of resolutionResult.results) {
      const candidateId = resultCandidateId(resolution);
      const candidate = candidatesById.get(candidateId);
      if (candidate) processedCandidateIds.add(candidate.candidateId);
      if (candidateId && !candidate) {
        reviewIndex += 1;
        plan.reviewItems.push(makeReview({ index: reviewIndex, candidate: null, resolution, reasonCode: 'SOURCE_CANDIDATE_MISSING', reason: 'Resolution references a candidate that is not present in the parser result.', requiredEvidence: ['parser candidate'] }));
        continue;
      }
      if (candidate?.billSessionId && candidate.billSessionId !== billSessionId) {
        const error = new Error('Candidate billSessionId does not match plan billSessionId');
        error.code = BLOCKING_CODES.CROSS_BILL_DATA_ERROR;
        throw error;
      }
      const duplicate = candidate ? duplicateKey(candidate) : null;
      if (duplicate && seenDuplicateKeys.has(duplicate)) {
        excludedIndex += 1;
        plan.excludedItems.push(makeExcluded({ index: excludedIndex, candidate, resolution, reasonCode: 'DUPLICATE_CANDIDATE', reason: `Duplicate of ${seenDuplicateKeys.get(duplicate)} based on identical source evidence/code/quantity.` }));
        plan.diagnostics.duplicateCount += 1;
        continue;
      }
      if (duplicate) seenDuplicateKeys.set(duplicate, candidate.candidateId);

      const excluded = isCandidateExcluded(candidate, resolution);
      if (excluded.excluded) {
        excludedIndex += 1;
        plan.excludedItems.push(makeExcluded({ index: excludedIndex, candidate, resolution, reasonCode: excluded.reasonCode, reason: excluded.reason }));
        continue;
      }

      const gate = actionGate(candidate, resolution, { billSessionId, registryContext, ruleSetContext });
      if (!gate.allowed) {
        reviewIndex += 1;
        const reason = gate.reasons[0] || { code: 'REVIEW_REQUIRED', reason: 'Candidate requires review.' };
        plan.reviewItems.push(makeReview({
          index: reviewIndex,
          candidate,
          resolution,
          reasonCode: reason.code,
          reason: reason.reason,
          requiredEvidence: gate.reasons.map((item) => item.code)
        }));
        continue;
      }

      pendingActions.push({ candidate, resolution, groupKey: actionGroupKey(candidate, resolution), quantity: gate.quantity });
    }

    for (const candidate of parserResult.candidates || []) {
      if (!candidate?.candidateId || processedCandidateIds.has(candidate.candidateId)) continue;
      const excluded = isCandidateExcluded(candidate, null);
      if (excluded.excluded) {
        excludedIndex += 1;
        plan.excludedItems.push(makeExcluded({ index: excludedIndex, candidate, resolution: null, reasonCode: excluded.reasonCode, reason: excluded.reason }));
      } else {
        reviewIndex += 1;
        plan.reviewItems.push(makeReview({ index: reviewIndex, candidate, resolution: null, reasonCode: 'RESOLUTION_MISSING', reason: 'Parser candidate has no corresponding Phase 4 resolution result.', requiredEvidence: ['Phase 4 ResolutionResult'] }));
      }
    }

    const groups = new Map();
    for (const item of pendingActions) {
      const list = groups.get(item.groupKey) || [];
      list.push(item);
      groups.set(item.groupKey, list);
    }

    let actionIndex = 0;
    for (const [groupKey, items] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      actionIndex += 1;
      const first = items[0];
      const totalQuantity = Number(items.reduce((sum, item) => sum + Number(item.quantity), 0).toFixed(3));
      const sourceCandidateIds = items.map((item) => item.candidate.candidateId);
      const actionId = `action-${String(actionIndex).padStart(4, '0')}`;
      const authority = {
        type: first.resolution.ruleId ? 'VALIDATED_RULE' : 'REGISTRY',
        status: first.resolution.authorityStatus || null,
        ruleId: first.resolution.ruleId || null,
        registryEntryId: first.resolution.registryEntryId || null
      };
      const provenance = {
        sourceCandidateIds,
        ruleId: first.resolution.ruleId || null,
        registryEntryId: first.resolution.registryEntryId || null,
        resolutionRunId: resolutionResult.runId || null,
        parserRunId: parserResult.runId || null
      };
      const action = {
        actionId,
        actionType: 'CGHS_ENHANCEMENT_LINE',
        candidateId: first.candidate.candidateId,
        billSessionId,
        finalCode: first.resolution.output.finalCode,
        description: first.candidate.description || first.resolution.input?.description || null,
        quantity: { value: totalQuantity, unit: first.resolution.output.unit || null, precision: 3 },
        authority,
        provenance,
        sourceEvidence: evidenceFromCandidate(first.candidate, first.resolution),
        input: inputFromCandidate(first.candidate, first.resolution),
        resolved: {
          finalCode: first.resolution.output.finalCode,
          quantity: totalQuantity,
          unit: first.resolution.output.unit || null
        },
        resolution: {
          status: first.resolution.status,
          ruleId: first.resolution.ruleId || null,
          registryEntryId: first.resolution.registryEntryId || null,
          authorityStatus: first.resolution.authorityStatus || null,
          ruleSetVersion: first.resolution.ruleSetVersion || ruleSetContext.ruleSetVersion,
          registryVersion: first.resolution.registryVersion || null,
          registrySourceHash: first.resolution.registrySourceHash || null,
          ruleStatus: first.resolution.ruleId ? (ruleFor(ruleSetContext, first.resolution.ruleId)?.status || null) : null
        },
        aggregation: {
          groupKey,
          sourceCandidateIds,
          aggregationMethod: items.length > 1 ? 'SUM_SAME_FINAL_CODE_UNIT_RULE_CONTEXT' : 'SINGLE_CANDIDATE',
          sourceQuantities: items.map((item) => ({ candidateId: item.candidate.candidateId, quantity: item.quantity }))
        },
        derivation: derivationFor(ruleSetContext, first.resolution, sourceCandidateIds),
        state: ACTION_STATES.VALIDATED_ACTION
      };
      plan.actions.push(action);
    }

    return this.finishPlan(plan, ruleSetContext);
  }

  finishPlan(plan, ruleSetContext) {
    plan.diagnostics.validatedCount = plan.actions.length;
    plan.diagnostics.actionCount = plan.actions.length;
    plan.diagnostics.reviewCount = plan.reviewItems.length;
    plan.diagnostics.excludedCount = plan.excludedItems.length;
    plan.diagnostics.conflictCount = plan.reviewItems.filter((item) => item.resolution?.status === RESOLUTION_STATUSES.RULE_CONFLICT || item.reasonCode === RESOLUTION_STATUSES.RULE_CONFLICT).length;

    if (plan.diagnostics.blockingReasons.length) {
      plan.status = PLAN_STATUSES.BLOCKED;
      plan.readiness = PLAN_READINESS.BLOCKED;
    } else if (plan.actions.length && !plan.reviewItems.length && !plan.excludedItems.length) {
      plan.status = PLAN_STATUSES.VALIDATED;
      plan.readiness = PLAN_READINESS.READY_FOR_PORTAL_VALIDATION;
    } else if (plan.actions.length) {
      plan.status = PLAN_STATUSES.VALIDATED_WITH_REVIEW;
      plan.readiness = plan.diagnostics.conflictCount ? PLAN_READINESS.NOT_READY : PLAN_READINESS.READY_FOR_PORTAL_VALIDATION;
    } else {
      plan.status = PLAN_STATUSES.VALIDATED_WITH_REVIEW;
      plan.readiness = PLAN_READINESS.NOT_READY;
    }

    plan.planSha256 = computePlanHash(plan);
    plan.planId = `plan-${plan.planSha256.slice(0, 16)}`;
    plan.planSha256 = computePlanHash(plan);
    const validation = new EnhancementPlanValidator({ ruleSetContext }).validate(plan, { billSessionId: plan.billSessionId, sourceBillId: plan.sourceBillId });
    plan.validation = { status: validation.status, issueCount: validation.issues.length, issues: validation.issues };
    if (!validation.valid && plan.status !== PLAN_STATUSES.BLOCKED) {
      plan.status = PLAN_STATUSES.INVALID;
      plan.readiness = PLAN_READINESS.BLOCKED;
      plan.planSha256 = computePlanHash(plan);
    }
    return plan;
  }
}

function buildEnhancementPlan(input = {}, options = {}) {
  return new EnhancementPlanBuilder(options).build(input);
}

function createPlanSummary(plan) {
  if (!plan) return null;
  return {
    planId: plan.planId || null,
    billSessionId: plan.billSessionId || null,
    sourceBillId: plan.sourceBillId || null,
    status: plan.status || PLAN_STATUSES.NOT_CREATED,
    readiness: plan.readiness || PLAN_READINESS.NOT_READY,
    planVersion: plan.planVersion || PLAN_VERSION,
    planSha256: plan.planSha256 || null,
    parserVersion: plan.createdAgainst?.parserVersion || null,
    registryVersion: plan.registryContext?.registryVersion || null,
    registrySourceHash: plan.registryContext?.registrySourceHash || null,
    ruleSetVersion: plan.ruleContext?.ruleSetVersion || null,
    candidateCount: plan.diagnostics?.candidateCount || 0,
    actionCount: plan.actions?.length || 0,
    reviewCount: plan.reviewItems?.length || 0,
    excludedCount: plan.excludedItems?.length || 0,
    conflictCount: plan.diagnostics?.conflictCount || 0,
    createdAt: plan.createdAt || null
  };
}

module.exports = {
  BLOCKING_CODES,
  PROTECTED_RAW_ALIAS_CODES,
  EnhancementPlanBuilder,
  actionGroupKey,
  buildEnhancementPlan,
  createPlanSummary,
  duplicateKey,
  evidenceFromCandidate,
  inputFromCandidate
};
