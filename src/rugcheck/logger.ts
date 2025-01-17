import { TokenReport } from './types';
import { RugCheckCondition } from './types';
import { config } from '../config';

export function logTokenMetadata(tokenReport: TokenReport) {
  if (config.rug_check.verbose_log) {
    console.log("\n🔍 Token Metadata Debug:");
    console.log("- Token Name:", tokenReport.tokenMeta?.name || "undefined");
    console.log("- Token Symbol:", tokenReport.tokenMeta?.symbol || "undefined");
    console.log("- Token Creator:", tokenReport.creator);
    console.log("- Raw tokenMeta:", JSON.stringify(tokenReport.tokenMeta, null, 2));
    console.log("- fileMeta:", JSON.stringify(tokenReport.fileMeta, null, 2));
  }
}

export function logTokenRisks(tokenReport: TokenReport) {
  console.log("\n🔍 Token Risks:");
  const rugRisks = tokenReport.risks || [{
    name: "Good",
    value: "",
    description: "",
    score: 0,
    level: "good",
  }];
  
  rugRisks.forEach((risk) => {
    console.log(`- ${risk.name}: ${risk.value}`);
  });
}

export function logConditionResults(conditions: RugCheckCondition[]): boolean {
  console.log("\n🔍 Rug Check Conditions:");
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
    console.log(`${status}: ${displayMessage}`);
    
    if (isConditionFailed) {
      hasFailedConditions = true;
    }
  }

  if (hasFailedConditions) {
    console.log("\n❌ Rug Check Failed: One or more conditions did not pass");
  } else {
    console.log("\n✅ All Rug Check conditions passed!");
  }

  return !hasFailedConditions;
}
