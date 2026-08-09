// IAB TCF v2.3 consent string encoder.
// Spec: https://github.com/InteractiveAdvertisingBureau/GDPR-Transparency-and-Consent-Framework
// v2.3 transition notes: https://iabeurope.eu/all-you-need-to-know-about-the-transition-to-tcf-v2-3/
//
// TCF strings are '.'-joined base64url segments, each independently bit-packed
// and byte-padded. For v2.2/v2.3 the Core String layout is unchanged:
//   - Version (6 bits): 2
//   - Created / LastUpdated (36 bits each): deciseconds since epoch
//   - CmpId, CmpVersion, ConsentScreen, ConsentLanguage, VendorListVersion (various)
//   - PurposeConsents (24 bits): one per IAB purpose, 0 = denied
//   - VendorConsents: bit range covering all vendor IDs
//
// v2.3's only encoding change is making the previously-optional Disclosed
// Vendors segment mandatory (enforced by CMPs/vendors from March 1, 2026) so
// vendors can unambiguously tell which publishers exposed them to the user.
// This implementation doesn't model individual vendors (MaxVendorId stays 0
// in the Core String, same as before), so the segment we append is a valid,
// honestly-empty "no vendors disclosed" declaration rather than fabricated
// vendor IDs — enough to keep the string spec-valid post-enforcement without
// claiming vendor-level disclosure data this extension doesn't track.
//
// This implementation produces a minimal but valid TC string.

const IAB_PURPOSES = 10; // purposes 1–10 defined in TCF v2.2/v2.3
const SEGMENT_TYPE_DISCLOSED_VENDORS = 1;

export function buildTCString(prefs) {
  const bits = [];

  const push = (value, length) => {
    for (let i = length - 1; i >= 0; i--) {
      bits.push((value >> i) & 1);
    }
  };

  const deciseconds = (date) => Math.round(date.getTime() / 100);
  const now = new Date();

  push(2, 6);                    // Version
  push(deciseconds(now), 36);    // Created
  push(deciseconds(now), 36);    // LastUpdated
  push(0, 12);                   // CmpId (0 = not a registered CMP)
  push(0, 12);                   // CmpVersion
  push(0, 6);                    // ConsentScreen
  push(encodeLanguage('EN'), 12);// ConsentLanguage
  push(0, 12);                   // VendorListVersion (0 = unspecified)
  push(2, 6);                    // TcfPolicyVersion
  push(0, 1);                    // IsServiceSpecific
  push(0, 1);                    // UseNonStandardStacks
  push(0, 12);                   // SpecialFeatureOptIns
  push(purposeBits(prefs), 24);  // PurposeConsents
  push(0, 24);                   // PurposeLegitimateInterests
  push(0, 1);                    // PurposeOneTreatment
  push(encodeLanguage('AA'), 12);// PublisherCC ('AA' = unknown/global)

  // Vendor consents: range encoding, 0 vendors
  push(0, 16);   // MaxVendorId
  push(0, 1);    // IsRangeEncoding (bitfield)

  const coreSegment = base64urlEncode(bitsToBytes(bits));
  return `${coreSegment}.${buildDisclosedVendorsSegment()}`;
}

// Mandatory as of TCF v2.3. SegmentType(3) + MaxVendorId(16) + IsRangeEncoding(1),
// with MaxVendorId=0 so the bitfield that would follow is zero-length.
function buildDisclosedVendorsSegment() {
  const bits = [];
  const push = (value, length) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >> i) & 1);
  };
  push(SEGMENT_TYPE_DISCLOSED_VENDORS, 3);
  push(0, 16); // MaxVendorId
  push(0, 1);  // IsRangeEncoding (bitfield, zero-length since MaxVendorId is 0)
  return base64urlEncode(bitsToBytes(bits));
}

function purposeBits(prefs) {
  // Purpose 1 = necessary (always granted), 2 = functional, 3-4 = analytics, 5-10 = advertising
  // We set bits left-to-right (purpose 1 = most significant bit of the 24-bit field).
  let field = 0;
  field |= (1 << 23); // purpose 1: strictly necessary — always grant
  if (prefs.functional)   field |= (1 << 22); // purpose 2
  if (prefs.analytics)    field |= (1 << 21) | (1 << 20); // purposes 3–4
  if (prefs.advertising)  field |= (1 << 19) | (1 << 18) | (1 << 17) | (1 << 16); // 5–8
  return field;
}

function encodeLanguage(lang) {
  const a = lang.charCodeAt(0) - 65;
  const b = lang.charCodeAt(1) - 65;
  return (a << 6) | b;
}

function bitsToBytes(bits) {
  const padded = [...bits];
  while (padded.length % 8 !== 0) padded.push(0);
  const bytes = new Uint8Array(padded.length / 8);
  for (let i = 0; i < bytes.length; i++) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | padded[i * 8 + j];
    bytes[i] = byte;
  }
  return bytes;
}

function base64urlEncode(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function buildTCData(prefs) {
  const tcString = buildTCString(prefs);
  return {
    tcString,
    tcfPolicyVersion: 2,
    cmpId: 0,
    cmpVersion: 0,
    gdprApplies: true,
    eventStatus: 'tcloaded',
    cmpStatus: 'loaded',
    isServiceSpecific: false,
    purpose: {
      consents: buildPurposeConsents(prefs),
      legitimateInterests: {},
    },
    vendor: { consents: {}, legitimateInterests: {} },
    publisher: { consents: {}, legitimateInterests: {} },
  };
}

function buildPurposeConsents(prefs) {
  const consents = {};
  consents[1] = true;
  consents[2] = !!prefs.functional;
  consents[3] = !!prefs.analytics;
  consents[4] = !!prefs.analytics;
  for (let i = 5; i <= 10; i++) consents[i] = !!prefs.advertising;
  return consents;
}
