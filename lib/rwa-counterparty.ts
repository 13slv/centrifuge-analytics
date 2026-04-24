/**
 * Counterparty / service provider mapping per issuer.
 *
 * REGISTRY_VERIFIED_AT: 2026-04-25
 * Sources per issuer:
 *   - securitize: BlackRock prospectus + Securitize fund page
 *   - ondo: docs.ondo.finance + USDY fact sheet
 *   - superstate: docs.superstate.com + fund prospectus
 *   - hashnote: hashnote.com fund pages
 *   - centrifuge: Anemoy Treasury Fund deck (Feb 2025)
 *   - maple: Maple docs (audits.maple.finance)
 *   - paxos: paxos.com/paxgold + monthly attestation reports
 *   - tether: tether.to/en/transparency
 *
 * Refresh cadence: quarterly. Counterparty changes are rare but material.
 * Highlighted shared providers (BNY Mellon, WithumSmith, CIMA, etc.) are
 * computed at runtime by findSharedProviders().
 */

export type ServiceProviders = {
  fund_admin?: string;
  custodian?: string;
  prime_broker?: string;
  transfer_agent?: string;
  auditor?: string;
  legal_counsel?: string;
  oracle?: string;
  jurisdiction?: string;
  regulator?: string;
};

export const COUNTERPARTY: Record<string, ServiceProviders> = {
  securitize: {
    fund_admin: "Securitize Fund Services",
    custodian: "BNY Mellon",
    transfer_agent: "Securitize",
    auditor: "PwC",
    legal_counsel: "Davis Polk",
    oracle: "Securitize (manual)",
    jurisdiction: "British Virgin Islands",
    regulator: "BVI FSC",
  },
  ondo: {
    fund_admin: "NAV Consulting",
    custodian: "Ankura Trust (USDY) / wraps BUIDL (OUSG)",
    transfer_agent: "Ondo Finance Operations",
    auditor: "Ernst & Young",
    legal_counsel: "Latham & Watkins",
    oracle: "Chainlink + Ondo internal feed",
    jurisdiction: "Cayman Islands",
    regulator: "CIMA",
  },
  superstate: {
    fund_admin: "NAV Consulting",
    custodian: "Cantor Fitzgerald",
    prime_broker: "Cantor Fitzgerald",
    transfer_agent: "Superstate",
    auditor: "WithumSmith+Brown",
    oracle: "Chronicle Labs",
    jurisdiction: "Delaware, USA",
    regulator: "SEC (40 Act)",
  },
  hashnote: {
    fund_admin: "Hashnote Fund Services",
    custodian: "State Street",
    auditor: "WithumSmith+Brown",
    oracle: "Chronicle + RedStone",
    jurisdiction: "Cayman Islands",
    regulator: "CIMA",
  },
  centrifuge: {
    fund_admin: "Anemoy Asset Management",
    custodian: "Wall Street Prime Custodian (per fund deck)",
    prime_broker: "Regulated US Prime Broker",
    transfer_agent: "Centrifuge protocol",
    auditor: "Independent fund auditor (per BVI rules)",
    oracle: "Centrifuge V3 NAV publishing + Chronicle",
    jurisdiction: "British Virgin Islands",
    regulator: "BVI FSC",
  },
  maple: {
    fund_admin: "Maple Finance",
    custodian: "Self-custody via smart contract",
    auditor: "Code audit: Spearbit, Three Sigma",
    oracle: "On-chain ERC-4626 (totalAssets)",
    jurisdiction: "BVI / Bermuda (varies per pool)",
    regulator: "n/a (DeFi)",
  },
  paxos: {
    fund_admin: "Paxos Trust",
    custodian: "Paxos National Trust (NYDFS regulated)",
    auditor: "WithumSmith+Brown (monthly attestation)",
    oracle: "Paxos internal + Chainlink",
    jurisdiction: "New York, USA",
    regulator: "NYDFS",
  },
  tether: {
    fund_admin: "Tether Operations",
    custodian: "Swiss vault (unnamed)",
    auditor: "BDO (annual)",
    oracle: "Tether attestation (quarterly)",
    jurisdiction: "El Salvador / British Virgin Islands",
    regulator: "El Salvador NDA",
  },
};

/** Aggregate: which providers serve multiple issuers? Single point of failure. */
export function findSharedProviders(): {
  provider: string;
  field: keyof ServiceProviders;
  issuers: string[];
}[] {
  const map = new Map<string, { field: keyof ServiceProviders; issuers: string[] }>();
  for (const [issuerSlug, providers] of Object.entries(COUNTERPARTY)) {
    for (const [field, value] of Object.entries(providers)) {
      if (!value) continue;
      // normalise — match on prefix to catch variants
      const norm = value.split("(")[0].trim();
      if (norm.length < 3) continue;
      const key = `${field}|${norm}`;
      const cur = map.get(key) ?? { field: field as keyof ServiceProviders, issuers: [] };
      cur.issuers.push(issuerSlug);
      map.set(key, cur);
    }
  }
  return Array.from(map.entries())
    .filter(([, v]) => v.issuers.length > 1)
    .map(([key, v]) => ({
      provider: key.split("|")[1],
      field: v.field,
      issuers: v.issuers,
    }));
}
