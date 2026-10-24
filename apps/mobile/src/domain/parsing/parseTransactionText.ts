import { parseRupeesToPaise, type Paise } from '../money';
import {
  parsedTransactionSchema,
  type Direction,
  type Mode,
  type ParsedTransaction,
  type Source,
} from '../transaction';

/* ------------------------------------------------------------------------------------------
 * Rejection rules: anything that is not a completed money movement.
 * ---------------------------------------------------------------------------------------- */

const OTP_RE = /\b(otp|one[\s-]?time\s+pass(word|code)|verification\s+code|passcode)\b/i;

const FUTURE_RE =
  /\bwill\s+be\s+(auto[\s-]?)?(debited|deducted|charged|credited)\b|\b(is|are|payment|amount|bill)\s+due\b|\bdue\s+(on|by|date)\b|\breminder\b|\bscheduled\s+(for|on)\b|\bupcoming\b|\bhas\s+requested\b|\bcollect\s+request\b|\brequested\s+(money|payment|rs|inr|₹)/i;

const FAILED_RE =
  /\b(failed|failure|declined|unsuccessful|rejected|could\s+not\s+be\s+(processed|completed)|insufficient\s+(funds|balance)|not\s+been\s+(processed|completed))\b/i;

const PROMO_RE =
  /\b(pre[\s-]?approved|apply\s+now|offers?|cashback\s+up\s*to|get\s+up\s*to|upto|congratulations|you\s+have\s+won|won|win|eligible\s+for|instant\s+loan|limited\s+period|hurry|scratch\s*card|t&c|tnc)\b/i;

const SETUP_RE =
  /\b(has\s+been|is|was)\s+(successfully\s+)?(set\s*up|registered|created|activated|revoked|cancelled|paused)\b/i;

/* ------------------------------------------------------------------------------------------
 * Field extractors.
 * ---------------------------------------------------------------------------------------- */

const NUM = String.raw`(\d[\d,]*(?:\.\d{1,2})?)`;
const CURRENCY_AMOUNT_RE = new RegExp(String.raw`(?:\brs\.?|\binr\b|₹)\s*${NUM}`, 'gi');
const BARE_AMOUNT_RE = new RegExp(
  String.raw`\b(?:debited|credited|withdrawn)\s+(?:by|for|with)\s+${NUM}`,
  'i',
);
const BALANCE_RE = new RegExp(
  String.raw`\b(?:avl\.?\s*bal(?:ance)?|avbl\.?\s*bal(?:ance)?|available\s+bal(?:ance)?|a\/c\s+bal(?:ance)?|bal(?:ance)?)\b\s*(?:is|:|-|of|rs)?\s*:?\s*(?:rs\.?|inr|₹)?\s*${NUM}`,
  'i',
);
const LIMIT_RE = new RegExp(
  String.raw`\b(?:avl\.?\s*lmt|avl\.?\s*limit|available\s+(?:credit\s+)?limit|credit\s+limit)\b\s*(?:is|:|-|of)?\s*:?\s*(?:rs\.?|inr|₹)?\s*${NUM}`,
  'i',
);

const DEBIT_RE =
  /\b(debited|debit|spent|sent|paid|withdrawn|withdrawal|deducted|purchase|txn\s+of|transaction\s+of|charged|transferred\s+to)\b/i;
const CREDIT_RE = /\b(credited|received|deposited|refund(?:ed)?|reversed\s+to|added\s+to)\b/i;

const ACCOUNT_RE =
  /\b(?:a\/c|a\/c\s+no|ac|acct|account|card)\.?\s*(?:no\.?\s*)?(?:ending\s*(?:with|in)?\s*)?(?:[x*]+\s*)?(\d{3,4})\b/i;
const MASKED_ACCOUNT_RE = /(?:^|[\s(])[x*]{2,}(\d{3,4})\b/i;

const REF_RE =
  /\b(?:upi(?:\s*ref(?:erence)?)?(?:\s*(?:no|number|id))?|imps\s*ref(?:\s*no)?|ref(?:erence)?(?:\s*(?:no|number|id))?|refno|rrn|utr(?:\s*no)?|txn\s*id|transaction\s*id)\b[\s.:#-]*(\d{9,18})\b/i;
const SLASH_REF_RE = /\bUPI\/[A-Z0-9]+\/(\d{9,18})\b/i;

const VPA_RE = /\b([a-z0-9][a-z0-9._-]{1,63}@[a-z][a-z0-9]{1,31})\b(?!\.[a-z])/i;

const MERCHANT_STOP = String.raw`(?=\s+(?:on|via|using|ref|refno|txn|for|avl|avbl|bal|upi|thru|through|from|is|was|dated|at|in|by|not)\b|[,;:(]|\.(?=\s|$)|\s*$)`;
const MERCHANT_BODY = String.raw`([A-Za-z0-9][A-Za-z0-9 &'._@*-]{1,60}?)`;
const AT_MERCHANT_RE = new RegExp(String.raw`\bat\s+${MERCHANT_BODY}${MERCHANT_STOP}`, 'gi');
const TO_MERCHANT_RE = new RegExp(
  String.raw`\b(?:trf\s+to|paid\s+to|sent\s+to|towards|to)\s+(?:vpa\s+)?${MERCHANT_BODY}${MERCHANT_STOP}`,
  'gi',
);
const FROM_MERCHANT_RE = new RegExp(
  String.raw`\b(?:from|by)\s+(?:vpa\s+)?${MERCHANT_BODY}${MERCHANT_STOP}`,
  'gi',
);
const SLASH_MERCHANT_RE =
  /\bUPI\/[A-Z0-9]+\/\d{9,18}\/([A-Za-z0-9 .&'-]{2,40}?)(?=\/|\s+(?:not|axis|bank|avl|sms)\b|\s*-|\s*$|[.,])/i;
const ICICI_CREDITED_RE = /;\s*([A-Za-z0-9][A-Za-z0-9 .&'@_-]{1,40}?)\s+credited\b/i;
const INFO_RE =
  /\binfo[:\s-]+(?:(?:upi|neft|imps|rtgs|ach|nach)[-/:])?([A-Za-z0-9][A-Za-z0-9 .&'-]{1,40}?)(?=\.(?:\s|$)|\/|\s*$)/i;
const ON_MERCHANT_RE = new RegExp(String.raw`\bon\s+${MERCHANT_BODY}${MERCHANT_STOP}`, 'gi');
const TIMESTAMP_LINE_RE = /^\d{2}-\d{2}-\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*IST)?$/i;
const NOT_LINE_MERCHANT_RE = /^(?:upi\/|avl|sms|not\s+you|axis|inr|rs|card|a\/c)/i;

const NOT_A_MERCHANT_RE =
  /^(?:your\s+|the\s+)?(?:a\/c|ac|acct|account|card|bank|beneficiary|mobile|phone|your|you|self|imps|neft|upi|rs|inr)\b|^(?:rs\.?|inr|₹)\s*\d|^\d|\b(?:a\/c|acct|account)\b|\bbank\s+(?:a\/c|ac|card)\b/i;

interface AmountHit {
  paise: Paise;
  index: number;
}

function findCurrencyAmounts(text: string): AmountHit[] {
  const hits: AmountHit[] = [];
  for (const m of text.matchAll(CURRENCY_AMOUNT_RE)) {
    const paise = m[1] ? parseRupeesToPaise(m[1]) : null;
    if (paise !== null && m.index !== undefined) hits.push({ paise, index: m.index });
  }
  return hits;
}

function rangeOf(
  re: RegExp,
  text: string,
): { start: number; end: number; value: Paise | null } | null {
  const m = re.exec(text);
  if (!m || m.index === undefined) return null;
  return {
    start: m.index,
    end: m.index + m[0].length,
    value: m[1] ? parseRupeesToPaise(m[1]) : null,
  };
}

function detectDirection(text: string): Direction | null {
  const d = DEBIT_RE.exec(text);
  const c = CREDIT_RE.exec(text);
  if (d && c) return d.index <= c.index ? 'debit' : 'credit';
  if (d) return 'debit';
  if (c) return 'credit';
  return null;
}

function detectMode(text: string, vpa: string | null): Mode {
  if (
    /\b(auto[\s-]?pay|auto[\s-]?debit|autodebit|nach|ecs|e-?mandate|mandate|standing\s+instruction|si\s+txn)\b/i.test(
      text,
    )
  )
    return 'AUTOPAY';
  if (/\b(atm|cash\s+withdrawal|withdrawn|withdrawal)\b/i.test(text)) return 'ATM';
  if (/\bupi\b|\bvpa\b/i.test(text) || vpa) return 'UPI';
  if (/\bimps\b/i.test(text)) return 'IMPS';
  if (/\b(neft|rtgs)\b/i.test(text)) return 'NEFT';
  if (/\b(card|pos|swiped?)\b/i.test(text)) return 'CARD';
  return 'OTHER';
}

function cleanMerchant(raw: string): string | null {
  const value = raw
    .replace(/^vpa\s+/i, '')
    .replace(/[\s*_.-]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (value.length < 2 || NOT_A_MERCHANT_RE.test(value) || /^\d[\d:/.-]*$/.test(value)) return null;
  return value;
}

function firstMerchant(re: RegExp, text: string): string | null {
  for (const m of text.matchAll(re)) {
    const candidate = m[1] ? cleanMerchant(m[1]) : null;
    if (candidate) return candidate;
  }
  return null;
}

function firstGroup(re: RegExp, text: string): string | null {
  const m = re.exec(text);
  return m?.[1] ? cleanMerchant(m[1]) : null;
}

/** Axis-style alerts put the merchant on its own line right after the timestamp line. */
function merchantAfterTimestampLine(lines: readonly string[]): string | null {
  const i = lines.findIndex((l) => TIMESTAMP_LINE_RE.test(l));
  const next = i >= 0 ? lines[i + 1] : undefined;
  if (!next || NOT_LINE_MERCHANT_RE.test(next)) return null;
  return cleanMerchant(next);
}

function extractMerchant(
  text: string,
  lines: readonly string[],
  direction: Direction,
  vpa: string | null,
): string | null {
  const structured =
    firstGroup(SLASH_MERCHANT_RE, text) ??
    merchantAfterTimestampLine(lines) ??
    (direction === 'debit' ? firstGroup(ICICI_CREDITED_RE, text) : null);
  if (structured) return structured;

  const ordered: RegExp[] =
    direction === 'debit'
      ? [AT_MERCHANT_RE, TO_MERCHANT_RE, ON_MERCHANT_RE]
      : [FROM_MERCHANT_RE, AT_MERCHANT_RE];
  for (const re of ordered) {
    const found = firstMerchant(re, text);
    if (found) return found;
  }
  return firstGroup(INFO_RE, text) ?? vpa;
}

/**
 * Core parser shared by SMS and notification sources. Pure; never returns raw text.
 * Returns null for anything that is not a completed transaction.
 */
export function parseTransactionText(
  body: string,
  occurredAt: number,
  source: Source,
): ParsedTransaction | null {
  const lines = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const text = body.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  if ([OTP_RE, FUTURE_RE, FAILED_RE, PROMO_RE, SETUP_RE].some((re) => re.test(text))) return null;

  const direction = detectDirection(text);
  if (!direction) return null;

  const balance = rangeOf(BALANCE_RE, text);
  const limit = rangeOf(LIMIT_RE, text);
  const inRange = (i: number, r: { start: number; end: number } | null) =>
    r !== null && i >= r.start && i < r.end;

  const txnHit = findCurrencyAmounts(text).find(
    (hit) => !inRange(hit.index, balance) && !inRange(hit.index, limit),
  );
  const bare = BARE_AMOUNT_RE.exec(text);
  const amountPaise = txnHit?.paise ?? (bare?.[1] ? parseRupeesToPaise(bare[1]) : null);
  if (amountPaise === null || amountPaise <= 0) return null;

  const vpaMatch = VPA_RE.exec(text);
  const vpa = vpaMatch?.[1]?.toLowerCase() ?? null;

  const accountMatch = ACCOUNT_RE.exec(text) ?? MASKED_ACCOUNT_RE.exec(text);
  const refMatch = SLASH_REF_RE.exec(text) ?? REF_RE.exec(text);

  const candidate: ParsedTransaction = {
    amountPaise,
    direction,
    accountLast4: accountMatch?.[1]?.slice(-4) ?? null,
    merchant: extractMerchant(text, lines, direction, vpa),
    vpa,
    mode: detectMode(text, vpa),
    upiRef: refMatch?.[1] ?? null,
    balancePaise: balance?.value ?? null,
    occurredAt,
    source,
  };

  const parsed = parsedTransactionSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}
