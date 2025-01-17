import axios from 'axios';
import { config } from '../config';
import { RugResponseExtended, NewTokenRecord } from '../types';
import { withRetry } from '../utils';
import { TokenReport } from './types';
import { generateRugCheckConditions } from './conditions';
import { logTokenMetadata, logTokenRisks, logConditionResults } from './logger';
import { insertNewToken, selectTokenByNameAndCreator } from '../database';

export async function getRugCheckConfirmed(tokenMint: string): Promise<boolean> {
  return withRetry(async () => {
    try {
      const rugResponse = await axios.get<RugResponseExtended>(
        `https://api.rugcheck.xyz/v1/tokens/${tokenMint}/report`,
        { timeout: config.tx.get_timeout }
      );

      if (!rugResponse.data) return false;

      if (config.rug_check.verbose_log) {
        console.log("\n🔍 Full API Response Debug:");
        console.log(JSON.stringify(rugResponse.data, null, 2));
      }

      const tokenReport = rugResponse.data as TokenReport;

      if (config.rug_check.simulation_mode) {
        console.log("\n🔬 SIMULATION MODE: No actual swaps will be made");
      }

      logTokenMetadata(tokenReport);
      logTokenRisks(tokenReport);

      const conditions = generateRugCheckConditions(tokenReport);

      // Check for duplicate tokens
      if (config.rug_check.block_returning_token_names || config.rug_check.block_returning_token_creators) {
        const duplicate = await selectTokenByNameAndCreator(
          tokenReport.tokenMeta?.name || "",
          tokenReport.creator || tokenMint
        );

        if (duplicate.length !== 0) {
          if (config.rug_check.block_returning_token_names) {
            conditions.push({
              check: duplicate.some((token: NewTokenRecord) => token.name === tokenReport.tokenMeta?.name),
              message: "🚫 Token with this name was already created"
            });
          }
          if (config.rug_check.block_returning_token_creators) {
            conditions.push({
              check: duplicate.some((token: NewTokenRecord) => token.creator === tokenReport.creator),
              message: "🚫 Token from this creator was already created"
            });
          }
        }
      }

      // Store new token for tracking duplicates
      const newToken: NewTokenRecord = {
        time: Date.now(),
        mint: tokenMint,
        name: tokenReport.tokenMeta?.name || "",
        creator: tokenReport.creator || tokenMint,
      };
      
      await insertNewToken(newToken).catch((err: Error) => {
        if (config.rug_check.block_returning_token_names || config.rug_check.block_returning_token_creators) {
          console.log("⛔ Unable to store new token for tracking duplicate tokens: " + err.message);
        }
      });

      return logConditionResults(conditions);
    } catch (error: unknown) {
      console.error("Error in rug check:", error instanceof Error ? error.message : String(error));
      throw error;
    }
  }, config.tx.fetch_tx_max_retries, config.tx.retry_delay);
}
