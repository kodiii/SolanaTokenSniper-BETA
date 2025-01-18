import { TokenReport } from './types';
import { RugCheckCondition } from './types';
import { config } from '../config';

export interface Logger {
  error(message: string): void;
  info(message: string): void;
  debug(message: string): void;
}

export class RugCheckLogger implements Logger {
  error(message: string): void {
    console.error(message);
  }

  info(message: string): void {
    console.log(message);
  }

  debug(message: string): void {
    if (config.rug_check.verbose_log) {
      console.log(message);
    }
  }
}

export function logTokenMetadata(tokenReport: TokenReport) {
  const logger = new RugCheckLogger();
  logger.debug("\n🔍 Token Metadata Debug:");
  logger.debug(`- Token Name: ${tokenReport.tokenMeta?.name || "undefined"}`);
  logger.debug(`- Token Symbol: ${tokenReport.tokenMeta?.symbol || "undefined"}`);
  logger.debug(`- Token Creator: ${tokenReport.creator}`);
  logger.debug(`- Raw tokenMeta: ${JSON.stringify(tokenReport.tokenMeta, null, 2)}`);
  logger.debug(`- fileMeta: ${JSON.stringify(tokenReport.fileMeta, null, 2)}`);
}

export function logTokenRisks(tokenReport: TokenReport) {
  const logger = new RugCheckLogger();
  logger.info("\n🔍 Token Risks:");
  const rugRisks = tokenReport.risks || [{
    name: "Good",
    value: "",
    description: "",
    score: 0,
    level: "good",
  }];
  
  rugRisks.forEach((risk) => {
    logger.info(`- ${risk.name}: ${risk.value}`);
  });
}

export function logConditionResults(conditions: RugCheckCondition[]): boolean {
  const logger = new RugCheckLogger();
  logger.info("\n🔍 Rug Check Conditions:");
  let hasFailedConditions = false;

  for (const condition of conditions) {
    let isConditionFailed = condition.check;
    let displayMessage = condition.message.replace("🚫 ", "");

    if (displayMessage.startsWith("Token name must contain")) {
      if (!config.rug_check.only_contain_string) {
        continue;
      }
      
      const hasStrings = (condition.foundStrings || []).length > 0;
      displayMessage = hasStrings
        ? `Token name contains required string(s): ${condition.foundStrings!.join(", ")}`
        : `Token name does not contain any required strings: ${config.rug_check.contain_string.join(", ")}`;
      isConditionFailed = !hasStrings;
    }
    
    const status = isConditionFailed ? "❌ FAILED" : "✅ PASSED";
    logger.info(`${status}: ${displayMessage}`);
    
    if (isConditionFailed) {
      hasFailedConditions = true;
    }
  }

  if (hasFailedConditions) {
    logger.error("\n❌ Rug Check Failed: One or more conditions did not pass");
  } else {
    logger.info("\n✅ All Rug Check conditions passed!");
  }

  return !hasFailedConditions;
}
