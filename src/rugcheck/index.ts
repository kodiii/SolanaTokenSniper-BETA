import axios from 'axios';
import { config } from '../config';
import { RugResponseExtended, NewTokenRecord } from '../types';
import { withRetry } from '../utils';
import { TokenReport, RugCheckCondition } from './types';
import { logTokenMetadata, logTokenRisks, RugCheckLogger } from './logger';
import { checkRugConditions } from './conditions';
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

      // Convert RugResponseExtended to TokenReport with proper type safety
      const tokenReport: TokenReport = {
        ...rugResponse.data,
        token: {
          ...rugResponse.data.token,
          isInitialized: rugResponse.data.token.isInitialized || false,
          mintAuthority: rugResponse.data.token.mintAuthority || null,
          freezeAuthority: rugResponse.data.token.freezeAuthority || null
        },
        tokenMeta: {
          ...rugResponse.data.tokenMeta,
          mutable: rugResponse.data.tokenMeta?.mutable || false
        },
        topHolders: rugResponse.data.topHolders || [],
        markets: rugResponse.data.markets || [],
        risks: rugResponse.data.risks || [],
        rugged: rugResponse.data.rugged || false,
        creator: rugResponse.data.creator || tokenMint,
        score: rugResponse.data.score
      };

      if (config.rug_check.simulation_mode) {
        console.log("\n🔬 SIMULATION MODE: No actual swaps will be made");
      }

      logTokenMetadata(tokenReport);
      logTokenRisks(tokenReport);

      let conditions: RugCheckCondition[] = checkRugConditions(tokenReport, new RugCheckLogger());

      // Check for duplicate tokens
      if (config.rug_check.block_returning_token_names || config.rug_check.block_returning_token_creators) {
        const duplicate = await selectTokenByNameAndCreator(
          tokenReport.tokenMeta?.name || "",
          tokenReport.creator || tokenMint
        );

        if (duplicate.length !== 0) {
          if (config.rug_check.block_returning_token_names) {
            conditions = conditions.concat({
              check: duplicate.some((token: NewTokenRecord) => token.name === tokenReport.tokenMeta?.name),
              message: "🚫 Token with this name was already created"
            });
          }
          if (config.rug_check.block_returning_token_creators) {
            conditions = conditions.concat({
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

      return conditions.every((condition) => condition.check);
    } catch (error: unknown) {
      console.error("Error in rug check:", error instanceof Error ? error.message : String(error));
      throw error;
    }
  }, config.tx.fetch_tx_max_retries, config.tx.retry_delay);
}
