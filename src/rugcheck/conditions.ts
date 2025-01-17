import { RugCheckCondition } from './types';
import { TokenReport } from './types';
import { config } from '../config';

export function generateRugCheckConditions(tokenReport: TokenReport): RugCheckCondition[] {
  const rugCheckConfig = config.rug_check;
  let topHolders = tokenReport.topHolders;
  
  if (rugCheckConfig.exclude_lp_from_topholders && tokenReport.markets) {
    const liquidityAddresses = tokenReport.markets
      .flatMap(market => [market.liquidityA, market.liquidityB])
      .filter((address): address is string => !!address);
    topHolders = topHolders.filter(holder => !liquidityAddresses.includes(holder.address));
  }

  return [
    {
      check: !rugCheckConfig.allow_mint_authority && tokenReport.token.mintAuthority !== null,
      message: "🚫 Security Risk: Token has an active mint authority, which could allow unlimited token creation",
    },
    {
      check: !rugCheckConfig.allow_not_initialized && !tokenReport.token.isInitialized,
      message: "🚫 Initialization Error: Token account is not properly initialized on the blockchain",
    },
    {
      check: !rugCheckConfig.allow_freeze_authority && tokenReport.token.freezeAuthority !== null,
      message: "🚫 Control Risk: Token has a freeze authority that can block token transfers",
    },
    {
      check: !rugCheckConfig.allow_mutable && tokenReport.tokenMeta?.mutable !== false,
      message: "🚫 Mutability Concern: Token metadata can be altered after creation",
    },
    {
      check: !rugCheckConfig.allow_insider_topholders && topHolders.some((holder) => holder.insider),
      message: "🚫 Insider Ownership Alert: Insider accounts are among the top token holders",
    },
    {
      check: topHolders.some((holder) => holder.pct > rugCheckConfig.max_alowed_pct_topholders),
      message: `🚫 Concentration Risk: A single holder controls more than ${rugCheckConfig.max_alowed_pct_topholders}% of the total supply`,
    },
    {
      check: topHolders.reduce((sum, holder) => sum + holder.pct, 0) > rugCheckConfig.max_alowed_pct_all_topholders,
      message: `🚫 Ownership Centralization: Top holders control ${topHolders.reduce((sum, holder) => sum + holder.pct, 0).toFixed(2)}%, exceeding the ${rugCheckConfig.max_alowed_pct_all_topholders}% safety threshold`,
    },
    {
      check: tokenReport.totalLPProviders < rugCheckConfig.min_total_lp_providers,
      message: `🚫 Liquidity Concern: Insufficient liquidity providers (${tokenReport.totalLPProviders}) for stable trading`,
    },
    {
      check: (tokenReport.markets?.length || 0) < rugCheckConfig.min_total_markets,
      message: `🚫 Market Availability Issue: Limited market presence (${tokenReport.markets?.length || 0} markets)`,
    },
    {
      check: tokenReport.totalMarketLiquidity < rugCheckConfig.min_total_market_Liquidity,
      message: `🚫 Liquidity Depth Warning: Total market liquidity ($${tokenReport.totalMarketLiquidity.toFixed(2)}) below recommended threshold`,
    },
    {
      check: !rugCheckConfig.allow_rugged && tokenReport.rugged,
      message: "🚫 Rug Pull Detection: Token has been identified as potentially compromised",
    },
    {
      check: rugCheckConfig.block_symbols.includes(tokenReport.tokenMeta?.symbol || ""),
      message: `🚫 Blocked Symbol: Token symbol '${tokenReport.tokenMeta?.symbol}' is on the prohibited list`,
    },
    {
      check: rugCheckConfig.block_names.includes(tokenReport.tokenMeta?.name || ""),
      message: `🚫 Blocked Name: Token name '${tokenReport.tokenMeta?.name}' is on the prohibited list`,
    },
    generateTokenNameCondition(tokenReport),
    {
      check: tokenReport.score > rugCheckConfig.max_score && rugCheckConfig.max_score !== 0,
      message: `🚫 Rug score is ${tokenReport.score} which is higher than the allowed maximum of ${rugCheckConfig.max_score}`,
    },
    generateLegacyRisksCondition(tokenReport),
  ];
}

function generateTokenNameCondition(tokenReport: TokenReport): RugCheckCondition {
  const rugCheckConfig = config.rug_check;
  const foundStrings = rugCheckConfig.contain_string.filter(str => 
    tokenReport.tokenMeta?.name?.toLowerCase().includes(str.toLowerCase())
  );

  return {
    check: rugCheckConfig.only_contain_string && foundStrings.length === 0,
    message: "🚫 Token name must contain one of these strings: " + rugCheckConfig.contain_string.join(", "),
    foundStrings,
  };
}

function generateLegacyRisksCondition(tokenReport: TokenReport): RugCheckCondition {
  const rugCheckConfig = config.rug_check;
  return {
    check: rugCheckConfig.legacy_not_allowed && tokenReport.risks.some((risk) => 
      rugCheckConfig.legacy_not_allowed.includes(risk.name)
    ),
    message: "🚫 Token has legacy risks that are not allowed: " + 
      tokenReport.risks
        .filter(risk => rugCheckConfig.legacy_not_allowed.includes(risk.name))
        .map(risk => `${risk.name} (${risk.value})`)
        .join(", "),
  };
}
