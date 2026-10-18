function evmAddress(value) {
  if (typeof value !== "string") return null;
  const address = value.trim().toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(address) ? address : null;
}

// This filters generic participants, not raw holders or transfer endpoints, and does not prove EOA status.
export function createEvmWalletParticipantFilter(...contractAddresses) {
  const excluded = new Set([
    `0x${"0".repeat(40)}`,
    "0x000000000000000000000000000000000000dead",
    ...contractAddresses.map(evmAddress).filter(Boolean),
  ]);
  return (value) => {
    const address = evmAddress(value);
    return address !== null && !excluded.has(address);
  };
}
