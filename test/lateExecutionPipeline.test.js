import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("normal pipeline acquires 30-second quotes after slow research and before FINAL readiness", (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "cli-late-execution-"));
  t.after(() => fs.rmSync(cwd, {recursive: true, force: true}));
  const pipelineUrl = new URL("../src/intelligencePipeline.js", import.meta.url).href;
  const routeUrl = new URL("../src/execution/routeTruthV2.js", import.meta.url).href;
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import assert from 'node:assert/strict';
    const originalLog = console.log;
    const logs = [];
    const start = Date.now();
    let now = start;
    let slowPasses = 0;
    Date.now = () => now;
    console.log = (...args) => {
      const message = args.join(' ');
      logs.push(message);
      if (message === 'Running Market Opportunity Learning...') { now += 120000; slowPasses++; }
    };
    globalThis.fetch = async () => { throw new Error('External network is forbidden in the isolated regression'); };
    const {runIntelligencePipeline, shouldRerunEngineForEvidenceFamilies} = await import(${JSON.stringify(pipelineUrl)});
    const {routeQuoteFresh} = await import(${JSON.stringify(routeUrl)});
    const token = '66wLt8u1BmvqWb2Wks7NiVeuvNC9NsmrDUVu777YuHzW';
    const pool = 'GJ2uhUVnzBj96uxp5b2hX9oJ9k6jX5DnwxYxPneNHfNe';
    const usdc = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const candidate = {name: 'Useful infrastructure fixture', symbol: 'JITUTILITY', chain: 'solana',
      tokenAddress: token, contractAddress: token, poolAddress: pool, pairAddress: pool,
      source: 'dexscreener', identityVerified: true, strictIdentityVerified: true,
      priceUsd: 1, liquidityUsd: 200000, volume24hUsd: 100000, deepEvaluationState: 'DEEP_EVALUATED',
      mintAuthorityEnabled: false, freezeAuthorityEnabled: false, instantSafetyStatus: 'PASS',
      securityEvidence: [{provider: 'solana-rpc-rugcheck', status: 'EVIDENCE_AVAILABLE', chain: 'solana',
        address: token, responseIdentityVerified: true, identityVerifiedOnChain: true,
        snapshotTimestampVerified: true, verifiedSource: true, observedAt: new Date(start).toISOString(),
        sourceTimestamp: new Date(Math.floor(start / 1000) * 1000).toISOString(),
        mintRisk: false, freezeRisk: false, testedChecks: ['mint-account identity', 'mint authority', 'freeze authority'],
        raw: {rpc: {genesisHash: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
          ownerProgram: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', observedSlot: 1234,
          blockTimestamp: Math.floor(start / 1000), sourceTimestamp: new Date(Math.floor(start / 1000) * 1000).toISOString(),
          mintAuthority: null, freezeAuthority: null}}}],
      executionProof: {routeType: 'DEX', buyQuoteVerified: false, sellQuoteVerified: false, liveExecutionReady: false}};
    const deferred = {...candidate, name: 'Deferred infrastructure fixture', symbol: 'DEFERRED', chain: 'base',
      tokenAddress: '0x9999999999999999999999999999999999999999',
      contractAddress: '0x9999999999999999999999999999999999999999',
      poolAddress: '0x8888888888888888888888888888888888888888',
      pairAddress: '0x8888888888888888888888888888888888888888', securityEvidence: []};
    let calls = 0;
    const callOrder = [];
    const afterResearch = [];
    const outputs = await runIntelligencePipeline([candidate, deferred], {saveMemory: false, engineProfile: 'tenx',
      progressiveFunnel: true, analysisFunnelSelection: {standard: [candidate, deferred], advanced: [candidate],
        deep: [candidate], crawler: [], llama: [], debate: [], finalist: []},
      scanRunId: 'isolated-late-quote-regression', freeOnly: true, localAI: {enabled: false},
      contractAuthorityRisk: {collectSecurityEvidence: false},
      webResearchAgent: {enabled: false}, externalIntelligence: {enabled: false},
      activeEvidenceRecovery: {now: () => now, maxProviderRequests: 2, useCache: false, walletHistory: false,
        wave1Max: 0, wave2Max: 0, wave3Max: 1,
        providers: {fetch: async () => assert.fail('Unbudgeted HTTP is forbidden')},
        executionRecovery: {env: {}, jupiterApiKey: '', zeroxApiKey: '', lifiEnabled: false, raydiumEnabled: true,
          tradeSizesUsd: [25], raydiumRateBudget: {startedAt: null, requests: 0, retryAt: 0},
          fetchJson: async (url, init) => {
            assert.equal(init.adapter, 'raydium');
            afterResearch.push(logs.includes('Running Utility Quality...') && slowPasses === 1);
            calls++;
            callOrder.push(logs.length);
            const params = new URL(url).searchParams;
            const inputMint = params.get('inputMint');
            const outputMint = params.get('outputMint');
            return {success: true, id: 'quoted-' + calls, data: {swapType: 'BaseIn', inputMint, outputMint,
              inputAmount: params.get('amount'), outputAmount: inputMint === usdc ? '1000000000' : '24750000',
              otherAmountThreshold: inputMint === usdc ? '990000000' : '24502500', slippageBps: 100,
              routePlan: [{poolId: pool, inputMint, outputMint}]}};
          }}}});
    const result = outputs.find(project => project.contractAddress === token);
    const untouched = outputs.find(project => project.contractAddress === deferred.contractAddress);
    assert.equal(untouched.deepEvaluationState, 'DEFERRED_BEFORE_DEEP');
    assert.notEqual(untouched.finalSelectionQualified, true);
    assert.equal(calls, 2);
    assert.ok(logs.includes('Post-Recovery Rerun: Utility Quality on 1/2 recovered candidates'));
    assert.ok(logs.includes('Post-Recovery Rerun: Research Readiness on 1/2 recovered candidates'));
    for (const name of ['Utility Quality', 'Research Readiness']) {
      assert.equal(shouldRerunEngineForEvidenceFamilies(name, []), false);
      for (const family of ['IDENTITY', 'MARKET', 'WALLETS', 'DEPLOYER', 'SECURITY', 'EXECUTION']) {
        assert.equal(shouldRerunEngineForEvidenceFamilies(name, [family]), true);
      }
    }
    assert.equal(result.executionProofRecoveryRoute.source, 'raydium');
    assert.equal(result.executionProof.quoteTimestamp, new Date(start + 120000).toISOString());
    assert.equal(result.executionProof.quoteExpiresAt, new Date(start + 150000).toISOString());
    assert.equal(routeQuoteFresh(result), true);
    assert.ok(afterResearch.every(Boolean), 'The derived utility and slow research passes must precede quotes');
    assert.equal(result.engineDataReadiness.auditPhase, 'FINAL');
    assert.equal(result.activeEvidenceRecovery.batchSummary.providerRequestsUsed, 2);
    const finalReadiness = logs.lastIndexOf('Running Engine Data Readiness...');
    const finalScoring = logs.lastIndexOf('Running Post-Evidence Final Scoring...');
    const finalSelection = logs.lastIndexOf('Running Final Selection Integrity...');
    assert.ok(finalReadiness >= callOrder.at(-1));
    assert.ok(finalScoring > finalReadiness && finalSelection > finalScoring);
    originalLog(JSON.stringify({calls, quoteTimestamp: result.executionProof.quoteTimestamp,
      quoteExpiresAt: result.executionProof.quoteExpiresAt, finalReadiness, finalScoring, finalSelection}));
  `], {cwd, env: {...process.env, SUPABASE_ENABLED: "false", LOCAL_AI_MODE: "OFF",
    FREE_PROVIDER_QUOTES_ENABLED: "false", FORWARD_EVIDENCE_CAPTURE_ENABLED: "false"},
  encoding: "utf8", timeout: 60_000, maxBuffer: 2_000_000});
  assert.equal(child.status, 0, child.stderr || child.stdout);
  const result = JSON.parse(child.stdout.trim());
  assert.equal(result.calls, 2);
});
