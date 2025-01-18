import { config } from '../config';
import { TokenReport, RugCheckConfig, RugCheckCondition } from './types';
import { Logger, RugCheckLogger } from './logger';

export function checkRugConditions(tokenReport: TokenReport, logger: Logger = new RugCheckLogger()): RugCheckCondition[] {
  const rugCheckConfig = config.rug_check as RugCheckConfig;

  const conditions: RugCheckCondition[] = [
    {
      check: !!(!rugCheckConfig.allow_mint_authority && tokenReport.token.mintAuthority !== null),
      message: "Mint authority should be null",
    },
    {
      check: !!(!rugCheckConfig.allow_not_initialized && !tokenReport.token.isInitialized),
      message: "Token is not initialized",
    },
    {
      check: !!(!rugCheckConfig.allow_freeze_authority && tokenReport.token.freezeAuthority !== null),
      message: "Freeze authority should be null",
    },
    {
      check: !!(!rugCheckConfig.allow_mutable && tokenReport.tokenMeta?.mutable !== false),
      message: "Mutable should be false",
    },
    {
      check: !!(!rugCheckConfig.allow_insider_topholders && tokenReport.topHolders?.some((holder) => holder.insider)),
      message: "Insider accounts should not be part of the top holders",
    },
    {
      check: !!(tokenReport.topHolders?.some((holder) => holder.pct > rugCheckConfig.max_alowed_pct_all_topholders)),
      message: "An individual top holder cannot hold more than the allowed percentage of the total supply",
    },
    {
      check: !!(tokenReport.totalLPProviders < rugCheckConfig.min_total_lp_providers),
      message: `Not enough LP Providers: ${tokenReport.totalLPProviders}`,
    },
    {
      check: !!((tokenReport.markets?.length || 0) < rugCheckConfig.min_total_markets),
      message: `Not enough Markets: ${tokenReport.markets?.length || 0}`,
    },
    {
      check: !!(tokenReport.totalMarketLiquidity < rugCheckConfig.min_total_market_Liquidity),
      message: `Not enough Market Liquidity: ${tokenReport.totalMarketLiquidity}`,
    },
    {
      check: !!(!rugCheckConfig.allow_rugged && tokenReport.rugged),
      message: "Token is rugged",
    },
    {
      check: !!(rugCheckConfig.block_symbols.includes(tokenReport.tokenMeta?.symbol || "")),
      message: `Symbol is blocked: ${tokenReport.tokenMeta?.symbol}`,
    },
    {
      check: !!(rugCheckConfig.block_names.includes(tokenReport.tokenMeta?.name || "")),
      message: `Name is blocked: ${tokenReport.tokenMeta?.name}`,
    },
    {
      check: !!(rugCheckConfig.only_contain_string && (() => {
        const tokenName = tokenReport.tokenMeta?.name || "";
        const foundStrings = rugCheckConfig.contain_string.filter(str => 
          tokenName.toLowerCase().includes(str.toLowerCase())
        );
        return foundStrings.length === 0;
      })()),
      message: "Token name must contain one of these strings: " + rugCheckConfig.contain_string.join(", "),
    },
    {
      check: tokenReport.score > rugCheckConfig.max_score && rugCheckConfig.max_score !== 0,
      message: `Rug score is ${tokenReport.score} which is higher than the allowed maximum of ${rugCheckConfig.max_score}`,
    },
    {
      check: tokenReport.score < rugCheckConfig.min_score,
      message: `Rug score is ${tokenReport.score} which is lower than the required minimum of ${rugCheckConfig.min_score}`,
    },
    {
      check: rugCheckConfig.legacy_not_allowed?.some((risk) => 
        tokenReport.risks?.some(r => r.name === risk)
      ),
      message: "Token has legacy risks that are not allowed: " + 
        tokenReport.risks
          ?.filter(risk => rugCheckConfig.legacy_not_allowed?.includes(risk.name))
          .map(risk => `${risk.name} (${risk.value})`)
          .join(", "),
    },
  ];

  for (const condition of conditions) {
    if (condition.check) {
      logger.error(condition.message);
    }
  }

  return conditions;
}
